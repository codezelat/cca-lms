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
  Shield,
  Terminal,
  Workflow,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
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

function getNextScheduledRun() {
  const now = new Date();
  const next = new Date(now);

  next.setUTCHours(0, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
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

    const interval = window.setInterval(() => {
      void fetchOverview({ background: true, suppressErrorToast: true });
    }, 60000);

    return () => {
      window.clearInterval(interval);
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

  const nextScheduledRun = getNextScheduledRun();
  const workflowRunBadge = getRunBadge(data?.workflow.latestRun || null);
  const normalizedArchiveSearch = archiveSearch.trim().toLowerCase();
  const backups = data?.backups || [];
  const workflowRuns = data?.workflow.recentRuns || [];
  const filteredBackups = useMemo(() => {
    if (!normalizedArchiveSearch) {
      return backups;
    }

    return backups.filter((backup) =>
      `${backup.fileName} ${backup.key}`
        .toLowerCase()
        .includes(normalizedArchiveSearch),
    );
  }, [backups, normalizedArchiveSearch]);
  const filteredWorkflowRuns = useMemo(() => {
    if (workflowStatusFilter === "all") {
      return workflowRuns;
    }

    return workflowRuns.filter(
      (run) => getWorkflowFilterValue(run) === workflowStatusFilter,
    );
  }, [workflowRuns, workflowStatusFilter]);

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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-6 w-6 text-terminal-green" />
                <h1 className="font-mono text-3xl font-bold text-terminal-green terminal-glow">
                  $ backups --database
                </h1>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted">
                Daily full PostgreSQL dumps, private R2 storage, and restore readiness for admins only.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={getHealthBadgeVariant(data.health.status)}>
                {data.health.status}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchOverview({ background: true })}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={handleRunBackup}
                disabled={!data.config.workflowConfigured || isRunningBackup}
              >
                {isRunningBackup ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Run Backup Now
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 font-mono text-xs text-terminal-text-muted">
            <span>Last refreshed: {formatTimestamp(data.timestamp)}</span>
            <span>Next scheduled run: {formatTimestamp(nextScheduledRun.toISOString())}</span>
            <span>Retention: {data.config.retentionDays} days</span>
          </div>
        </div>

        {data.config.warnings.length > 0 && (
          <Card className="mb-6 border-yellow-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-400">
                <AlertCircle className="h-5 w-5" />
                Configuration Warnings
              </CardTitle>
              <CardDescription>
                Fix these items so scheduled backups, workflow telemetry, and downloads all work correctly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Shield className="h-6 w-6 text-terminal-green" />
                <Badge variant={getHealthBadgeVariant(data.health.status)}>
                  {data.health.status}
                </Badge>
              </div>
              <div className="font-mono text-2xl font-bold text-terminal-green mb-2">
                {data.health.status === "healthy" ? "Healthy" : "Attention"}
              </div>
              <p className="font-mono text-sm text-terminal-text-muted">
                {data.health.message}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Archive className="h-6 w-6 text-blue-400" />
                <span className="font-mono text-3xl font-bold text-terminal-green">
                  {data.totalBackups}
                </span>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted mb-1">
                Backup archives retained
              </p>
              <p className="font-mono text-xs text-terminal-text-muted">
                Bucket: {data.config.bucketName || "Not configured"}
              </p>
              <p className="font-mono text-xs text-terminal-text-muted">
                Prefix: {data.config.prefix}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <HardDrive className="h-6 w-6 text-yellow-400" />
                <span className="font-mono text-3xl font-bold text-terminal-green">
                  {data.totalSizeMB}
                </span>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted mb-1">
                Total stored size (MB)
              </p>
              <p className="font-mono text-xs text-terminal-text-muted">
                Private R2 archive storage
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Workflow className="h-6 w-6 text-purple-400" />
                <Badge variant={workflowRunBadge.variant}>{workflowRunBadge.label}</Badge>
              </div>
              <div className="font-mono text-sm font-semibold text-terminal-text mb-1 truncate">
                {data.config.workflowRepository || "Workflow not configured"}
              </div>
              <p className="font-mono text-xs text-terminal-text-muted">
                {data.config.scheduleDescription}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Backup Archives
              </CardTitle>
              <CardDescription>
                Portable SQL bundles stored privately in R2. Download an archive when you need to inspect or restore a point-in-time dump.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-terminal-text-muted" />
                  <Input
                    value={archiveSearch}
                    onChange={(event) => setArchiveSearch(event.target.value)}
                    placeholder="Filter archives by file name"
                    className="pl-9"
                  />
                </div>
                <div className="font-mono text-xs text-terminal-text-muted">
                  Showing {filteredBackups.length} of {data.backups.length} archives
                </div>
              </div>

              {data.backups.length === 0 ? (
                <div className="rounded-md border border-dashed border-terminal-green/20 bg-terminal-darker/30 px-4 py-8 text-center">
                  <p className="font-mono text-sm text-terminal-text-muted">
                    No backup archives have been uploaded yet.
                  </p>
                </div>
              ) : filteredBackups.length === 0 ? (
                <div className="rounded-md border border-dashed border-terminal-green/20 bg-terminal-darker/30 px-4 py-8 text-center">
                  <p className="font-mono text-sm text-terminal-text-muted">
                    No archives match the current filter.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredBackups.map((backup) => (
                    <div
                      key={backup.key}
                      className="rounded-md border border-terminal-green/15 bg-terminal-darker/40 p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="font-mono font-semibold text-terminal-text truncate">
                            {backup.fileName}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 font-mono text-xs text-terminal-text-muted">
                            <span>{backup.sizeMB} MB</span>
                            <span>{formatRelativeTime(backup.lastModified)}</span>
                            <span>{formatTimestamp(backup.lastModified)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.location.href = backup.downloadPath;
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Latest Archive
                </CardTitle>
                <CardDescription>
                  The newest backup bundle currently available for restore.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.latestBackup ? (
                  <div className="space-y-3 font-mono text-sm">
                    <div className="rounded-md border border-terminal-green/20 bg-terminal-darker/40 p-3">
                      <div className="text-terminal-text font-semibold break-all">
                        {data.latestBackup.fileName}
                      </div>
                      <div className="mt-2 text-terminal-text-muted space-y-1">
                        <div>Created: {formatTimestamp(data.latestBackup.lastModified)}</div>
                        <div>Age: {formatRelativeTime(data.latestBackup.lastModified)}</div>
                        <div>Size: {data.latestBackup.sizeMB} MB</div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        window.location.href = data.latestBackup!.downloadPath;
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Latest Backup
                    </Button>
                  </div>
                ) : (
                  <p className="font-mono text-sm text-terminal-text-muted">
                    No archive is available yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="h-5 w-5" />
                  Workflow Runs
                </CardTitle>
              <CardDescription>
                Recent GitHub Actions runs for the backup workflow.
              </CardDescription>
            </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-terminal-text-muted">
                    <Filter className="h-4 w-4" />
                    <span className="font-mono text-xs">Run status filter</span>
                  </div>
                  <Select
                    value={workflowStatusFilter}
                    onValueChange={setWorkflowStatusFilter}
                  >
                    <SelectTrigger className="w-full sm:w-48 border-terminal-green/30 bg-terminal-darker font-mono text-terminal-text">
                      <SelectValue placeholder="All runs" />
                    </SelectTrigger>
                    <SelectContent className="border-terminal-green/20 bg-terminal-darker font-mono text-terminal-text">
                      <SelectItem value="all">All runs</SelectItem>
                      <SelectItem value="success">Successful</SelectItem>
                      <SelectItem value="failure">Failed</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {data.workflow.recentRuns.length === 0 ? (
                  <p className="font-mono text-sm text-terminal-text-muted">
                    Workflow telemetry is not available yet.
                  </p>
                ) : filteredWorkflowRuns.length === 0 ? (
                  <p className="font-mono text-sm text-terminal-text-muted">
                    No workflow runs match the selected filter.
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
                              <div className="font-mono text-xs text-terminal-text-muted mt-1">
                                {run.event} on {run.branch}
                              </div>
                            </div>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </div>

                          <div className="mt-3 font-mono text-xs text-terminal-text-muted space-y-1">
                            <div>Started: {formatTimestamp(run.createdAt)}</div>
                            <div>Updated: {formatRelativeTime(run.updatedAt)}</div>
                            <div>Actor: {run.actor || "GitHub Actions"}</div>
                          </div>

                          <a
                            href={run.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 font-mono text-xs text-terminal-green hover:text-terminal-green-light"
                          >
                            Open workflow run
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Restore Runbook
              </CardTitle>
              <CardDescription>
                Keep restores explicit and operator-controlled. This page does not execute destructive restores from the browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-blue-500/20 bg-blue-500/10 px-4 py-3 font-mono text-sm text-blue-300">
                {data.restore.note}
              </div>

              <div className="space-y-2">
                {data.restore.steps.map((step) => (
                  <div
                    key={step}
                    className="rounded-md border border-terminal-green/10 bg-terminal-darker/30 px-4 py-3 font-mono text-sm text-terminal-text-muted"
                  >
                    {step}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="rounded-md border border-terminal-green/20 bg-terminal-darker/50 p-3">
                  <div className="font-mono text-xs uppercase tracking-wide text-terminal-text-muted mb-2">
                    Restore roles
                  </div>
                  <code className="font-mono text-sm text-terminal-green break-all">
                    {data.restore.commands.roles}
                  </code>
                </div>
                <div className="rounded-md border border-terminal-green/20 bg-terminal-darker/50 p-3">
                  <div className="font-mono text-xs uppercase tracking-wide text-terminal-text-muted mb-2">
                    Restore schema
                  </div>
                  <code className="font-mono text-sm text-terminal-green break-all">
                    {data.restore.commands.schema}
                  </code>
                </div>
                <div className="rounded-md border border-terminal-green/20 bg-terminal-darker/50 p-3">
                  <div className="font-mono text-xs uppercase tracking-wide text-terminal-text-muted mb-2">
                    Restore data
                  </div>
                  <code className="font-mono text-sm text-terminal-green break-all">
                    {data.restore.commands.data}
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Operational Checklist
              </CardTitle>
              <CardDescription>
                What must be configured for this backup system to stay healthy in production.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3 rounded-md border border-terminal-green/10 bg-terminal-darker/30 p-4">
                <div>
                  <div className="font-mono text-sm font-semibold text-terminal-text">
                    Private R2 storage
                  </div>
                  <div className="font-mono text-xs text-terminal-text-muted mt-1">
                    App-side access for archive listing and short-lived download links.
                    {data.config.usesDedicatedBucket
                      ? " Using a dedicated backup bucket."
                      : " Using the shared R2 bucket fallback."}
                  </div>
                </div>
                {data.config.storageConfigured ? (
                  <CheckCircle2 className="h-5 w-5 text-terminal-green shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                )}
              </div>

              <div className="flex items-start justify-between gap-3 rounded-md border border-terminal-green/10 bg-terminal-darker/30 p-4">
                <div>
                  <div className="font-mono text-sm font-semibold text-terminal-text">
                    GitHub workflow dispatch
                  </div>
                  <div className="font-mono text-xs text-terminal-text-muted mt-1">
                    Requires repository, branch, workflow file, and a token with Actions read/write access.
                  </div>
                </div>
                {data.config.workflowConfigured ? (
                  <CheckCircle2 className="h-5 w-5 text-terminal-green shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                )}
              </div>

              <div className="flex items-start justify-between gap-3 rounded-md border border-terminal-green/10 bg-terminal-darker/30 p-4">
                <div>
                  <div className="font-mono text-sm font-semibold text-terminal-text">
                    Daily schedule and retention
                  </div>
                  <div className="font-mono text-xs text-terminal-text-muted mt-1">
                    The workflow keeps one archive per day and deletes anything older than {data.config.retentionDays} days.
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 text-terminal-green shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
