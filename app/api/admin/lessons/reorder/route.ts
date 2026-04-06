import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";

const reorderLessonIdsSchema = z.object({
  lessonIds: z.array(z.string().min(1)).min(1),
});

const reorderLessonsLegacySchema = z.object({
  lessons: z
    .array(
      z.object({
        id: z.string().min(1),
        order: z.number().int(),
      }),
    )
    .min(1),
});

function normalizeLessonIds(payload: unknown) {
  const directPayload = reorderLessonIdsSchema.safeParse(payload);

  if (directPayload.success) {
    return directPayload.data.lessonIds;
  }

  const legacyPayload = reorderLessonsLegacySchema.safeParse(payload);

  if (legacyPayload.success) {
    return [...legacyPayload.data.lessons]
      .sort((left, right) => left.order - right.order)
      .map((lesson) => lesson.id);
  }

  throw new Error("Payload must include lessonIds or lessons.");
}

// POST /api/admin/lessons/reorder - Reorder lessons
// ADMIN: full access, LECTURER: must own course for ALL lessons being reordered
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

    let lessonIds: string[];

    try {
      lessonIds = normalizeLessonIds(body);
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

    const uniqueLessonIds = new Set(lessonIds);

    if (uniqueLessonIds.size !== lessonIds.length) {
      return NextResponse.json(
        { error: "Lesson IDs must be unique." },
        { status: 400 },
      );
    }

    const lessonsWithModule = await prisma.lesson.findMany({
      where: { id: { in: lessonIds } },
      select: {
        id: true,
        moduleId: true,
        module: {
          select: {
            course: {
              select: {
                lecturers: {
                  where: { lecturerId: session.user.id },
                  select: { lecturerId: true },
                },
              },
            },
          },
        },
      },
    });

    if (lessonsWithModule.length !== lessonIds.length) {
      return NextResponse.json(
        { error: "One or more lessons not found." },
        { status: 404 },
      );
    }

    const moduleIds = new Set(
      lessonsWithModule.map((lesson) => lesson.moduleId),
    );

    if (moduleIds.size !== 1) {
      return NextResponse.json(
        { error: "All lessons must belong to the same module." },
        { status: 400 },
      );
    }

    const [moduleId] = [...moduleIds];

    const totalLessonCount = await prisma.lesson.count({
      where: { moduleId },
    });

    if (totalLessonCount !== lessonIds.length) {
      return NextResponse.json(
        {
          error:
            "Reorder payload must include every lesson in the module. Refresh and try again.",
        },
        { status: 409 },
      );
    }

    // Check ownership if lecturer - must own the course containing the module
    if (session.user.role === "LECTURER") {
      const canManageLessons = lessonsWithModule.every(
        (lesson) => lesson.module.course.lecturers.length > 0,
      );

      if (!canManageLessons) {
        return NextResponse.json(
          { error: "Not authorized to reorder lessons in this module." },
          { status: 403 },
        );
      }
    }

    // Update all lesson orders sequentially in a transaction
    await prisma.$transaction(
      lessonIds.map((lessonId, index) =>
        prisma.lesson.update({
          where: { id: lessonId },
          data: { order: index + 1 },
        }),
      ),
    );

    await createAuditLog({
      userId: session.user.id,
      action: "LESSON_UPDATED",
      entityType: "Module",
      entityId: moduleId,
      metadata: {
        lessonIds,
        reorderedByRole: session.user.role,
        type: "lessons_reordered",
      },
    });

    return NextResponse.json({
      message: "Lessons reordered successfully",
    });
  } catch (error) {
    console.error("Error reordering lessons:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reorder lessons",
      },
      { status: 500 },
    );
  }
}
