import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, type AuditAction } from "@/generated/prisma";
import type { AccountStatus, EnrollmentStatus } from "@/generated/prisma";

const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  "ACTIVE",
  "INVITED",
  "SUSPENDED",
  "DELETED",
];
const ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  "ACTIVE",
  "COMPLETED",
  "DROPPED",
];
const SEGMENTS = ["all", "enrolled", "active7", "inactive30"] as const;
type StudentAuditSegment = (typeof SEGMENTS)[number];

const toPositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const upsertLatestDate = (
  map: Map<string, Date>,
  userId: string,
  value: Date | null,
) => {
  if (!value) return;
  const prev = map.get(userId);
  if (!prev || value > prev) {
    map.set(userId, value);
  }
};

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

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const fallbackWarnings: string[] = [];

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = toPositiveInt(searchParams.get("page"), 1);
    const limit = toPositiveInt(searchParams.get("limit"), 10);
    const search = searchParams.get("search") || "";
    const programmeId = searchParams.get("programmeId") || "";
    const enrollmentStatus = searchParams.get("enrollmentStatus") || "";
    const accountStatus = searchParams.get("accountStatus") || "";
    const segmentRaw = searchParams.get("segment") || "all";
    const segment = SEGMENTS.includes(segmentRaw as StudentAuditSegment)
      ? (segmentRaw as StudentAuditSegment)
      : "all";

    const skip = (page - 1) * limit;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const lessonCompletedSupported =
      await isAuditActionAvailable("LESSON_COMPLETED");

    const fetchAllStudentIds = async () => {
      const students = await prisma.user.findMany({
        where: { role: "STUDENT" },
        select: { id: true },
      });
      return students.map((student) => student.id);
    };

    const fetchActiveStudentIdsSince = async (since: Date) => {
      try {
        const rows = await prisma.auditLog.findMany({
          where: {
            action: "USER_LOGIN",
            createdAt: { gte: since },
            user: { is: { role: "STUDENT" } },
          },
          select: { userId: true },
          distinct: ["userId"],
        });
        return rows
          .map((row) => row.userId)
          .filter((id): id is string => Boolean(id));
      } catch {
        const studentIds = await fetchAllStudentIds();
        if (studentIds.length === 0) return [];
        const rows = await prisma.auditLog.findMany({
          where: {
            action: "USER_LOGIN",
            createdAt: { gte: since },
            userId: { in: studentIds },
          },
          select: { userId: true },
          distinct: ["userId"],
        });
        return rows
          .map((row) => row.userId)
          .filter((id): id is string => Boolean(id));
      }
    };

    const where: Prisma.UserWhereInput = {
      role: "STUDENT",
    };

    if (segment !== "all") {
      let segmentStudentIds: string[] = [];

      if (segment === "enrolled") {
        try {
          const rows = await prisma.courseEnrollment.findMany({
            where: { user: { is: { role: "STUDENT" } } },
            select: { userId: true },
            distinct: ["userId"],
          });
          segmentStudentIds = rows.map((row) => row.userId);
        } catch {
          const allStudents = await fetchAllStudentIds();
          if (allStudents.length > 0) {
            const rows = await prisma.courseEnrollment.findMany({
              where: { userId: { in: allStudents } },
              select: { userId: true },
              distinct: ["userId"],
            });
            segmentStudentIds = rows.map((row) => row.userId);
          }
        }
      }

      if (segment === "active7") {
        segmentStudentIds = await fetchActiveStudentIdsSince(sevenDaysAgo);
      }

      if (segment === "inactive30") {
        const [allStudents, activeStudents30] = await Promise.all([
          fetchAllStudentIds(),
          fetchActiveStudentIdsSince(thirtyDaysAgo),
        ]);
        const activeSet = new Set(activeStudents30);
        segmentStudentIds = allStudents.filter((id) => !activeSet.has(id));
      }

      where.id = {
        in: segmentStudentIds.length > 0 ? segmentStudentIds : ["__no_match__"],
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (
      accountStatus &&
      ACCOUNT_STATUSES.includes(accountStatus as AccountStatus)
    ) {
      where.status = accountStatus as AccountStatus;
    }

    const enrollmentWhere: Prisma.CourseEnrollmentWhereInput = {};

    if (programmeId) {
      enrollmentWhere.courseId = programmeId;
    }

    if (
      enrollmentStatus &&
      ENROLLMENT_STATUSES.includes(enrollmentStatus as EnrollmentStatus)
    ) {
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

    const loginMap = new Map<
      string,
      { totalLogins: number; firstLoginAt: Date | null; lastLoginAt: Date | null }
    >();
    const activityMap = new Map<string, Date>();
    const completionMap = new Map<
      string,
      { totalCompletions: number; lastCompletionAt: Date | null }
    >();

    if (studentIds.length > 0) {
      try {
        const loginQuery = prisma.auditLog.groupBy({
          by: ["userId"],
          where: {
            userId: { in: studentIds },
            action: "USER_LOGIN",
          },
          _count: { _all: true },
          _min: { createdAt: true },
          _max: { createdAt: true },
        });

        const activityQuery = prisma.auditLog.groupBy({
          by: ["userId"],
          where: {
            userId: { in: studentIds },
          },
          _max: { createdAt: true },
        });

        const completionQuery = lessonCompletedSupported
          ? prisma.auditLog.groupBy({
              by: ["userId"],
              where: {
                userId: { in: studentIds },
                action: "LESSON_COMPLETED",
              },
              _count: { _all: true },
              _max: { createdAt: true },
            })
          : Promise.resolve([]);

        const [loginStats, activityStats, completionStats] = await Promise.all([
          loginQuery,
          activityQuery,
          completionQuery,
        ]);

        loginStats.forEach((stat) => {
          if (!stat.userId) return;
          loginMap.set(stat.userId, {
            totalLogins: stat._count._all,
            firstLoginAt: stat._min.createdAt,
            lastLoginAt: stat._max.createdAt,
          });
        });

        activityStats.forEach((stat) => {
          if (!stat.userId) return;
          upsertLatestDate(activityMap, stat.userId, stat._max.createdAt);
        });

        completionStats.forEach((stat) => {
          if (!stat.userId) return;
          completionMap.set(stat.userId, {
            totalCompletions: stat._count._all,
            lastCompletionAt: stat._max.createdAt,
          });
        });
      } catch (groupByError) {
        fallbackWarnings.push(`groupBy-aggregation: ${getErrorMessage(groupByError)}`);

        const auditRows = await prisma.auditLog.findMany({
          where: { userId: { in: studentIds } },
          select: { userId: true, action: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });

        auditRows.forEach((row) => {
          if (!row.userId) return;

          upsertLatestDate(activityMap, row.userId, row.createdAt);

          if (row.action === ("USER_LOGIN" as AuditAction)) {
            const prev = loginMap.get(row.userId);
            if (!prev) {
              loginMap.set(row.userId, {
                totalLogins: 1,
                firstLoginAt: row.createdAt,
                lastLoginAt: row.createdAt,
              });
            } else {
              prev.totalLogins += 1;
              if (!prev.firstLoginAt || row.createdAt < prev.firstLoginAt) {
                prev.firstLoginAt = row.createdAt;
              }
              if (!prev.lastLoginAt || row.createdAt > prev.lastLoginAt) {
                prev.lastLoginAt = row.createdAt;
              }
            }
          }

          if (
            lessonCompletedSupported &&
            row.action === ("LESSON_COMPLETED" as AuditAction)
          ) {
            const prev = completionMap.get(row.userId);
            if (!prev) {
              completionMap.set(row.userId, {
                totalCompletions: 1,
                lastCompletionAt: row.createdAt,
              });
            } else {
              prev.totalCompletions += 1;
              if (!prev.lastCompletionAt || row.createdAt > prev.lastCompletionAt) {
                prev.lastCompletionAt = row.createdAt;
              }
            }
          }
        });
      }
    }

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

    let totalStudents = 0;
    let enrolledStudentsCount = 0;
    let activeLast7DaysCount = 0;
    let activeLast30DaysCount = 0;

    try {
      const [total, enrolledStudents, activeLast7Days, activeLast30Days] =
        await Promise.all([
          prisma.user.count({
            where: { role: "STUDENT" },
          }),
          prisma.courseEnrollment.findMany({
            where: { user: { is: { role: "STUDENT" } } },
            select: { userId: true },
            distinct: ["userId"],
          }),
          prisma.auditLog.findMany({
            where: {
              action: "USER_LOGIN",
              createdAt: { gte: sevenDaysAgo },
              user: { is: { role: "STUDENT" } },
            },
            select: { userId: true },
            distinct: ["userId"],
          }),
          prisma.auditLog.findMany({
            where: {
              action: "USER_LOGIN",
              createdAt: { gte: thirtyDaysAgo },
              user: { is: { role: "STUDENT" } },
            },
            select: { userId: true },
            distinct: ["userId"],
          }),
        ]);

      totalStudents = total;
      enrolledStudentsCount = enrolledStudents.length;
      activeLast7DaysCount = activeLast7Days.length;
      activeLast30DaysCount = activeLast30Days.length;
    } catch (summaryError) {
      fallbackWarnings.push(
        `summary-relation-query: ${getErrorMessage(summaryError)}`,
      );

      const studentIdsForSummary = await prisma.user.findMany({
        where: { role: "STUDENT" },
        select: { id: true },
      });
      const studentIdList = studentIdsForSummary.map((student) => student.id);
      totalStudents = studentIdList.length;

      if (studentIdList.length > 0) {
        const [enrolledStudents, activeLast7Days, activeLast30Days] =
          await Promise.all([
            prisma.courseEnrollment.findMany({
              where: { userId: { in: studentIdList } },
              select: { userId: true },
              distinct: ["userId"],
            }),
            prisma.auditLog.findMany({
              where: {
                action: "USER_LOGIN",
                createdAt: { gte: sevenDaysAgo },
                userId: { in: studentIdList },
              },
              select: { userId: true },
              distinct: ["userId"],
            }),
            prisma.auditLog.findMany({
              where: {
                action: "USER_LOGIN",
                createdAt: { gte: thirtyDaysAgo },
                userId: { in: studentIdList },
              },
              select: { userId: true },
              distinct: ["userId"],
            }),
          ]);

        enrolledStudentsCount = enrolledStudents.length;
        activeLast7DaysCount = activeLast7Days.length;
        activeLast30DaysCount = activeLast30Days.length;
      }
    }

    const inactiveOver30Days = Math.max(totalStudents - activeLast30DaysCount, 0);

    if (fallbackWarnings.length > 0) {
      console.warn("Student audit list used fallback queries", {
        count: fallbackWarnings.length,
        reasons: fallbackWarnings.slice(0, 3),
      });
    }

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
        totalEnrolled: enrolledStudentsCount,
        activeLast7Days: activeLast7DaysCount,
        inactiveOver30Days,
      },
    });
  } catch (error) {
    console.error("Error fetching student audit data:", error);
    const details =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : undefined;
    return NextResponse.json(
      { error: "Failed to fetch student audit data", details },
      { status: 500 },
    );
  }
}
