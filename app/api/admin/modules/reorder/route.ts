import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";

const reorderModuleIdsSchema = z.object({
  moduleIds: z.array(z.string().min(1)).min(1),
});

const reorderModulesLegacySchema = z.object({
  modules: z
    .array(
      z.object({
        id: z.string().min(1),
        order: z.number().int(),
      }),
    )
    .min(1),
});

function normalizeModuleIds(payload: unknown) {
  const directPayload = reorderModuleIdsSchema.safeParse(payload);

  if (directPayload.success) {
    return directPayload.data.moduleIds;
  }

  const legacyPayload = reorderModulesLegacySchema.safeParse(payload);

  if (legacyPayload.success) {
    return [...legacyPayload.data.modules]
      .sort((left, right) => left.order - right.order)
      .map((module) => module.id);
  }

  throw new Error("Payload must include moduleIds or modules.");
}

// POST /api/admin/modules/reorder - Reorder modules
// ADMIN: full access, LECTURER: must own course for ALL modules being reordered
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "ADMIN" && session.user.role !== "LECTURER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    let moduleIds: string[];

    try {
      moduleIds = normalizeModuleIds(body);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid reorder payload.",
        },
        { status: 400 },
      );
    }

    const uniqueModuleIds = new Set(moduleIds);

    if (uniqueModuleIds.size !== moduleIds.length) {
      return NextResponse.json(
        { error: "Module IDs must be unique." },
        { status: 400 },
      );
    }

    const modulesWithCourse = await prisma.module.findMany({
      where: { id: { in: moduleIds } },
      select: {
        id: true,
        courseId: true,
        order: true,
        course: {
          select: {
            lecturers: {
              where: { lecturerId: session.user.id },
              select: { lecturerId: true },
            },
          },
        },
      },
    });

    if (modulesWithCourse.length !== moduleIds.length) {
      return NextResponse.json(
        { error: "One or more modules not found." },
        { status: 404 },
      );
    }

    const courseIds = new Set(modulesWithCourse.map((module) => module.courseId));

    if (courseIds.size !== 1) {
      return NextResponse.json(
        { error: "All modules must belong to the same programme." },
        { status: 400 },
      );
    }

    const [courseId] = [...courseIds];
    const previousOrder = [...modulesWithCourse]
      .sort((left, right) => left.order - right.order)
      .map((module) => ({
        id: module.id,
        order: module.order,
      }));
    const nextOrder = moduleIds.map((moduleId, index) => ({
      id: moduleId,
      order: index + 1,
    }));

    const totalModuleCount = await prisma.module.count({
      where: { courseId },
    });

    if (totalModuleCount !== moduleIds.length) {
      return NextResponse.json(
        {
          error:
            "Reorder payload must include every module in the programme. Refresh and try again.",
        },
        { status: 409 },
      );
    }

    // Check ownership if lecturer - must own the course being reordered
    if (session.user.role === "LECTURER") {
      const canManageCourse = modulesWithCourse.every(
        (module) => module.course.lecturers.length > 0,
      );

      if (!canManageCourse) {
        return NextResponse.json(
          { error: "Not authorized to reorder modules in this programme." },
          { status: 403 },
        );
      }
    }

    // Update all module orders sequentially in a transaction
    await prisma.$transaction(
      moduleIds.map((moduleId, index) =>
        prisma.module.update({
          where: { id: moduleId },
          data: { order: index + 1 },
        }),
      ),
    );

    await createAuditLog({
      userId: session.user.id,
      action: "COURSE_UPDATED",
      entityType: "Course",
      entityId: courseId,
      metadata: {
        moduleIds,
        previousOrder,
        nextOrder,
        reorderedByRole: session.user.role,
        type: "modules_reordered",
      },
    });

    return NextResponse.json({
      message: "Modules reordered successfully",
    });
  } catch (error) {
    console.error("Error reordering modules:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reorder modules",
      },
      { status: 500 },
    );
  }
}
