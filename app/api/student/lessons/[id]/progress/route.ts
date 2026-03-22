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

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Get lesson to find course
      const lesson = await tx.lesson.findUnique({
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
        throw new Error("Lesson not found");
      }

      const courseId = lesson.module.courseId;

      // Check enrollment
      const enrollment = await tx.courseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId: session.user.id,
            courseId,
          },
        },
      });

      if (!enrollment) {
        throw new Error("Not enrolled");
      }

      // Get existing progress to check if lesson was already completed
      const existingProgress = await tx.lessonProgress.findUnique({
        where: {
          userId_lessonId: {
            userId: session.user.id,
            lessonId,
          },
        },
      });

      // Update or create lesson progress
      const progress = await tx.lessonProgress.upsert({
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
      if (completed && !existingProgress?.completed) {
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
        m.lessons.map((l) => l.id)
      );

      // Handle edge case: course with no lessons
      if (allLessonIds.length === 0) {
        const updatedEnrollment = await tx.courseEnrollment.update({
          where: {
            userId_courseId: {
              userId: session.user.id,
              courseId,
            },
          },
          data: {
            progress: 0,
            status: "ACTIVE",
            completedAt: null,
            lastAccessedAt: new Date(),
          },
        });
        return { progress, courseProgress: 0, enrollment: updatedEnrollment };
      }

      const allProgress = await tx.lessonProgress.findMany({
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
      const updatedEnrollment = await tx.courseEnrollment.update({
        where: {
          userId_courseId: {
            userId: session.user.id,
            courseId,
          },
        },
        data: {
          progress: courseProgress,
          status: courseProgress === 100 ? "COMPLETED" : enrollment.status,
          completedAt: courseProgress === 100 && !enrollment.completedAt
            ? new Date()
            : courseProgress === 100
            ? enrollment.completedAt
            : null,
          lastAccessedAt: new Date(),
        },
      });

      return { progress, courseProgress, enrollment: updatedEnrollment };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error updating lesson progress:", error);

    // Handle specific transaction errors
    if (error instanceof Error) {
      if (error.message === "Lesson not found") {
        return NextResponse.json(
          { error: "Lesson not found" },
          { status: 404 }
        );
      }
      if (error.message === "Not enrolled") {
        return NextResponse.json(
          { error: "Not enrolled in this course" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update progress" },
      { status: 500 },
    );
  }
}
