import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const isAuditActionAvailable = async (action: string) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>(Prisma.sql`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE LOWER(t.typname) = LOWER('AuditAction')
    `);
    return rows.some((row) => row.enumlabel === action);
  } catch (error) {
    console.error("Failed to read AuditAction enum labels:", error);
    return false;
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const fallbackWarnings: string[] = [];

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const student = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        role: true,
      },
    });

    if (!student || student.role !== "STUDENT") {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const lessonCompletedSupported =
      await isAuditActionAvailable("LESSON_COMPLETED");

    const [
      enrollmentsResult,
      loginAggResult,
      lastAuditResult,
      lessonCompletionCountResult,
      lessonCompletionsResult,
      recentActivityResult,
      assignmentSubmissionCountResult,
      legacySubmissionCountResult,
      assignmentSubmissionsResult,
      legacySubmissionsResult,
    ] = await Promise.allSettled([
      prisma.courseEnrollment.findMany({
        where: { userId: id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
        orderBy: { enrolledAt: "desc" },
      }),
      prisma.auditLog.aggregate({
        where: { userId: id, action: "USER_LOGIN" },
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      prisma.auditLog.findFirst({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
      }),
      lessonCompletedSupported
        ? prisma.auditLog.count({
            where: { userId: id, action: "LESSON_COMPLETED" },
          })
        : Promise.resolve(0),
      lessonCompletedSupported
        ? prisma.auditLog.findMany({
            where: { userId: id, action: "LESSON_COMPLETED" },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      prisma.auditLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.assignmentSubmission.count({
        where: {
          userId: id,
          status: { in: ["SUBMITTED", "GRADED", "RETURNED"] },
        },
      }),
      prisma.submission.count({
        where: {
          userId: id,
          status: { in: ["SUBMITTED", "GRADED", "RETURNED"] },
        },
      }),
      prisma.assignmentSubmission.findMany({
        where: {
          userId: id,
          status: { in: ["SUBMITTED", "GRADED", "RETURNED"] },
        },
        include: {
          assignment: {
            include: {
              lesson: {
                include: {
                  module: {
                    include: {
                      course: { select: { title: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.submission.findMany({
        where: {
          userId: id,
          status: { in: ["SUBMITTED", "GRADED", "RETURNED"] },
        },
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: { select: { title: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const enrollments =
      enrollmentsResult.status === "fulfilled" ? enrollmentsResult.value : [];
    if (enrollmentsResult.status === "rejected") {
      fallbackWarnings.push(
        `enrollments-query: ${getErrorMessage(enrollmentsResult.reason)}`,
      );
    }

    const loginAgg =
      loginAggResult.status === "fulfilled"
        ? loginAggResult.value
        : { _count: { _all: 0 }, _min: { createdAt: null }, _max: { createdAt: null } };
    if (loginAggResult.status === "rejected") {
      fallbackWarnings.push(
        `login-aggregate: ${getErrorMessage(loginAggResult.reason)}`,
      );
    }

    const lastAudit =
      lastAuditResult.status === "fulfilled" ? lastAuditResult.value : null;
    if (lastAuditResult.status === "rejected") {
      fallbackWarnings.push(
        `latest-audit-query: ${getErrorMessage(lastAuditResult.reason)}`,
      );
    }

    const lessonCompletionCount =
      lessonCompletionCountResult.status === "fulfilled"
        ? lessonCompletionCountResult.value
        : 0;
    if (lessonCompletionCountResult.status === "rejected") {
      fallbackWarnings.push(
        `lesson-completion-count: ${getErrorMessage(
          lessonCompletionCountResult.reason,
        )}`,
      );
    }

    const lessonCompletions =
      lessonCompletionsResult.status === "fulfilled"
        ? lessonCompletionsResult.value
        : [];
    if (lessonCompletionsResult.status === "rejected") {
      fallbackWarnings.push(
        `lesson-completions: ${getErrorMessage(lessonCompletionsResult.reason)}`,
      );
    }

    const recentActivity =
      recentActivityResult.status === "fulfilled" ? recentActivityResult.value : [];
    if (recentActivityResult.status === "rejected") {
      fallbackWarnings.push(
        `recent-activity: ${getErrorMessage(recentActivityResult.reason)}`,
      );
    }

    const assignmentSubmissions =
      assignmentSubmissionsResult.status === "fulfilled"
        ? assignmentSubmissionsResult.value
        : [];
    if (assignmentSubmissionsResult.status === "rejected") {
      fallbackWarnings.push(
        `assignment-submissions: ${getErrorMessage(
          assignmentSubmissionsResult.reason,
        )}`,
      );
    }

    const legacySubmissions =
      legacySubmissionsResult.status === "fulfilled"
        ? legacySubmissionsResult.value
        : [];
    if (legacySubmissionsResult.status === "rejected") {
      fallbackWarnings.push(
        `legacy-submissions: ${getErrorMessage(legacySubmissionsResult.reason)}`,
      );
    }

    const assignmentSubmissionCount =
      assignmentSubmissionCountResult.status === "fulfilled"
        ? assignmentSubmissionCountResult.value
        : assignmentSubmissions.length;
    if (assignmentSubmissionCountResult.status === "rejected") {
      fallbackWarnings.push(
        `assignment-submission-count: ${getErrorMessage(
          assignmentSubmissionCountResult.reason,
        )}`,
      );
    }

    const legacySubmissionCount =
      legacySubmissionCountResult.status === "fulfilled"
        ? legacySubmissionCountResult.value
        : legacySubmissions.length;
    if (legacySubmissionCountResult.status === "rejected") {
      fallbackWarnings.push(
        `legacy-submission-count: ${getErrorMessage(
          legacySubmissionCountResult.reason,
        )}`,
      );
    }

    const enrolledProgrammes = enrollments.length;
    const activeProgrammes = enrollments.filter(
      (enrollment) => enrollment.status === "ACTIVE",
    ).length;
    const completedProgrammes = enrollments.filter(
      (enrollment) => enrollment.status === "COMPLETED",
    ).length;
    const averageProgress =
      enrolledProgrammes > 0
        ? Math.round(
            enrollments.reduce(
              (sum, enrollment) => sum + enrollment.progress,
              0,
            ) / enrolledProgrammes,
          )
        : 0;

    const lastLearningAt = enrollments.reduce<Date | null>((latest, entry) => {
      const candidate = entry.lastAccessedAt || entry.completedAt || null;
      if (!candidate) return latest;
      if (!latest || candidate > latest) return candidate;
      return latest;
    }, null);

    const lessonCompletionCourseIds = lessonCompletions
      .map((completion) => completion.metadata)
      .filter((meta): meta is { courseId?: string; lessonTitle?: string } =>
        Boolean(meta && typeof meta === "object"),
      )
      .map((meta) => meta.courseId)
      .filter((id): id is string => Boolean(id));

    const courseMap = new Map<string, string>();
    if (lessonCompletionCourseIds.length > 0) {
      try {
        const courses = await prisma.course.findMany({
          where: { id: { in: lessonCompletionCourseIds } },
          select: { id: true, title: true },
        });
        courses.forEach((course) => courseMap.set(course.id, course.title));
      } catch (courseLookupError) {
        fallbackWarnings.push(
          `completion-course-lookup: ${getErrorMessage(courseLookupError)}`,
        );
      }
    }

    const mappedCompletions = lessonCompletions.map((completion) => {
      const metadata =
        completion.metadata && typeof completion.metadata === "object"
          ? (completion.metadata as { lessonTitle?: string; courseId?: string })
          : {};

      return {
        id: completion.id,
        lessonTitle: metadata.lessonTitle || null,
        courseTitle: metadata.courseId
          ? courseMap.get(metadata.courseId) || null
          : null,
        createdAt: completion.createdAt.toISOString(),
      };
    });

    const mappedAssignmentSubmissions = assignmentSubmissions.map((submission) => ({
      id: submission.id,
      type: "assignment" as const,
      title: submission.assignment.title,
      courseTitle: submission.assignment.lesson.module.course.title,
      status: submission.status,
      submittedAt: (submission.submittedAt || submission.createdAt).toISOString(),
      gradedAt: submission.gradedAt ? submission.gradedAt.toISOString() : null,
    }));

    const mappedLegacySubmissions = legacySubmissions.map((submission) => ({
      id: submission.id,
      type: "lesson" as const,
      title: submission.lesson.title,
      courseTitle: submission.lesson.module.course.title,
      status: submission.status,
      submittedAt: (submission.submittedAt || submission.createdAt).toISOString(),
      gradedAt: submission.gradedAt ? submission.gradedAt.toISOString() : null,
    }));

    const allSubmissions = [...mappedAssignmentSubmissions, ...mappedLegacySubmissions]
      .sort((a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )
      .slice(0, 10);

    if (fallbackWarnings.length > 0) {
      console.warn("Student audit detail used fallback queries", {
        studentId: id,
        count: fallbackWarnings.length,
        reasons: fallbackWarnings.slice(0, 4),
      });
    }

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        status: student.status,
        createdAt: student.createdAt.toISOString(),
      },
      summary: {
        enrolledProgrammes,
        activeProgrammes,
        completedProgrammes,
        averageProgress,
        totalLogins: loginAgg._count._all,
        firstLoginAt: loginAgg._min.createdAt
          ? loginAgg._min.createdAt.toISOString()
          : null,
        lastLoginAt: loginAgg._max.createdAt
          ? loginAgg._max.createdAt.toISOString()
          : null,
        lastAuditAt: lastAudit?.createdAt
          ? lastAudit.createdAt.toISOString()
          : null,
        lastLearningAt: lastLearningAt ? lastLearningAt.toISOString() : null,
        totalLessonCompletions: lessonCompletionCount,
        totalAssignmentSubmissions: assignmentSubmissionCount,
        totalLegacySubmissions: legacySubmissionCount,
      },
      enrollments: enrollments.map((enrollment) => ({
        id: enrollment.id,
        courseId: enrollment.courseId,
        courseTitle: enrollment.course.title,
        courseStatus: enrollment.course.status,
        status: enrollment.status,
        progress: enrollment.progress,
        enrolledAt: enrollment.enrolledAt.toISOString(),
        completedAt: enrollment.completedAt
          ? enrollment.completedAt.toISOString()
          : null,
        lastAccessedAt: enrollment.lastAccessedAt
          ? enrollment.lastAccessedAt.toISOString()
          : null,
      })),
      recentActivity: recentActivity.map((activity) => ({
        id: activity.id,
        action: activity.action,
        entityType: activity.entityType,
        entityId: activity.entityId,
        metadata: activity.metadata as Record<string, unknown> | null,
        createdAt: activity.createdAt.toISOString(),
      })),
      lessonCompletions: mappedCompletions,
      submissions: allSubmissions,
    });
  } catch (error) {
    console.error("Error fetching student audit detail:", error);
    const details =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : undefined;
    return NextResponse.json(
      { error: "Failed to fetch student audit detail", details },
      { status: 500 },
    );
  }
}
