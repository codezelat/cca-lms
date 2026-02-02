import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const body = await request.json();
    const { modules } = body; // Array of { id, order }

    if (!Array.isArray(modules) || modules.length === 0) {
      return NextResponse.json(
        { error: "Invalid modules array" },
        { status: 400 },
      );
    }

    // Check ownership if lecturer - must own ALL modules being reordered
    if (session.user.role === "LECTURER") {
      const moduleIds = modules.map((m: { id: string }) => m.id);

      const modulesWithCourse = await prisma.module.findMany({
        where: { id: { in: moduleIds } },
        select: {
          id: true,
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

      // Check if all modules were found
      if (modulesWithCourse.length !== moduleIds.length) {
        return NextResponse.json(
          { error: "One or more modules not found" },
          { status: 404 },
        );
      }

      // Check if lecturer owns ALL modules' courses
      const unauthorizedModules = modulesWithCourse.filter(
        (m) => m.course.lecturers.length === 0,
      );

      if (unauthorizedModules.length > 0) {
        return NextResponse.json(
          { error: "Not authorized to reorder modules in this course" },
          { status: 403 },
        );
      }
    }

    // Update all module orders in a transaction
    await prisma.$transaction(
      modules.map((module) =>
        prisma.module.update({
          where: { id: module.id },
          data: { order: module.order },
        }),
      ),
    );

    return NextResponse.json({
      message: "Modules reordered successfully",
    });
  } catch (error) {
    console.error("Error reordering modules:", error);
    return NextResponse.json(
      { error: "Failed to reorder modules" },
      { status: 500 },
    );
  }
}
