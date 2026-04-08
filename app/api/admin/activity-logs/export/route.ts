import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import {
  ACTIVITY_LOG_EXPORT_BATCH_SIZE,
  buildActivityLogWhere,
  escapeCsvCell,
  parseActivityLogFilters,
} from "@/lib/activity-logs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsedFilters = parseActivityLogFilters(searchParams);
    if ("error" in parsedFilters) {
      return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
    }

    const exportStartedAt = new Date();
    const where = buildActivityLogWhere(parsedFilters.filters);
    const currentCreatedAtFilter =
      where.createdAt && typeof where.createdAt === "object"
        ? (where.createdAt as Prisma.DateTimeFilter<"AuditLog">)
        : null;
    const exportUpperBound = currentCreatedAtFilter?.lte ?? exportStartedAt;
    const nextCreatedAtFilter: Prisma.DateTimeFilter<"AuditLog"> = {
      lte: exportUpperBound,
    };
    if (currentCreatedAtFilter?.gte) {
      nextCreatedAtFilter.gte = currentCreatedAtFilter.gte;
    }
    where.createdAt = nextCreatedAtFilter;

    const encoder = new TextEncoder();
    let skip = 0;
    let isFirstChunk = true;

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (isFirstChunk) {
          const header = [
            "Timestamp",
            "User Name",
            "User Email",
            "User Role",
            "Action",
            "Entity Type",
            "Entity ID",
            "IP Address",
            "User Agent",
            "Metadata",
          ]
            .map(escapeCsvCell)
            .join(",");
          controller.enqueue(encoder.encode(`${header}\n`));
          isFirstChunk = false;
        }

        const activities = await prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: {
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: ACTIVITY_LOG_EXPORT_BATCH_SIZE,
        });

        if (activities.length === 0) {
          controller.close();
          return;
        }

        skip += activities.length;

        const csvChunk = activities
          .map((activity) =>
            [
              activity.createdAt.toISOString(),
              activity.user?.name || "System",
              activity.user?.email || "",
              activity.user?.role || "",
              activity.action,
              activity.entityType,
              activity.entityId || "",
              activity.ipAddress || "",
              activity.userAgent || "",
              activity.metadata,
            ]
              .map(escapeCsvCell)
              .join(","),
          )
          .join("\n");

        controller.enqueue(encoder.encode(`${csvChunk}\n`));
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="activity-logs-${exportStartedAt.toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting activity logs:", error);
    return NextResponse.json(
      { error: "Failed to export activity logs" },
      { status: 500 },
    );
  }
}
