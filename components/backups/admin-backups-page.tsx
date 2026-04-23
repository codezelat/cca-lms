"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  Database,
  Download,
  ExternalLink,
  Filter,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Workflow,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { getNextDbBackupRun } from "@/lib/db-backup-schedule";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DatabaseBackupArtifact {
  key: string;
  fileName: string;
  sizeBytes: number;
  sizeMB: string;
  lastModified: string;
  ageInDays: number;
  downloadPath: string;
}

interface BackupWorkflowRun {
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

interface BackupSystemConfig {
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

interface DatabaseBackupsResponse {
  success: boolean;
  timestamp: string;
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
  restore: {
    note: string;
    steps: string[];
    commands: {
      roles: string;
      schema: string;
      data: string;
    };
  };
  error?: string;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelativeTime(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function getHealthBadgeVariant(status: DatabaseBackupsResponse["health"]["status"]) {
  switch (status) {
    case "healthy":
      return "success" as const;
    case "warning":
      return "warning" as const;
    case "error":
      return "danger" as const;
    default:
      return "outline" as const;
  }
}

function getRunBadge(run: BackupWorkflowRun | null) {
  if (!run) {
    return {
      label: "Unavailable",
      variant: "outline" as const,
    };
  }

  if (run.status !== "completed") {
    return {
      label: run.status.replace(/_/g, " "),
      variant: "info" as const,
    };
  }

  switch (run.conclusion) {
    case "success":
      return {
        label: "Success",
        variant: "success" as const,
      };
    case "failure":
      return {
        label: "Failure",
        variant: "danger" as const,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        variant: "warning" as const,
      };
    default:
      return {
        label: run.conclusion || "Completed",
        variant: "outline" as const,
      };
  }
}

function getWorkflowFilterValue(run: BackupWorkflowRun) {
  if (run.status !== "completed") {
    return "in_progress";
  }

  if (run.conclusion === "success") {
    return "success";
  }

  if (run.conclusion === "failure") {
    return "failure";
  }

  return "other";
}

export default function AdminBackupsPage() {
  const [data, setData] = useState<DatabaseBackupsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunningBackup, setIsRunningBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState("all");
  const requestIdRef = useRef(0);
  const dataRef = useRef<DatabaseBackupsResponse | null>(null);
  const followUpRefreshTimeoutsRef = useRef<number[]>([]);

  const clearFollowUpRefreshes = useCallback(() => {
    for (const timeoutId of followUpRefreshTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    followUpRefreshTimeoutsRef.current = [];
  }, []);

  const fetchOverview = useCallback(
    async ({
      background = false,
      suppressErrorToast = false,
    }: {
      background?: boolean;
      suppressErrorToast?: boolean;
    } = {}) => {
      const requestId = ++requestIdRef.current;

      try {
        if (background) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }

        const response = await fetch("/api/admin/backups", {
          cache: "no-store",
        });
        const payload = (await response.json()) as DatabaseBackupsResponse;

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Failed to load database backups.");
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        setData(payload);
        dataRef.current = payload;
        setError(null);
      } catch (fetchError) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load database backups.";

        if (!background || !dataRef.current) {
          setError(message);
        }

        if (!suppressErrorToast && background) {
          toast.error(message);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void fetchOverview();

    return () => {
      clearFollowUpRefreshes();
    };
  }, [clearFollowUpRefreshes, fetchOverview]);

  const queueFollowUpRefreshes = useCallback(() => {
    clearFollowUpRefreshes();

    for (const delay of [4000, 15000]) {
      const timeoutId = window.setTimeout(() => {
        void fetchOverview({ background: true, suppressErrorToast: true });
      }, delay);
      followUpRefreshTimeoutsRef.current.push(timeoutId);
    }
  }, [clearFollowUpRefreshes, fetchOverview]);

  const handleRunBackup = async () => {
    try {
      setIsRunningBackup(true);

      const response = await fetch("/api/admin/backups/run", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to queue backup workflow.");
      }

      toast.success(payload.message || "Backup workflow queued.");
      void fetchOverview({ background: true, suppressErrorToast: true });
      queueFollowUpRefreshes();
    } catch (runError) {
      toast.error(
        runError instanceof Error
          ? runError.message
          : "Failed to queue backup workflow.",
      );
    } finally {
      setIsRunningBackup(false);
    }
  };

  const nextScheduledRun = getNextDbBackupRun();
  const workflowRunBadge = getRunBadge(data?.workflow.latestRun || null);
  const normalizedArchiveSearch = archiveSearch.trim().toLowerCase();
  const filteredBackups = useMemo(() => {
    const backups = data?.backups || [];

    if (!normalizedArchiveSearch) {
      return backups;
    }

    return backups.filter((backup) =>
      `${backup.fileName} ${backup.key}`
        .toLowerCase()
        .includes(normalizedArchiveSearch),
    );
  }, [data?.backups, normalizedArchiveSearch]);
  const filteredWorkflowRuns = useMemo(() => {
    const workflowRuns = data?.workflow.recentRuns || [];

    if (workflowStatusFilter === "all") {
      return workflowRuns;
    }

    return workflowRuns.filter(
      (run) => getWorkflowFilterValue(run) === workflowStatusFilter,
    );
  }, [data?.workflow.recentRuns, workflowStatusFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-terminal-dark flex items-center justify-center">
        <div className="flex items-center gap-3 text-terminal-green">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="font-mono text-lg">Loading database backups...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-terminal-dark flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-red-500/40">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
              <div>
                <h3 className="font-mono font-semibold text-red-400 mb-1">
                  Backup Dashboard Unavailable
                </h3>
                <p className="text-sm text-terminal-text-muted mb-4">
                  {error || "Failed to load database backups."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchOverview()}
                >
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-terminal-dark">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Database className="h-6 w-6 text-terminal-green" />
              <h1 className="font-mono text-3xl font-bold text-terminal-green terminal-glow">
                Database Backups
              </h1>
              <Badge variant={getHealthBadgeVariant(data.health.status)}>
                {data.health.status}
              </Badge>
            </div>
            <p className="font-mono text-sm text-terminal-text-muted">
              {data.health.message}
            </p>
            <div className="flex flex-wrap gap-3 font-mono text-xs text-terminal-text-muted">
              <span>Updated {formatTimestamp(data.timestamp)}</span>
              <span>Next target {formatTimestamp(nextScheduledRun.toISOString())}</span>
              <span>Retention {data.config.retentionDays} days</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchOverview({ background: true })}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleRunBackup}
              disabled={!data.config.workflowConfigured || isRunningBackup}
            >
              {isRunningBackup ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run Backup Now
            </Button>
          </div>
        </div>

        {data.config.warnings.length > 0 && (
          <Card className="mb-6 border-yellow-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-yellow-400">
                <AlertCircle className="h-5 w-5" />
                Action Needed
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.config.warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-md border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 font-mono text-sm text-yellow-300"
                >
                  {warning}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid gap-4 xl:grid-cols-[1.25fr_0.9fr_0.9fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Latest Backup
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.latestBackup ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-terminal-green/15 bg-terminal-darker/40 p-4">
                    <div className="font-mono text-base font-semibold text-terminal-text break-all">
                      {data.latestBackup.fileName}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-terminal-text-muted">
                      <span>{data.latestBackup.sizeMB} MB</span>
                      <span>{formatRelativeTime(data.latestBackup.lastModified)}</span>
                      <span>{formatTimestamp(data.latestBackup.lastModified)}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.location.href = data.latestBackup!.downloadPath;
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Latest
                  </Button>
                </div>
              ) : (
                <p className="font-mono text-sm text-terminal-text-muted">
                  No backup yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Storage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-terminal-green/10 bg-terminal-darker/30 p-3">
                  <div className="font-mono text-2xl font-bold text-terminal-green">
                    {data.totalBackups}
                  </div>
                  <div className="font-mono text-xs text-terminal-text-muted">
                    archives
                  </div>
                </div>
                <div className="rounded-md border border-terminal-green/10 bg-terminal-darker/30 p-3">
                  <div className="font-mono text-2xl font-bold text-terminal-green">
                    {data.totalSizeMB}
                  </div>
                  <div className="font-mono text-xs text-terminal-text-muted">
                    MB stored
                  </div>
                </div>
              </div>
              <div className="space-y-2 font-mono text-xs text-terminal-text-muted">
                <div>Bucket: {data.config.bucketName || "Not configured"}</div>
                <div>Prefix: {data.config.prefix}</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-terminal-green/15 px-3 py-1 font-mono text-xs text-terminal-text-muted">
                {data.config.storageConfigured ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-terminal-green" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                )}
                {data.config.usesDedicatedBucket
                  ? "Dedicated backup bucket"
                  : "Shared R2 bucket"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5" />
                Workflow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Badge variant={workflowRunBadge.variant}>
                  {workflowRunBadge.label}
                </Badge>
                <div className="inline-flex items-center gap-2 rounded-full border border-terminal-green/15 px-3 py-1 font-mono text-xs text-terminal-text-muted">
                  {data.config.workflowConfigured ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-terminal-green" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                  {data.config.workflowConfigured ? "Connected" : "Not configured"}
                </div>
              </div>

              {data.workflow.latestRun ? (
                <div className="rounded-md border border-terminal-green/10 bg-terminal-darker/30 p-3">
                  <div className="font-mono text-sm font-semibold text-terminal-text">
                    Run #{data.workflow.latestRun.runNumber}
                  </div>
                  <div className="mt-1 font-mono text-xs text-terminal-text-muted">
                    {formatRelativeTime(data.workflow.latestRun.updatedAt)}
                  </div>
                  <div className="mt-1 font-mono text-xs text-terminal-text-muted">
                    {data.workflow.latestRun.event} on {data.workflow.latestRun.branch}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-terminal-green/10 bg-terminal-darker/30 p-3 font-mono text-sm text-terminal-text-muted">
                  No workflow runs yet.
                </div>
              )}

              <div className="space-y-2 font-mono text-xs text-terminal-text-muted">
                <div>{data.config.scheduleDescription}</div>
                <div className="truncate">
                  {data.config.workflowRepository || "Workflow not configured"}
                </div>
              </div>

              {data.workflow.latestRun && (
                <a
                  href={data.workflow.latestRun.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 font-mono text-xs text-terminal-green hover:text-terminal-green-light"
                >
                  Open latest run
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Archives
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-terminal-text-muted" />
                  <Input
                    value={archiveSearch}
                    onChange={(event) => setArchiveSearch(event.target.value)}
                    placeholder="Search archives"
                    className="pl-9"
                  />
                </div>
                <div className="font-mono text-xs text-terminal-text-muted">
                  {filteredBackups.length} / {data.backups.length}
                </div>
              </div>

              {data.backups.length === 0 ? (
                <div className="rounded-md border border-dashed border-terminal-green/20 bg-terminal-darker/30 px-4 py-8 text-center">
                  <p className="font-mono text-sm text-terminal-text-muted">
                    No archives yet.
                  </p>
                </div>
              ) : filteredBackups.length === 0 ? (
                <div className="rounded-md border border-dashed border-terminal-green/20 bg-terminal-darker/30 px-4 py-8 text-center">
                  <p className="font-mono text-sm text-terminal-text-muted">
                    No matches.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredBackups.map((backup) => (
                    <div
                      key={backup.key}
                      className="flex flex-col gap-4 rounded-md border border-terminal-green/15 bg-terminal-darker/40 p-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-semibold text-terminal-text truncate">
                          {backup.fileName}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 font-mono text-xs text-terminal-text-muted">
                          <span>{backup.sizeMB} MB</span>
                          <span>{formatRelativeTime(backup.lastModified)}</span>
                          <span>{formatTimestamp(backup.lastModified)}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          window.location.href = backup.downloadPath;
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="h-5 w-5" />
                  Recent Runs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-terminal-text-muted">
                    <Filter className="h-4 w-4" />
                    <span className="font-mono text-xs">Filter</span>
                  </div>
                  <Select
                    value={workflowStatusFilter}
                    onValueChange={setWorkflowStatusFilter}
                  >
                    <SelectTrigger className="w-full border-terminal-green/30 bg-terminal-darker font-mono text-terminal-text sm:w-44">
                      <SelectValue placeholder="All runs" />
                    </SelectTrigger>
                    <SelectContent className="border-terminal-green/20 bg-terminal-darker font-mono text-terminal-text">
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="success">Successful</SelectItem>
                      <SelectItem value="failure">Failed</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {data.workflow.recentRuns.length === 0 ? (
                  <p className="font-mono text-sm text-terminal-text-muted">
                    No workflow history yet.
                  </p>
                ) : filteredWorkflowRuns.length === 0 ? (
                  <p className="font-mono text-sm text-terminal-text-muted">
                    No matching runs.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredWorkflowRuns.map((run) => {
                      const badge = getRunBadge(run);
                      return (
                        <div
                          key={run.id}
                          className="rounded-md border border-terminal-green/15 bg-terminal-darker/40 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-mono text-sm font-semibold text-terminal-text">
                                Run #{run.runNumber}
                              </div>
                              <div className="mt-1 font-mono text-xs text-terminal-text-muted">
                                {run.event} on {run.branch}
                              </div>
                            </div>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-terminal-text-muted">
                            <span>{formatTimestamp(run.createdAt)}</span>
                            <span>{formatRelativeTime(run.updatedAt)}</span>
                            <span>{run.actor || "GitHub Actions"}</span>
                          </div>
                          <a
                            href={run.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 font-mono text-xs text-terminal-green hover:text-terminal-green-light"
                          >
                            Open run
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Restore Commands
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-2">
                  <div className="rounded-md border border-terminal-green/20 bg-terminal-darker/50 p-3">
                    <div className="mb-2 font-mono text-xs uppercase tracking-wide text-terminal-text-muted">
                      Schema
                    </div>
                    <code className="font-mono text-sm text-terminal-green break-all">
                      {data.restore.commands.schema}
                    </code>
                  </div>
                  <div className="rounded-md border border-terminal-green/20 bg-terminal-darker/50 p-3">
                    <div className="mb-2 font-mono text-xs uppercase tracking-wide text-terminal-text-muted">
                      Data
                    </div>
                    <code className="font-mono text-sm text-terminal-green break-all">
                      {data.restore.commands.data}
                    </code>
                  </div>
                  <div className="rounded-md border border-terminal-green/20 bg-terminal-darker/50 p-3">
                    <div className="mb-2 font-mono text-xs uppercase tracking-wide text-terminal-text-muted">
                      Roles (optional)
                    </div>
                    <code className="font-mono text-sm text-terminal-green break-all">
                      {data.restore.commands.roles}
                    </code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
