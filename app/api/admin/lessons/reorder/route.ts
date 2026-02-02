import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const body = await request.json();
    const { lessons } = body; // Array of { id, order }

    if (!Array.isArray(lessons) || lessons.length === 0) {
      return NextResponse.json(
        { error: "Invalid lessons array" },
        { status: 400 },
      );
    }

    // Check ownership if lecturer - must own ALL lessons being reordered
    if (session.user.role === "LECTURER") {
      const lessonIds = lessons.map((l: { id: string }) => l.id);

      const lessonsWithCourse = await prisma.lesson.findMany({
        where: { id: { in: lessonIds } },
        select: {
          id: true,
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

      // Check if all lessons were found
      if (lessonsWithCourse.length !== lessonIds.length) {
        return NextResponse.json(
          { error: "One or more lessons not found" },
          { status: 404 },
        );
      }

      // Check if lecturer owns ALL lessons' courses
      const unauthorizedLessons = lessonsWithCourse.filter(
        (l) => l.module.course.lecturers.length === 0,
      );

      if (unauthorizedLessons.length > 0) {
        return NextResponse.json(
          { error: "Not authorized to reorder lessons in this course" },
          { status: 403 },
        );
      }
    }

    // Update all lesson orders in a transaction
    await prisma.$transaction(
      lessons.map((lesson) =>
        prisma.lesson.update({
          where: { id: lesson.id },
          data: { order: lesson.order },
        }),
      ),
    );

    return NextResponse.json({
      message: "Lessons reordered successfully",
    });
  } catch (error) {
    console.error("Error reordering lessons:", error);
    return NextResponse.json(
      { error: "Failed to reorder lessons" },
      { status: 500 },
    );
  }
}
