import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, AccountStatus, EnrollmentStatus } from "@/generated/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const programmeId = searchParams.get("programmeId") || "";
    const enrollmentStatus = searchParams.get("enrollmentStatus") || "";
    const accountStatus = searchParams.get("accountStatus") || "";

    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: "STUDENT",
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (accountStatus) {
      where.status = accountStatus as AccountStatus;
    }

    const enrollmentWhere: Prisma.CourseEnrollmentWhereInput = {};

    if (programmeId) {
      enrollmentWhere.courseId = programmeId;
    }

    if (enrollmentStatus) {
      enrollmentWhere.status = enrollmentStatus as EnrollmentStatus;
    }

    if (Object.keys(enrollmentWhere).length > 0) {
      where.courses = { some: enrollmentWhere };
    }

    const [students, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          courses: {
            select: {
              id: true,
              status: true,
              progress: true,
              enrolledAt: true,
              completedAt: true,
              lastAccessedAt: true,
              course: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const studentIds = students.map((student) => student.id);

    let loginStats: Array<{
      userId: string | null;
      _count: { _all: number };
      _min: { createdAt: Date | null };
      _max: { createdAt: Date | null };
    }> = [];
    let activityStats: Array<{
      userId: string | null;
      _max: { createdAt: Date | null };
    }> = [];
    let completionStats: Array<{
      userId: string | null;
      _count: { _all: number };
      _max: { createdAt: Date | null };
    }> = [];

    if (studentIds.length > 0) {
      [loginStats, activityStats, completionStats] = await Promise.all([
        prisma.auditLog.groupBy({
          by: ["userId"],
          where: {
            userId: { in: studentIds },
            action: "USER_LOGIN",
          },
          _count: { _all: true },
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
        prisma.auditLog.groupBy({
          by: ["userId"],
          where: {
            userId: { in: studentIds },
          },
          _max: { createdAt: true },
        }),
        prisma.auditLog.groupBy({
          by: ["userId"],
          where: {
            userId: { in: studentIds },
            action: "LESSON_COMPLETED",
          },
          _count: { _all: true },
          _max: { createdAt: true },
        }),
      ]);
    }

    const loginMap = new Map(
      loginStats.map((stat) => [
        stat.userId || "",
        {
          totalLogins: stat._count._all,
          firstLoginAt: stat._min.createdAt,
          lastLoginAt: stat._max.createdAt,
        },
      ]),
    );

    const activityMap = new Map(
      activityStats.map((stat) => [stat.userId || "", stat._max.createdAt]),
    );

    const completionMap = new Map(
      completionStats.map((stat) => [
        stat.userId || "",
        {
          totalCompletions: stat._count._all,
          lastCompletionAt: stat._max.createdAt,
        },
      ]),
    );

    const rows = students.map((student) => {
      const enrolments = student.courses;
      const programmeTitles = Array.from(
        new Set(enrolments.map((enrollment) => enrollment.course.title)),
      );

      const programmeCount = enrolments.length;
      const activeProgrammeCount = enrolments.filter(
        (enrollment) => enrollment.status === "ACTIVE",
      ).length;
      const completedProgrammeCount = enrolments.filter(
        (enrollment) => enrollment.status === "COMPLETED",
      ).length;
      const averageProgress =
        programmeCount > 0
          ? Math.round(
              enrolments.reduce(
                (sum, enrollment) => sum + enrollment.progress,
                0,
              ) / programmeCount,
            )
          : 0;

      const lastLearningAt = enrolments.reduce<Date | null>((latest, entry) => {
        const candidate = entry.lastAccessedAt || entry.completedAt || null;
        if (!candidate) return latest;
        if (!latest || candidate > latest) return candidate;
        return latest;
      }, null);

      const login = loginMap.get(student.id);
      const lastAuditAt = activityMap.get(student.id) || null;

      const engagementCandidates = [
        login?.lastLoginAt || null,
        lastLearningAt,
        lastAuditAt,
      ].filter(Boolean) as Date[];

      const lastEngagementAt =
        engagementCandidates.length > 0
          ? new Date(
              Math.max(...engagementCandidates.map((d) => d.getTime())),
            )
          : null;

      return {
        id: student.id,
        name: student.name,
        email: student.email,
        status: student.status,
        createdAt: student.createdAt.toISOString(),
        programmeCount,
        activeProgrammeCount,
        completedProgrammeCount,
        averageProgress,
        programmeTitles,
        lastLoginAt: login?.lastLoginAt
          ? login.lastLoginAt.toISOString()
          : null,
        firstLoginAt: login?.firstLoginAt
          ? login.firstLoginAt.toISOString()
          : null,
        totalLogins: login?.totalLogins || 0,
        lastLearningAt: lastLearningAt ? lastLearningAt.toISOString() : null,
        lastAuditAt: lastAuditAt ? lastAuditAt.toISOString() : null,
        lastEngagementAt: lastEngagementAt
          ? lastEngagementAt.toISOString()
          : null,
        totalLessonCompletions:
          completionMap.get(student.id)?.totalCompletions || 0,
        lastLessonCompletionAt:
          completionMap.get(student.id)?.lastCompletionAt?.toISOString() || null,
      };
    });

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalStudents, enrolledStudents, activeLast7Days, activeLast30Days] =
      await Promise.all([
        prisma.user.count({
          where: { role: "STUDENT" },
        }),
        prisma.courseEnrollment.findMany({
          where: { user: { role: "STUDENT" } },
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.auditLog.findMany({
          where: {
            action: "USER_LOGIN",
            createdAt: { gte: sevenDaysAgo },
            user: { role: "STUDENT" },
          },
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.auditLog.findMany({
          where: {
            action: "USER_LOGIN",
            createdAt: { gte: thirtyDaysAgo },
            user: { role: "STUDENT" },
          },
          select: { userId: true },
          distinct: ["userId"],
        }),
      ]);

    const inactiveOver30Days = Math.max(
      totalStudents - activeLast30Days.length,
      0,
    );

    return NextResponse.json({
      students: rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1,
      },
      summary: {
        totalStudents,
        totalEnrolled: enrolledStudents.length,
        activeLast7Days: activeLast7Days.length,
        inactiveOver30Days,
      },
    });
  } catch (error) {
    console.error("Error fetching student audit data:", error);
    return NextResponse.json(
      { error: "Failed to fetch student audit data" },
      { status: 500 },
    );
  }
}
