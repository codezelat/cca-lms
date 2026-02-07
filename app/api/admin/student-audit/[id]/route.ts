import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

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

    const [
      enrollments,
      loginAgg,
      lastAudit,
      lessonCompletionCount,
      lessonCompletions,
      recentActivity,
      assignmentSubmissionCount,
      legacySubmissionCount,
      assignmentSubmissions,
      legacySubmissions,
    ] = await Promise.all([
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
      prisma.auditLog.count({
        where: { userId: id, action: "LESSON_COMPLETED" },
      }),
      prisma.auditLog.findMany({
        where: { userId: id, action: "LESSON_COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
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
      const courses = await prisma.course.findMany({
        where: { id: { in: lessonCompletionCourseIds } },
        select: { id: true, title: true },
      });
      courses.forEach((course) => courseMap.set(course.id, course.title));
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
    return NextResponse.json(
      { error: "Failed to fetch student audit detail" },
      { status: 500 },
    );
  }
}
