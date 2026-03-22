import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { lessonSchema } from "@/lib/validations";
import { recalculateCourseProgress } from "@/lib/progress";

// POST /api/admin/lessons - Create new lesson
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "ADMIN" && session.user.role !== "LECTURER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, moduleId, type, duration, videoUrl } = body;

    if (!title || !moduleId) {
      return NextResponse.json(
        { error: "Title and moduleId are required" },
        { status: 400 },
      );
    }

    // Validate video URL for VIDEO type lessons
    if (type === "VIDEO" && (!videoUrl || videoUrl.trim().length === 0)) {
      return NextResponse.json(
        { error: "Video URL is required for video lessons" },
        { status: 400 },
      );
    }

    // Validate URL format if provided
    if (videoUrl && videoUrl.trim().length > 0) {
      try {
        new URL(videoUrl);
      } catch {
        return NextResponse.json(
          { error: "Please enter a valid URL" },
          { status: 400 },
        );
      }
    }

    // Check ownership if lecturer
    if (session.user.role === "LECTURER") {
      const module = await prisma.module.findUnique({
        where: { id: moduleId },
        include: {
          course: {
            select: {
              lecturers: {
                where: { lecturerId: session.user.id },
              },
            },
          },
        },
      });

      if (!module || module.course.lecturers.length === 0) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Get the next order number
    const lastLesson = await prisma.lesson.findFirst({
      where: { moduleId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const order = (lastLesson?.order ?? 0) + 1;

    const lesson = await prisma.lesson.create({
      data: {
        title,
        description: description || null,
        videoUrl: videoUrl || null,
        moduleId,
        type: type || "VIDEO",
        duration: duration || 0,
        order,
      },
      include: {
        module: {
          include: {
            course: {
              select: {
                id: true,
              },
            },
          },
        },
        _count: {
          select: {
            resources: true,
          },
        },
      },
    });

    await createAuditLog({
      userId: session.user.id,
      action: "LESSON_CREATED",
      entityType: "Lesson",
      entityId: lesson.id,
      metadata: { title, type, moduleId },
    });

    // Recalculate progress for all students enrolled in this course
    // Run in background to not slow down the create response
    const courseId = lesson.module.course.id;
    recalculateCourseProgress(courseId).catch((error) => {
      console.error(
        `Failed to recalculate progress for course ${courseId} after lesson creation:`,
        error
      );
    });

    return NextResponse.json(
      { lesson, message: "Lesson created successfully" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating lesson:", error);
    return NextResponse.json(
      { error: "Failed to create lesson" },
      { status: 500 },
    );
  }
}
