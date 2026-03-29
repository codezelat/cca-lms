import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import JSZip from "jszip";

const DEFAULT_PREFIX = "db-backups";
const DEFAULT_RETENTION_DAYS = 14;

interface BackupFileEntry {
  name: string;
  sizeBytes: number;
  sha256: string;
}

interface BackupManifest {
  version: string;
  createdAt: string;
  retentionDays: number;
  prefix: string;
  source: "postgres-tools";
  repository: string | null;
  runId: string | null;
  commitSha: string | null;
  actor: string | null;
  triggeredBy: string | null;
  schemaScope: string[];
  notes: string[];
  files: BackupFileEntry[];
}

function normalizePrefix(prefix: string) {
  return prefix.replace(/^\/+|\/+$/g, "");
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function getRequiredBucketName() {
  const value = process.env.DB_BACKUP_BUCKET_NAME || process.env.R2_BUCKET_NAME;
  if (!value) {
    throw new Error("DB_BACKUP_BUCKET_NAME or R2_BUCKET_NAME is required.");
  }
  return value;
}

function getRetentionDays() {
  const value = Number.parseInt(
    process.env.DB_BACKUP_RETENTION_DAYS || `${DEFAULT_RETENTION_DAYS}`,
    10,
  );

  if (Number.isNaN(value) || value <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }

  return value;
}

function createR2Client() {
  return new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: `https://${getRequiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function loadBackupFiles(backupDir: string) {
  const requiredFiles = ["schema.sql", "data.sql"];
  const optionalFiles = ["roles.sql"];
  const entries: Array<{ name: string; buffer: Buffer; sizeBytes: number; sha256: string }> = [];

  for (const fileName of [...requiredFiles, ...optionalFiles]) {
    const absolutePath = path.join(backupDir, fileName);

    try {
      const buffer = await fs.readFile(absolutePath);
      entries.push({
        name: fileName,
        buffer,
        sizeBytes: buffer.length,
        sha256: sha256(buffer),
      });
    } catch (error) {
      if (requiredFiles.includes(fileName)) {
        throw new Error(`Required dump file is missing: ${fileName}`);
      }
    }
  }

  return entries;
}

function buildRestoreGuide(manifest: BackupManifest) {
  return [
    "CCA LMS Database Backup Restore Guide",
    "",
    `Created: ${manifest.createdAt}`,
    `Triggered By: ${manifest.triggeredBy || "unknown"}`,
    "",
    "This archive contains database-only backups. Storage objects are not included.",
    "",
    "Recommended restore order:",
    "1. Review manifest.json and confirm the target environment.",
    "2. Restore roles.sql only if you intentionally manage custom database roles.",
    '3. Apply schema.sql with: psql "$TARGET_DATABASE_URL" -f schema.sql',
    '4. Apply data.sql with: psql "$TARGET_DATABASE_URL" -f data.sql',
    "5. Validate the application before promoting the restored database.",
    "",
    "If you are restoring into a fresh Supabase project, verify extensions and project-level configuration first.",
  ].join("\n");
}

async function buildArchive(backupDir: string) {
  const createdAt = new Date().toISOString();
  const prefix = normalizePrefix(process.env.DB_BACKUP_PREFIX || DEFAULT_PREFIX);
  const retentionDays = getRetentionDays();
  const files = await loadBackupFiles(backupDir);

  const manifest: BackupManifest = {
    version: "2.0.0",
    createdAt,
    retentionDays,
    prefix,
    source: "postgres-tools",
    repository: process.env.GITHUB_REPOSITORY || null,
    runId: process.env.GITHUB_RUN_ID || null,
    commitSha: process.env.GITHUB_SHA || null,
    actor: process.env.GITHUB_ACTOR || null,
    triggeredBy: process.env.BACKUP_TRIGGERED_BY || null,
    schemaScope: ["public"],
    notes: [
      "This archive contains database dumps only.",
      "Cloudflare R2, Backblaze B2, and other object storage contents are excluded.",
      "The schema and data were exported with pg_dump and pg_dumpall.",
    ],
    files: files.map((file) => ({
      name: file.name,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    })),
  };

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.buffer);
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("RESTORE.md", buildRestoreGuide(manifest));

  const archiveBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const dateKey = createdAt.slice(0, 10);
  const timeKey = createdAt.slice(11, 19).replace(/:/g, "-");
  const archiveFileName = `${dateKey}_${timeKey}_db-backup.zip`;
  const objectKey = `${prefix}/${dateKey}/${archiveFileName}`;

  return {
    manifest,
    archiveBuffer,
    archiveFileName,
    objectKey,
    archiveSizeBytes: archiveBuffer.length,
    archiveChecksum: sha256(archiveBuffer),
  };
}

async function cleanupOldBackups(client: S3Client, bucket: string, prefix: string, retentionDays: number) {
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - retentionDays);

  const keysToDelete: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${prefix}/`,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents || []) {
      if (!object.Key || !object.LastModified) {
        continue;
      }

      if (!object.Key.endsWith(".zip")) {
        continue;
      }

      if (object.LastModified < cutoffDate) {
        keysToDelete.push(object.Key);
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  if (keysToDelete.length === 0) {
    return { deletedCount: 0, deletedKeys: [] as string[] };
  }

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keysToDelete.map((Key) => ({ Key })),
      },
    }),
  );

  return {
    deletedCount: keysToDelete.length,
    deletedKeys: keysToDelete,
  };
}

async function writeResultFile(backupDir: string, result: Record<string, unknown>) {
  const target = path.join(backupDir, "result.json");
  await fs.writeFile(target, JSON.stringify(result, null, 2));
}

async function setGitHubOutput(values: Record<string, string | number>) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await fs.appendFile(outputPath, `${lines.join("\n")}\n`);
}

async function main() {
  const backupDir = path.resolve(process.argv[2] || ".artifacts/db-backup");
  const bucket = getRequiredBucketName();
  const client = createR2Client();
  const startedAt = Date.now();

  const archive = await buildArchive(backupDir);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: archive.objectKey,
      Body: archive.archiveBuffer,
      ContentType: "application/zip",
      Metadata: {
        source: archive.manifest.source,
        "backup-date": archive.manifest.createdAt,
        checksum: archive.archiveChecksum,
        retention: String(archive.manifest.retentionDays),
      },
    }),
  );

  const cleanup = await cleanupOldBackups(
    client,
    bucket,
    archive.manifest.prefix,
    archive.manifest.retentionDays,
  );

  const result = {
    success: true,
    objectKey: archive.objectKey,
    archiveFileName: archive.archiveFileName,
    archiveSizeBytes: archive.archiveSizeBytes,
    archiveChecksum: archive.archiveChecksum,
    retentionDays: archive.manifest.retentionDays,
    cleanupDeletedCount: cleanup.deletedCount,
    cleanupDeletedKeys: cleanup.deletedKeys,
    durationMs: Date.now() - startedAt,
    createdAt: archive.manifest.createdAt,
  };

  await writeResultFile(backupDir, result);
  await setGitHubOutput({
    artifact_key: result.objectKey,
    artifact_size_bytes: result.archiveSizeBytes,
    artifact_checksum: result.archiveChecksum,
    cleanup_deleted_count: result.cleanupDeletedCount,
    duration_ms: result.durationMs,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(async (error) => {
  const backupDir = path.resolve(process.argv[2] || ".artifacts/db-backup");
  const result = {
    success: false,
    error: error instanceof Error ? error.message : "Unknown error",
  };

  try {
    await writeResultFile(backupDir, result);
  } catch {
    // Ignore secondary write failures in the failure path.
  }

  console.error(result.error);
  process.exit(1);
});
