import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditActions } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: lessonId } = await params;
    const body = await request.json();
    const { completed, watchedSeconds } = body;

    // Get lesson to find course
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            course: {
              include: {
                modules: {
                  include: {
                    lessons: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const courseId = lesson.module.courseId;

    // Check enrollment
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId,
        },
      },
    });

    if (!enrollment) {
      return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
    }

    // Update or create lesson progress
    const progress = await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: session.user.id,
          lessonId,
        },
      },
      update: {
        completed: completed !== undefined ? completed : undefined,
        watchedSeconds:
          watchedSeconds !== undefined ? watchedSeconds : undefined,
        lastAccessedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        lessonId,
        completed: completed || false,
        watchedSeconds: watchedSeconds || 0,
      },
    });

    // Log audit events
    if (completed && !progress.completed) {
      // Lesson was just completed
      await auditActions.lessonCompleted(
        session.user.id,
        lessonId,
        lesson.title,
        courseId,
      );
    } else if (watchedSeconds !== undefined) {
      // Progress was updated
      await auditActions.lessonProgressUpdated(
        session.user.id,
        lessonId,
        lesson.title,
        courseId,
        watchedSeconds,
      );
    }

    // Recalculate course progress
    const allLessonIds = lesson.module.course.modules.flatMap((m) =>
      m.lessons.map((l) => l.id),
    );

    const allProgress = await prisma.lessonProgress.findMany({
      where: {
        userId: session.user.id,
        lessonId: { in: allLessonIds },
      },
    });

    const completedCount = allProgress.filter((p) => p.completed).length;
    const totalCount = allLessonIds.length;
    const courseProgress =
      totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    // Update enrollment progress
    await prisma.courseEnrollment.update({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId,
        },
      },
      data: {
        progress: courseProgress,
        status: courseProgress === 100 ? "COMPLETED" : "ACTIVE",
        completedAt: courseProgress === 100 ? new Date() : null,
        lastAccessedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      progress,
      courseProgress,
    });
  } catch (error) {
    console.error("Error updating lesson progress:", error);
    return NextResponse.json(
      { error: "Failed to update progress" },
      { status: 500 },
    );
  }
}
