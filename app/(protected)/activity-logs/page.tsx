"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Clock,
  Search,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Terminal,
  RefreshCw,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { ActivityLogUserFilter } from "@/components/activity-logs/activity-log-user-filter";
import { buildActivityLogQueryParams } from "@/lib/activity-logs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, formatDistanceToNow } from "date-fns";
import { useDebouncedValue } from "@/lib/use-debounced-value";

interface ActivityLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface Filters {
  actionTypes: string[];
  entityTypes: string[];
}

export default function ActivityLogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [action, setAction] = useState(searchParams.get("action") || "");
  const [entityType, setEntityType] = useState(
    searchParams.get("entityType") || "",
  );
  const [userId, setUserId] = useState(searchParams.get("userId") || "");
  const [startDate, setStartDate] = useState(
    searchParams.get("startDate") || "",
  );
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));
  const debouncedSearch = useDebouncedValue(search.trim());
  const activityRequestRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchActivityLogs(controller.signal);

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, action, entityType, userId, startDate, endDate]);

  const fetchActivityLogs = async (signal?: AbortSignal) => {
    const requestId = ++activityRequestRef.current;

    try {
      setIsLoading(true);
      const params = buildActivityLogQueryParams({
        page,
        limit: 20,
        search: debouncedSearch,
        action,
        entityType,
        userId,
        startDate,
        endDate,
      });

      const response = await fetch(`/api/admin/activity-logs?${params}`, {
        signal,
      });
      if (!response.ok) throw new Error("Failed to fetch activity logs");

      const data = await response.json();
      if (signal?.aborted || requestId !== activityRequestRef.current) return;

      setActivities(data.activities);
      setPagination(data.pagination);
      setFilters(data.filters);

      // Update URL
      router.push(`/activity-logs?${params}`, { scroll: false });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error fetching activity logs:", error);
    } finally {
      if (!signal?.aborted && requestId === activityRequestRef.current) {
        setIsLoading(false);
      }
    }
  };

  const clearFilters = () => {
    setSearch("");
    setAction("");
    setEntityType("");
    setUserId("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const getActionBadge = (
    actionStr: string,
  ): "success" | "info" | "warning" | "danger" | "outline" | "default" => {
    if (actionStr.includes("LOGIN")) return "success";
    if (actionStr.includes("CREATE")) return "info";
    if (actionStr.includes("UPDATE")) return "warning";
    if (actionStr.includes("DELETE")) return "danger";
    return "outline";
  };

  const formatAction = (actionStr: string) => {
    return actionStr
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const exportToCSV = () => {
    const params = buildActivityLogQueryParams({
      search: debouncedSearch || search,
      action,
      entityType,
      userId,
      startDate,
      endDate,
    });
    window.location.href = `/api/admin/activity-logs/export?${params}`;
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-terminal-dark">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 mb-2">
                <Terminal className="h-5 w-5 shrink-0 text-terminal-green sm:h-6 sm:w-6" />
                <h1 className="min-w-0 break-words font-mono text-xl font-bold text-terminal-green terminal-glow sm:text-3xl">
                  $ activity-logs
                </h1>
              </div>
              <p className="break-words font-mono text-sm text-terminal-text-muted">
                System activity and audit trail
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              <Button
                onClick={() => {
                  void fetchActivityLogs();
                }}
                variant="outline"
                size="sm"
                className="w-full gap-2 sm:w-auto"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button
                onClick={exportToCSV}
                variant="outline"
                size="sm"
                className="w-full gap-2 sm:w-auto"
                disabled={activities.length === 0}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Search */}
              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-terminal-text-muted" />
                  <Input
                    placeholder="Search logs..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Action Type */}
              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  Action Type
                </label>
                <Select
                  value={action || "all"}
                  onValueChange={(value) => {
                    setAction(value === "all" ? "" : value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {filters?.actionTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {formatAction(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Entity Type */}
              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  Entity Type
                </label>
                <Select
                  value={entityType || "all"}
                  onValueChange={(value) => {
                    setEntityType(value === "all" ? "" : value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {filters?.entityTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* User */}
              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  User
                </label>
                <ActivityLogUserFilter
                  value={userId}
                  onChange={(value) => {
                    setUserId(value);
                    setPage(1);
                  }}
                />
              </div>

              {/* Start Date */}
              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              {/* End Date */}
              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  End Date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            {/* Clear Filters */}
            {(search ||
              action ||
              entityType ||
              userId ||
              startDate ||
              endDate) && (
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={clearFilters}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  Clear All Filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Count */}
        {pagination && (
          <div className="mb-4">
            <p className="font-mono text-sm text-terminal-text-muted">
              Showing {(pagination.page - 1) * pagination.limit + 1} -{" "}
              {Math.min(
                pagination.page * pagination.limit,
                pagination.totalCount,
              )}{" "}
              of {pagination.totalCount} activities
            </p>
          </div>
        )}

        {/* Activity List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
          </div>
        ) : activities.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Activity className="h-12 w-12 text-terminal-text-muted mx-auto mb-4" />
                <p className="font-mono text-terminal-text-muted">
                  No activity logs found
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <Card
                key={activity.id}
                className="hover:bg-terminal-green/5 transition-all"
              >
                <CardContent className="pt-6">
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    {/* Status Indicator */}
                    <div
                      className={`mt-1 h-3 w-3 rounded-full ${
                        activity.action.includes("LOGIN")
                          ? "bg-terminal-green"
                          : activity.action.includes("CREATE")
                            ? "bg-blue-400"
                            : activity.action.includes("UPDATE")
                              ? "bg-yellow-400"
                              : activity.action.includes("DELETE")
                                ? "bg-red-400"
                                : "bg-terminal-text-muted"
                      } shrink-0`}
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-3 mb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={getActionBadge(activity.action)}>
                              {formatAction(activity.action)}
                            </Badge>
                            {activity.entityType && (
                              <span className="break-words text-sm font-mono text-terminal-green">
                                {activity.entityType}
                              </span>
                            )}
                          </div>
                          <p className="break-words text-sm font-mono text-terminal-text mt-2">
                            <span className="font-semibold">
                              {activity.user?.name ||
                                activity.user?.email ||
                                "System"}
                            </span>
                            {activity.user?.role && (
                              <span className="text-terminal-text-muted ml-0 sm:ml-2">
                                ({activity.user.role})
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <p className="text-xs font-mono text-terminal-text-muted flex items-center gap-1 sm:justify-end">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(activity.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                          <p className="text-xs font-mono text-terminal-text-muted mt-1">
                            {format(
                              new Date(activity.createdAt),
                              "MMM dd, yyyy HH:mm:ss",
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Additional Info */}
                      <div className="grid gap-2 mt-3 text-xs font-mono text-terminal-text-muted">
                        {activity.entityId && (
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="text-terminal-text">
                              Entity ID:
                            </span>
                            <code className="min-w-0 break-all px-2 py-1 rounded bg-terminal-darker border border-terminal-green/20">
                              {activity.entityId}
                            </code>
                          </div>
                        )}
                        {activity.ipAddress && (
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="text-terminal-text">IP:</span>
                            <code className="min-w-0 break-all px-2 py-1 rounded bg-terminal-darker border border-terminal-green/20">
                              {activity.ipAddress}
                            </code>
                          </div>
                        )}
                        {activity.metadata &&
                          Object.keys(activity.metadata).length > 0 && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-terminal-green hover:underline">
                                View Metadata
                              </summary>
                              <pre className="mt-2 p-3 rounded bg-terminal-darker border border-terminal-green/20 overflow-x-auto text-xs">
                                {JSON.stringify(activity.metadata, null, 2)}
                              </pre>
                            </details>
                          )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalCount={pagination.totalCount}
                pageSize={pagination.limit}
                onPageChange={setPage}
                showPageJump={pagination.totalPages > 10}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
