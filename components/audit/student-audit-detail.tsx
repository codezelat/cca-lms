"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
  RefreshCw,
  Shield,
  Terminal,
  User,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface StudentInfo {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  createdAt: string;
}

interface SummaryInfo {
  enrolledProgrammes: number;
  activeProgrammes: number;
  completedProgrammes: number;
  averageProgress: number;
  totalLogins: number;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  lastAuditAt: string | null;
  lastLearningAt: string | null;
  totalLessonCompletions: number;
  totalAssignmentSubmissions: number;
  totalLegacySubmissions: number;
}

interface EnrollmentInfo {
  id: string;
  courseId: string;
  courseTitle: string;
  courseStatus: string;
  status: string;
  progress: number;
  enrolledAt: string;
  completedAt: string | null;
  lastAccessedAt: string | null;
}

interface ActivityLogItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface LessonCompletionItem {
  id: string;
  lessonTitle: string | null;
  courseTitle: string | null;
  createdAt: string;
}

interface SubmissionItem {
  id: string;
  type: "assignment" | "lesson";
  title: string;
  courseTitle: string | null;
  status: string;
  submittedAt: string;
  gradedAt: string | null;
}

interface StudentAuditDetailData {
  student: StudentInfo;
  summary: SummaryInfo;
  enrollments: EnrollmentInfo[];
  recentActivity: ActivityLogItem[];
  lessonCompletions: LessonCompletionItem[];
  submissions: SubmissionItem[];
}

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

const submissionVariant = (status: string) => {
  switch (status) {
    case "SUBMITTED":
      return "info";
    case "GRADED":
      return "success";
    case "RETURNED":
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

const formatAction = (value: string) => {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
};

export default function StudentAuditDetail({ studentId }: { studentId: string }) {
  const [data, setData] = useState<StudentAuditDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const fetchDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/admin/student-audit/${studentId}`);
      if (!response.ok) {
        throw new Error("Failed to load student audit detail");
      }
      const detail = await response.json();
      setData(detail);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-terminal-dark flex items-center justify-center">
        <div className="flex items-center gap-3 text-terminal-green font-mono">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading student audit...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-terminal-dark flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-6">
            <p className="font-mono text-sm text-destructive mb-4">
              {error || "Unable to load student audit data"}
            </p>
            <Button onClick={fetchDetail} variant="outline" size="sm">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { student, summary, enrollments, recentActivity, lessonCompletions, submissions } =
    data;

  return (
    <div className="min-h-screen bg-terminal-dark">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-6 w-6 text-terminal-green" />
                <h1 className="font-mono text-3xl font-bold text-terminal-green terminal-glow">
                  $ audit-student --{student.name || student.email}
                </h1>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted">
                Detailed audit trail for student learning and access signals
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/audit-students">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={fetchDetail}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Student summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Student Overview
            </CardTitle>
            <CardDescription>
              Account status, onboarding date, and access cadence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-terminal-text font-semibold">
                  {student.name || "Unnamed Student"}
                </div>
                <div className="text-terminal-text-muted text-sm">
                  {student.email}
                </div>
              </div>
              <div>
                <div className="text-terminal-text-muted text-xs mb-1">
                  Account Status
                </div>
                <Badge variant={statusVariant(student.status)}>
                  {student.status}
                </Badge>
              </div>
              <div>
                <div className="text-terminal-text-muted text-xs mb-1">
                  Joined
                </div>
                <div className="text-terminal-text">
                  {formatDateTime(student.createdAt)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <BookOpen className="h-6 w-6 text-terminal-green" />
                <div className="text-3xl font-bold font-mono text-terminal-green">
                  {summary.enrolledProgrammes}
                </div>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted mt-2">
                Programmes Enrolled
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={enrollmentVariant("ACTIVE")}>
                  Active {summary.activeProgrammes}
                </Badge>
                <Badge variant={enrollmentVariant("COMPLETED")}>
                  Completed {summary.completedProgrammes}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <GraduationCap className="h-6 w-6 text-blue-400" />
                <div className="text-3xl font-bold font-mono text-blue-400">
                  {summary.averageProgress}%
                </div>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted mt-2">
                Average Progress
              </p>
              <div className="h-2 bg-terminal-darker rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-blue-400"
                  style={{ width: `${summary.averageProgress}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <Shield className="h-6 w-6 text-terminal-green" />
                <div className="text-3xl font-bold font-mono text-terminal-green">
                  {summary.totalLogins}
                </div>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted mt-2">
                Total Logins
              </p>
              <div className="mt-3 text-xs text-terminal-text-muted">
                First: {formatDateTime(summary.firstLoginAt)}
              </div>
              <div className="text-xs text-terminal-text-muted">
                Last: {formatDateTime(summary.lastLoginAt)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <Activity className="h-6 w-6 text-yellow-400" />
                <div className="text-3xl font-bold font-mono text-yellow-400">
                  {formatRelative(summary.lastAuditAt)}
                </div>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted mt-2">
                Last Audit Event
              </p>
              <div className="mt-3 text-xs text-terminal-text-muted">
                Last learning: {formatDateTime(summary.lastLearningAt)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <CheckCircle2 className="h-6 w-6 text-terminal-green" />
                <div className="text-3xl font-bold font-mono text-terminal-green">
                  {summary.totalLessonCompletions}
                </div>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted mt-2">
                Lesson Completions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <FileText className="h-6 w-6 text-blue-400" />
                <div className="text-3xl font-bold font-mono text-blue-400">
                  {summary.totalAssignmentSubmissions + summary.totalLegacySubmissions}
                </div>
              </div>
              <p className="font-mono text-sm text-terminal-text-muted mt-2">
                Submissions Logged
              </p>
              <div className="mt-3 text-xs text-terminal-text-muted">
                Assignments: {summary.totalAssignmentSubmissions}
              </div>
              <div className="text-xs text-terminal-text-muted">
                Lessons: {summary.totalLegacySubmissions}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enrollments */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Programme Enrollments
            </CardTitle>
            <CardDescription>
              Status, progress, and last access per programme
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enrollments.length === 0 ? (
              <div className="text-center py-8 text-terminal-text-muted font-mono text-sm">
                No programme enrollments found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="text-left text-terminal-text-muted border-b border-terminal-green/20">
                      <th className="py-3 pr-4">Programme</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Progress</th>
                      <th className="py-3 pr-4">Enrolled</th>
                      <th className="py-3 pr-4">Completed</th>
                      <th className="py-3 pr-4">Last Accessed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((enrollment) => (
                      <tr
                        key={enrollment.id}
                        className="border-b border-terminal-green/10 hover:bg-terminal-green/5 transition-all"
                      >
                        <td className="py-4 pr-4">
                          <div className="text-terminal-text font-semibold">
                            {enrollment.courseTitle}
                          </div>
                          <div className="text-terminal-text-muted text-xs">
                            {enrollment.courseStatus}
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <Badge variant={enrollmentVariant(enrollment.status)}>
                            {enrollment.status}
                          </Badge>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="text-terminal-green font-semibold">
                            {Math.round(enrollment.progress)}%
                          </div>
                          <div className="h-2 bg-terminal-darker rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-terminal-green"
                              style={{ width: `${enrollment.progress}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          {formatDateTime(enrollment.enrolledAt)}
                        </td>
                        <td className="py-4 pr-4">
                          {formatDateTime(enrollment.completedAt)}
                        </td>
                        <td className="py-4 pr-4">
                          {formatDateTime(enrollment.lastAccessedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>Last 20 audit events</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-6 text-terminal-text-muted font-mono text-sm">
                  No recent activity logs.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-md border border-terminal-green/10 bg-terminal-darker/30"
                    >
                      <div className="mt-1 h-2 w-2 rounded-full bg-terminal-green animate-pulse shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-terminal-text">
                          {formatAction(activity.action)}
                          {activity.entityType && (
                            <span className="text-terminal-green">
                              {" "}
                              {activity.entityType}
                            </span>
                          )}
                        </p>
                        <p className="text-xs font-mono text-terminal-text-muted mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelative(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <Link href={`/activity-logs?userId=${student.id}`}>
                  <Button variant="outline" className="w-full gap-2">
                    View Full Activity Logs
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {/* Recent Completions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Recent Completions
                </CardTitle>
                <CardDescription>Last recorded lesson completions</CardDescription>
              </CardHeader>
              <CardContent>
                {lessonCompletions.length === 0 ? (
                  <div className="text-center py-6 text-terminal-text-muted font-mono text-sm">
                    No lesson completions logged.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lessonCompletions.map((completion) => (
                      <div
                        key={completion.id}
                        className="p-3 rounded-md border border-terminal-green/10 bg-terminal-darker/30"
                      >
                        <div className="text-sm font-mono text-terminal-text">
                          {completion.lessonTitle || "Lesson completed"}
                        </div>
                        <div className="text-xs font-mono text-terminal-text-muted mt-1">
                          {completion.courseTitle || "Programme"}
                        </div>
                        <div className="text-xs font-mono text-terminal-text-muted mt-2 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDateTime(completion.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Submissions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Recent Submissions
                </CardTitle>
                <CardDescription>Assignments and lesson submissions</CardDescription>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <div className="text-center py-6 text-terminal-text-muted font-mono text-sm">
                    No submissions recorded.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submissions.map((submission) => (
                      <div
                        key={submission.id}
                        className="p-3 rounded-md border border-terminal-green/10 bg-terminal-darker/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-mono text-terminal-text">
                              {submission.title}
                            </div>
                            <div className="text-xs font-mono text-terminal-text-muted">
                              {submission.courseTitle || "Programme"}
                            </div>
                          </div>
                          <Badge variant={submissionVariant(submission.status)}>
                            {submission.status}
                          </Badge>
                        </div>
                        <div className="text-xs font-mono text-terminal-text-muted mt-2 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Submitted {formatRelative(submission.submittedAt)}
                        </div>
                        {submission.gradedAt && (
                          <div className="text-xs font-mono text-terminal-text-muted mt-1">
                            Graded {formatDateTime(submission.gradedAt)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
