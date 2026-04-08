import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction, type Prisma } from "@/generated/prisma";

const toPositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseDateParam = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isAuditAction = (value: string): value is AuditAction => {
  return Object.values(AuditAction).includes(value as AuditAction);
};

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = toPositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(toPositiveInt(searchParams.get("limit"), 20), 100);
    const action = (searchParams.get("action") || "").trim();
    const entityType = (searchParams.get("entityType") || "").trim();
    const userId = (searchParams.get("userId") || "").trim();
    const search = (searchParams.get("search") || "").trim();
    const startDate = parseDateParam(searchParams.get("startDate"));
    const endDate = parseDateParam(searchParams.get("endDate"));

    if (searchParams.get("startDate") && !startDate) {
      return NextResponse.json(
        { error: "Invalid startDate parameter" },
        { status: 400 },
      );
    }

    if (searchParams.get("endDate") && !endDate) {
      return NextResponse.json(
        { error: "Invalid endDate parameter" },
        { status: 400 },
      );
    }

    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      if (!isAuditAction(action)) {
        return NextResponse.json(
          { error: "Invalid action parameter" },
          { status: 400 },
        );
      }
      where.action = action as AuditAction;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (userId) {
      where.userId = userId;
    }

    if (search) {
      const searchClauses: Prisma.AuditLogWhereInput[] = [
        { entityType: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
        {
          user: {
            is: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ];

      const matchingActions = Object.values(AuditAction).filter((value) =>
        value.toLowerCase().includes(search.toLowerCase()),
      );

      if (matchingActions.length > 0) {
        searchClauses.push({ action: { in: matchingActions } });
      }

      where.OR = searchClauses;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        const inclusiveEndDate = new Date(endDate);
        inclusiveEndDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = inclusiveEndDate;
      }
    }

    // Fetch activity logs with pagination
    const [activities, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Get filter options
    const [actionTypes, allEntityTypes] = await Promise.all([
      prisma.auditLog.findMany({
        select: { action: true },
        distinct: ["action"],
        orderBy: { action: "asc" },
      }),
      prisma.auditLog.findMany({
        select: { entityType: true },
        distinct: ["entityType"],
        orderBy: { entityType: "asc" },
      }),
    ]);

    // Filter out null entity types
    const entityTypes = allEntityTypes
      .map((e) => e.entityType)
      .filter((type): type is string => type !== null);

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      activities: activities.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        metadata: a.metadata,
        ipAddress: a.ipAddress,
        userAgent: a.userAgent,
        createdAt: a.createdAt.toISOString(),
        user: a.user
          ? {
              id: a.user.id,
              name: a.user.name,
              email: a.user.email,
              role: a.user.role,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        actionTypes: actionTypes.map((a) => a.action),
        entityTypes: entityTypes,
      },
    });
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity logs" },
      { status: 500 },
    );
  }
}
