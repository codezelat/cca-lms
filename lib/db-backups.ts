import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DB_BACKUP_CRON,
  DB_BACKUP_SCHEDULE_DESCRIPTION,
  getDbBackupSlotDeadline,
  getMostRecentDbBackupSlot,
} from "@/lib/db-backup-schedule";

const DEFAULT_PREFIX = "db-backups";
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_WORKFLOW_FILE = "db-backup.yml";
const DEFAULT_WORKFLOW_REF = "main";

function normalizePrefix(prefix: string) {
  return prefix.replace(/^\/+|\/+$/g, "");
}

export function getDbBackupPrefix() {
  return normalizePrefix(process.env.DB_BACKUP_PREFIX || DEFAULT_PREFIX);
}

export function getDbBackupRetentionDays() {
  const raw = Number.parseInt(
    process.env.DB_BACKUP_RETENTION_DAYS || `${DEFAULT_RETENTION_DAYS}`,
    10,
  );

  if (Number.isNaN(raw) || raw <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }

  return raw;
}

function getBackupBucketName() {
  return process.env.DB_BACKUP_BUCKET_NAME || process.env.R2_BUCKET_NAME;
}

function getBackupR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 credentials. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }

  return new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export interface DatabaseBackupArtifact {
  key: string;
  fileName: string;
  sizeBytes: number;
  sizeMB: string;
  lastModified: string;
  ageInDays: number;
  downloadPath: string;
}

export interface BackupWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  event: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  runNumber: number;
  branch: string;
  actor: string | null;
}

export interface BackupSystemConfig {
  prefix: string;
  bucketName?: string;
  usesDedicatedBucket: boolean;
  retentionDays: number;
  schedule: string;
  scheduleDescription: string;
  storageConfigured: boolean;
  workflowConfigured: boolean;
  workflowRepository?: string;
  workflowFile?: string;
  workflowRef?: string;
  warnings: string[];
}

export interface DatabaseBackupsOverview {
  config: BackupSystemConfig;
  health: {
    status: "healthy" | "warning" | "error";
    message: string;
  };
  latestBackup: DatabaseBackupArtifact | null;
  backups: DatabaseBackupArtifact[];
  totalBackups: number;
  totalSizeBytes: number;
  totalSizeMB: string;
  workflow: {
    latestRun: BackupWorkflowRun | null;
    recentRuns: BackupWorkflowRun[];
  };
}

interface GitHubBackupConfig {
  repository?: string;
  workflowFile: string;
  ref: string;
  token?: string;
}

function getGitHubBackupConfig(): GitHubBackupConfig {
  return {
    repository: process.env.GITHUB_BACKUP_REPOSITORY,
    workflowFile: process.env.GITHUB_BACKUP_WORKFLOW_FILE || DEFAULT_WORKFLOW_FILE,
    ref: process.env.GITHUB_BACKUP_REF || DEFAULT_WORKFLOW_REF,
    token: process.env.GITHUB_BACKUP_TOKEN,
  };
}

function isStorageConfigured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      getBackupBucketName(),
  );
}

function isWorkflowConfigured() {
  const config = getGitHubBackupConfig();
  return Boolean(config.repository && config.workflowFile && config.ref && config.token);
}

function getWarnings(): string[] {
  const warnings: string[] = [];

  if (!isStorageConfigured()) {
    warnings.push(
      "Cloudflare R2 backup storage is not fully configured. Backups cannot be listed or downloaded until R2 credentials are set.",
    );
  }

  if (process.env.R2_PUBLIC_URL && !process.env.DB_BACKUP_BUCKET_NAME) {
    warnings.push(
      "R2_PUBLIC_URL is configured for file delivery. Use a separate private DB_BACKUP_BUCKET_NAME so backup archives are not stored in the public-facing bucket.",
    );
  }

  const workflowConfig = getGitHubBackupConfig();
  if (!workflowConfig.repository) {
    warnings.push(
      "GITHUB_BACKUP_REPOSITORY is missing. The admin page cannot inspect workflow runs or trigger manual backups.",
    );
  }
  if (!workflowConfig.token) {
    warnings.push(
      "GITHUB_BACKUP_TOKEN is missing. Manual backup runs and workflow status checks are disabled.",
    );
  }

  return warnings;
}

function buildConfig(): BackupSystemConfig {
  const workflow = getGitHubBackupConfig();

  return {
    prefix: getDbBackupPrefix(),
    bucketName: getBackupBucketName(),
    usesDedicatedBucket: Boolean(process.env.DB_BACKUP_BUCKET_NAME),
    retentionDays: getDbBackupRetentionDays(),
    schedule: DB_BACKUP_CRON,
    scheduleDescription: DB_BACKUP_SCHEDULE_DESCRIPTION,
    storageConfigured: isStorageConfigured(),
    workflowConfigured: isWorkflowConfigured(),
    workflowRepository: workflow.repository,
    workflowFile: workflow.workflowFile,
    workflowRef: workflow.ref,
    warnings: getWarnings(),
  };
}

function isBackupArchiveKey(key: string) {
  return key.startsWith(`${getDbBackupPrefix()}/`) && key.endsWith(".zip");
}

export async function listDatabaseBackups(): Promise<DatabaseBackupArtifact[]> {
  if (!isStorageConfigured()) {
    return [];
  }

  const client = getBackupR2Client();
  const bucket = getBackupBucketName();
  if (!bucket) {
    return [];
  }
  const prefix = `${getDbBackupPrefix()}/`;
  const backups: DatabaseBackupArtifact[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents || []) {
      if (!object.Key || !object.LastModified || object.Size === undefined) {
        continue;
      }

      if (!isBackupArchiveKey(object.Key)) {
        continue;
      }

      const ageInDays = Math.floor(
        (Date.now() - object.LastModified.getTime()) / (1000 * 60 * 60 * 24),
      );

      backups.push({
        key: object.Key,
        fileName: object.Key.split("/").pop() || object.Key,
        sizeBytes: object.Size,
        sizeMB: (object.Size / 1024 / 1024).toFixed(2),
        lastModified: object.LastModified.toISOString(),
        ageInDays,
        downloadPath: `/api/admin/backups/download?key=${encodeURIComponent(object.Key)}`,
      });
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return backups.sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
  );
}

async function fetchGitHubApi<T>(path: string): Promise<T> {
  const config = getGitHubBackupConfig();

  if (!config.token) {
    throw new Error("GITHUB_BACKUP_TOKEN is not configured.");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

interface GitHubWorkflowRunResponse {
  workflow_runs: Array<{
    id: number;
    status: string;
    conclusion: string | null;
    event: string;
    created_at: string;
    updated_at: string;
    html_url: string;
    run_number: number;
    head_branch: string;
    actor?: {
      login?: string;
    } | null;
  }>;
}

export async function getRecentBackupWorkflowRuns(
  limit = 5,
  event?: string,
): Promise<BackupWorkflowRun[]> {
  const config = getGitHubBackupConfig();

  if (!config.repository || !config.token) {
    return [];
  }

  const params = new URLSearchParams({
    per_page: String(limit),
    branch: config.ref,
  });
  if (event) {
    params.set("event", event);
  }

  const response = await fetchGitHubApi<GitHubWorkflowRunResponse>(
    `/repos/${config.repository}/actions/workflows/${encodeURIComponent(config.workflowFile)}/runs?${params.toString()}`,
  );

  return response.workflow_runs.map((run) => ({
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    htmlUrl: run.html_url,
    runNumber: run.run_number,
    branch: run.head_branch,
    actor: run.actor?.login || null,
  }));
}

export async function getDatabaseBackupsOverview(): Promise<DatabaseBackupsOverview> {
  const config = buildConfig();
  const [backups, workflowRuns, scheduledRuns] = await Promise.all([
    listDatabaseBackups(),
    getRecentBackupWorkflowRuns().catch(() => []),
    getRecentBackupWorkflowRuns(3, "schedule").catch(() => []),
  ]);

  const latestBackup = backups[0] || null;
  const latestRun = workflowRuns[0] || null;
  const latestScheduledRun = scheduledRuns[0] || null;
  const totalSizeBytes = backups.reduce((sum, backup) => sum + backup.sizeBytes, 0);

  const health = (() => {
    if (!config.storageConfigured) {
      return {
        status: "error" as const,
        message: "R2 backup storage is not configured.",
      };
    }

    if (!latestBackup) {
      return {
        status: "warning" as const,
        message: "No database backup archives have been uploaded yet.",
      };
    }

    if (latestBackup.ageInDays > 1) {
      return {
        status: "warning" as const,
        message: `The latest backup is ${latestBackup.ageInDays} days old.`,
      };
    }

    if (latestRun && latestRun.status !== "completed") {
      return {
        status: "warning" as const,
        message: "A backup workflow run is currently in progress.",
      };
    }

    const mostRecentScheduledSlot = getMostRecentDbBackupSlot();
    const scheduledDeadline = getDbBackupSlotDeadline(mostRecentScheduledSlot);
    const latestScheduledRunTime = latestScheduledRun
      ? new Date(latestScheduledRun.createdAt).getTime()
      : 0;
    const scheduledRunCovered =
      latestScheduledRunTime >= mostRecentScheduledSlot.getTime();

    if (
      Date.now() >= scheduledDeadline.getTime() &&
      !scheduledRunCovered
    ) {
      return {
        status: "warning" as const,
        message: "The scheduled backup for today has not run yet.",
      };
    }

    if (latestScheduledRun?.conclusion === "failure") {
      return {
        status: "warning" as const,
        message: "The latest scheduled backup run failed. Review the workflow logs.",
      };
    }

    return {
      status: "healthy" as const,
      message: "Daily database backups are healthy.",
    };
  })();

  return {
    config,
    health,
    latestBackup,
    backups,
    totalBackups: backups.length,
    totalSizeBytes,
    totalSizeMB: (totalSizeBytes / 1024 / 1024).toFixed(2),
    workflow: {
      latestRun,
      recentRuns: workflowRuns,
    },
  };
}

export async function triggerDatabaseBackupWorkflow(triggeredBy: string) {
  const config = getGitHubBackupConfig();

  if (!config.repository || !config.token) {
    throw new Error(
      "GitHub backup workflow is not configured. Set GITHUB_BACKUP_REPOSITORY and GITHUB_BACKUP_TOKEN.",
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/actions/workflows/${encodeURIComponent(config.workflowFile)}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: config.ref,
        inputs: {
          triggered_by: triggeredBy,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub workflow dispatch failed (${response.status}): ${errorText}`);
  }

  return {
    queued: true,
    repository: config.repository,
    workflowFile: config.workflowFile,
    ref: config.ref,
  };
}

export async function getDatabaseBackupDownloadUrl(key: string) {
  if (!isBackupArchiveKey(key)) {
    throw new Error("Invalid backup key requested.");
  }

  const bucket = getBackupBucketName();
  if (!bucket) {
    throw new Error("Backup bucket is not configured.");
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getS3SignedUrl(getBackupR2Client(), command, { expiresIn: 300 });
}

export interface BackupReportPayload {
  status: "success" | "failure";
  artifactKey?: string;
  artifactSizeBytes?: number;
  artifactChecksum?: string;
  durationMs?: number;
  cleanupDeletedCount?: number;
  cleanupDeletedKeys?: string[];
  workflowRunUrl?: string;
  workflowRunId?: string;
  triggeredBy?: string;
  error?: string;
}

export function isValidBackupReport(payload: unknown): payload is BackupReportPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return candidate.status === "success" || candidate.status === "failure";
}
