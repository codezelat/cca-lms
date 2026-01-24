import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/r2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: courseId } = await params;

    // Fetch course with modules and lessons
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          include: {
            lessons: {
              include: {
                resources: true,
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!course || course.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "Programme not found" },
        { status: 404 },
      );
    }

    // Check enrollment
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId,
        },
      },
    });

    // Get all lesson progress for this user
    const allLessonIds = course.modules.flatMap((m) =>
      m.lessons.map((l) => l.id),
    );

    const lessonProgress = await prisma.lessonProgress.findMany({
      where: {
        userId: session.user.id,
        lessonId: { in: allLessonIds },
      },
    });

    const progressMap = new Map(lessonProgress.map((p) => [p.lessonId, p]));

    // Calculate stats
    const totalLessons = allLessonIds.length;
    const completedLessons = lessonProgress.filter((p) => p.completed).length;

    // Build response with progress - generate signed URLs for FILE resources
    const modules = await Promise.all(
      course.modules.map(async (module) => ({
        id: module.id,
        title: module.title,
        description: module.description,
        order: module.order,
        lessons: await Promise.all(
          module.lessons.map(async (lesson) => {
            const progress = progressMap.get(lesson.id);
            const resources = await Promise.all(
              lesson.resources.map(async (r) => {
                let url = r.externalUrl || "";
                if (r.type === "FILE" && r.fileKey) {
                  url = await getSignedUrl(r.fileKey, 3600); // 1 hour expiry
                }
                return {
                  id: r.id,
                  title: r.title,
                  url,
                  type: r.type,
                };
              }),
            );
            return {
              id: lesson.id,
              title: lesson.title,
              description: lesson.description,
              order: lesson.order,
              duration: lesson.duration,
              videoUrl: lesson.videoUrl,
              completed: progress?.completed || false,
              watchedSeconds: progress?.watchedSeconds || 0,
              resources,
            };
          }),
        ),
      })),
    );

    return NextResponse.json({
      id: course.id,
      title: course.title,
      description: course.description,
      enrollment: enrollment
        ? {
            status: enrollment.status,
            progress: enrollment.progress,
            enrolledAt: enrollment.enrolledAt.toISOString(),
          }
        : null,
      modules,
      stats: {
        totalLessons,
        completedLessons,
      },
    });
  } catch (error) {
    console.error("Error fetching programme:", error);
    return NextResponse.json(
      { error: "Failed to fetch programme" },
      { status: 500 },
    );
  }
}
