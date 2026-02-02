import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: Reorder resources
// ADMIN: full access, LECTURER: must own course containing these resources
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || !["ADMIN", "LECTURER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { updates } = await request.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "Invalid updates format" },
        { status: 400 },
      );
    }

    // For lecturers, verify ownership of all resources being reordered
    if (session.user.role === "LECTURER") {
      const resourceIds = updates.map((u: { id: string }) => u.id);

      // Fetch all resources with their course ownership info
      const resources = await prisma.lessonResource.findMany({
        where: { id: { in: resourceIds } },
        select: {
          id: true,
          lesson: {
            select: {
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
          },
        },
      });

      // Check if lecturer owns ALL courses containing these resources
      const unauthorizedResources = resources.filter(
        (r) => r.lesson.module.course.lecturers.length === 0,
      );

      if (unauthorizedResources.length > 0) {
        return NextResponse.json(
          { error: "Not authorized to reorder resources in this course" },
          { status: 403 },
        );
      }

      // Check if all requested resources were found
      if (resources.length !== resourceIds.length) {
        return NextResponse.json(
          { error: "One or more resources not found" },
          { status: 404 },
        );
      }
    }

    // Update all resource orders in a transaction
    await prisma.$transaction(
      updates.map((update: { id: string; order: number }) =>
        prisma.lessonResource.update({
          where: { id: update.id },
          data: { order: update.order },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering resources:", error);
    return NextResponse.json(
      { error: "Failed to reorder resources" },
      { status: 500 },
    );
  }
}
