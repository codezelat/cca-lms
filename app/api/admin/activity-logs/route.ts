import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildActivityLogWhere,
  MAX_ACTIVITY_LOG_PAGE_LIMIT,
  parseActivityLogFilters,
  toPositiveInt,
} from "@/lib/activity-logs";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = toPositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(
      toPositiveInt(searchParams.get("limit"), 20),
      MAX_ACTIVITY_LOG_PAGE_LIMIT,
    );
    const parsedFilters = parseActivityLogFilters(searchParams);
    if ("error" in parsedFilters) {
      return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
    }

    const skip = (page - 1) * limit;
    const where = buildActivityLogWhere(parsedFilters.filters);

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
