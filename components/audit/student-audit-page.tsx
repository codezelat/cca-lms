"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Filter,
  Loader2,
  Search,
  Shield,
  Terminal,
  Users,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProgrammeOption {
  id: string;
  title: string;
  status: string;
}

interface StudentAuditRow {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  createdAt: string;
  programmeCount: number;
  activeProgrammeCount: number;
  completedProgrammeCount: number;
  averageProgress: number;
  programmeTitles: string[];
  lastLoginAt: string | null;
  firstLoginAt: string | null;
  totalLogins: number;
  lastLearningAt: string | null;
  lastAuditAt: string | null;
  lastEngagementAt: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface SummaryData {
  totalStudents: number;
  totalEnrolled: number;
  activeLast7Days: number;
  inactiveOver30Days: number;
}

const SEGMENTS = ["all", "enrolled", "active7", "inactive30"] as const;
type StudentAuditSegment = (typeof SEGMENTS)[number];

const statusVariant = (status: string) => {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
      return "danger";
    case "INVITED":
      return "info";
    case "DELETED":
      return "danger";
    default:
      return "outline";
  }
};

const enrollmentVariant = (status: string) => {
  switch (status) {
    case "ACTIVE":
      return "info";
    case "COMPLETED":
      return "success";
    case "DROPPED":
      return "warning";
    default:
      return "outline";
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return format(new Date(value), "MMM dd, yyyy HH:mm");
};

const formatRelative = (value?: string | null) => {
  if (!value) return "—";
  return formatDistanceToNow(new Date(value), { addSuffix: true });
};

export default function StudentAuditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [students, setStudents] = useState<StudentAuditRow[]>([]);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [programmeId, setProgrammeId] = useState(
    searchParams.get("programmeId") || "all",
  );
  const [enrollmentStatus, setEnrollmentStatus] = useState(
    searchParams.get("enrollmentStatus") || "all",
  );
  const [accountStatus, setAccountStatus] = useState(
    searchParams.get("accountStatus") || "all",
  );
  const [segment, setSegment] = useState<StudentAuditSegment>(() => {
    const value = searchParams.get("segment") || "all";
    return SEGMENTS.includes(value as StudentAuditSegment)
      ? (value as StudentAuditSegment)
      : "all";
  });
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") || "1"),
  );

  const hasFilters = useMemo(() => {
    return (
      search ||
      programmeId !== "all" ||
      enrollmentStatus !== "all" ||
      accountStatus !== "all" ||
      segment !== "all"
    );
  }, [search, programmeId, enrollmentStatus, accountStatus, segment]);

  useEffect(() => {
    fetchProgrammes();
  }, []);

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, programmeId, enrollmentStatus, accountStatus, segment]);

  const fetchProgrammes = async () => {
    try {
      const response = await fetch("/api/admin/programmes?limit=200");
      if (!response.ok) return;
      const data = await response.json();
      setProgrammes(data.programmes || []);
    } catch (err) {
      console.error("Failed to fetch programmes", err);
    }
  };

  const fetchStudents = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "10");
      if (search) params.set("search", search);
      if (programmeId !== "all") params.set("programmeId", programmeId);
      if (enrollmentStatus !== "all")
        params.set("enrollmentStatus", enrollmentStatus);
      if (accountStatus !== "all")
        params.set("accountStatus", accountStatus);
      if (segment !== "all") params.set("segment", segment);

      const response = await fetch(`/api/admin/student-audit?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch student audit data");
      }

      const data = await response.json();
      setStudents(data.students || []);
      setPagination(data.pagination || null);
      setSummary(data.summary || null);

      router.push(`/audit-students?${params}`, { scroll: false });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setProgrammeId("all");
    setEnrollmentStatus("all");
    setAccountStatus("all");
    setSegment("all");
    setPage(1);
  };

  const toggleSegment = (next: StudentAuditSegment) => {
    setSegment((current) => (current === next ? "all" : next));
    setPage(1);
  };

  const getSummaryCardClass = (target: StudentAuditSegment) =>
    `cursor-pointer transition-all ${
      segment === target
        ? "ring-2 ring-terminal-green/60 border-terminal-green/60 bg-terminal-green/5"
        : "hover:border-terminal-green/40 hover:bg-terminal-green/5"
    }`;

  return (
    <div className="min-h-screen bg-terminal-dark">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="h-6 w-6 text-terminal-green" />
            <h1 className="font-mono text-3xl font-bold text-terminal-green terminal-glow">
              $ audit-students
            </h1>
          </div>
          <p className="font-mono text-sm text-terminal-text-muted">
            Full audit of student logins, progress, and activity signals
          </p>
        </div>

        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="py-4">
              <p className="font-mono text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {summary && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <Users className="h-6 w-6 text-terminal-green" />
                  <div className="text-3xl font-bold font-mono text-terminal-green">
                    {summary.totalStudents}
                  </div>
                </div>
                <p className="font-mono text-sm text-terminal-text-muted mt-2">
                  Total Students
                </p>
              </CardContent>
            </Card>
            <Card
              role="button"
              tabIndex={0}
              className={getSummaryCardClass("active7")}
              onClick={() => toggleSegment("active7")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleSegment("active7");
                }
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <Shield className="h-6 w-6 text-blue-400" />
                  <div className="text-3xl font-bold font-mono text-blue-400">
                    {summary.activeLast7Days}
                  </div>
                </div>
                <p className="font-mono text-sm text-terminal-text-muted mt-2">
                  Active (7 days)
                </p>
                {segment === "active7" && (
                  <p className="font-mono text-xs text-terminal-green mt-2">
                    Filter enabled
                  </p>
                )}
              </CardContent>
            </Card>
            <Card
              role="button"
              tabIndex={0}
              className={getSummaryCardClass("enrolled")}
              onClick={() => toggleSegment("enrolled")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleSegment("enrolled");
                }
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <Activity className="h-6 w-6 text-yellow-400" />
                  <div className="text-3xl font-bold font-mono text-yellow-400">
                    {summary.totalEnrolled}
                  </div>
                </div>
                <p className="font-mono text-sm text-terminal-text-muted mt-2">
                  Enrolled Students
                </p>
                {segment === "enrolled" && (
                  <p className="font-mono text-xs text-terminal-green mt-2">
                    Filter enabled
                  </p>
                )}
              </CardContent>
            </Card>
            <Card
              role="button"
              tabIndex={0}
              className={getSummaryCardClass("inactive30")}
              onClick={() => toggleSegment("inactive30")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleSegment("inactive30");
                }
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <Users className="h-6 w-6 text-red-400" />
                  <div className="text-3xl font-bold font-mono text-red-400">
                    {summary.inactiveOver30Days}
                  </div>
                </div>
                <p className="font-mono text-sm text-terminal-text-muted mt-2">
                  Inactive 30+ Days
                </p>
                {segment === "inactive30" && (
                  <p className="font-mono text-xs text-terminal-green mt-2">
                    Filter enabled
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>
              Filter by programme enrollment, account status, and enrollment
              state
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-terminal-text-muted" />
                  <Input
                    placeholder="Search name or email..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  Programme
                </label>
                <Select
                  value={programmeId}
                  onValueChange={(value) => {
                    setProgrammeId(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All programmes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All programmes</SelectItem>
                    {programmes.map((programme) => (
                      <SelectItem key={programme.id} value={programme.id}>
                        {programme.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  Enrollment Status
                </label>
                <Select
                  value={enrollmentStatus}
                  onValueChange={(value) => {
                    setEnrollmentStatus(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="DROPPED">Dropped</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-mono text-terminal-text-muted mb-2 block">
                  Account Status
                </label>
                <Select
                  value={accountStatus}
                  onValueChange={(value) => {
                    setAccountStatus(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INVITED">Invited</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                    <SelectItem value="DELETED">Deleted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {hasFilters && (
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

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Students ({pagination?.totalCount || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-12 text-terminal-text-muted font-mono text-sm">
                No students found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="text-left text-terminal-text-muted border-b border-terminal-green/20">
                      <th className="py-3 pr-4">Student</th>
                      <th className="py-3 pr-4">Programmes</th>
                      <th className="py-3 pr-4">Avg Progress</th>
                      <th className="py-3 pr-4">Last Login</th>
                      <th className="py-3 pr-4">Last Learning</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr
                        key={student.id}
                        className="border-b border-terminal-green/10 hover:bg-terminal-green/5 transition-all"
                      >
                        <td className="py-4 pr-4">
                          <div className="text-terminal-text font-semibold">
                            {student.name || "Unnamed Student"}
                          </div>
                          <div className="text-terminal-text-muted text-xs">
                            {student.email}
                          </div>
                          <div className="text-terminal-text-muted text-xs mt-1">
                            Joined {formatDateTime(student.createdAt)}
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          {student.programmeCount === 0 ? (
                            <Badge variant="outline">No enrolments</Badge>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                {student.programmeTitles.slice(0, 2).map((t) => (
                                  <Badge key={t} variant="outline">
                                    {t}
                                  </Badge>
                                ))}
                                {student.programmeTitles.length > 2 && (
                                  <Badge variant="outline">
                                    +{student.programmeTitles.length - 2} more
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant={enrollmentVariant("ACTIVE")}>
                                  Active: {student.activeProgrammeCount}
                                </Badge>
                                <Badge
                                  variant={enrollmentVariant("COMPLETED")}
                                >
                                  Completed: {student.completedProgrammeCount}
                                </Badge>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          <div className="text-terminal-green font-semibold">
                            {student.averageProgress}%
                          </div>
                          <div className="h-2 bg-terminal-darker rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-terminal-green"
                              style={{ width: `${student.averageProgress}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="text-terminal-text">
                            {formatRelative(student.lastLoginAt)}
                          </div>
                          <div className="text-terminal-text-muted text-xs">
                            {formatDateTime(student.lastLoginAt)}
                          </div>
                          <div className="text-terminal-text-muted text-xs mt-1">
                            Logins: {student.totalLogins}
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="text-terminal-text">
                            {formatRelative(student.lastLearningAt)}
                          </div>
                          <div className="text-terminal-text-muted text-xs">
                            {formatDateTime(student.lastLearningAt)}
                          </div>
                          <div className="text-terminal-text-muted text-xs mt-1">
                            Last event: {formatRelative(student.lastAuditAt)}
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <Badge variant={statusVariant(student.status)}>
                            {student.status}
                          </Badge>
                        </td>
                        <td className="py-4 text-right">
                          <Link href={`/audit-students/${student.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                            >
                              View Audit
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-6">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  totalCount={pagination.totalCount}
                  pageSize={pagination.limit}
                  onPageChange={setPage}
                  showPageJump={pagination.totalPages > 10}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
