import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditActions } from "@/lib/audit";

// GET /api/admin/users/[id]/enrollments - Get user's programme enrollments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get user enrollments
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { userId: id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            thumbnail: true,
            _count: {
              select: {
                modules: true,
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    return NextResponse.json({ enrollments });
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    return NextResponse.json(
      { error: "Failed to fetch enrollments" },
      { status: 500 },
    );
  }
}

// POST /api/admin/users/[id]/enrollments - Assign programme(s) to user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await params;
    const body = await request.json();
    const { courseIds } = body;

    // Validation
    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json(
        { error: "At least one programme must be selected" },
        { status: 400 },
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get existing enrollments to avoid duplicates
    const existingEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        userId,
        courseId: { in: courseIds },
      },
      select: { courseId: true },
    });

    const existingCourseIds = new Set(
      existingEnrollments.map((e) => e.courseId),
    );
    const newCourseIds = courseIds.filter((id) => !existingCourseIds.has(id));

    // Create new enrollments
    const enrollments = await prisma.$transaction(
      newCourseIds.map((courseId) =>
        prisma.courseEnrollment.create({
          data: {
            userId,
            courseId,
            status: "ACTIVE",
          },
          include: {
            course: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
        }),
      ),
    );

    // Audit log for each enrollment
    await Promise.all(
      enrollments.map((enrollment) =>
        auditActions.programmeEnrollmentCreated(
          session.user.id,
          enrollment.id,
          enrollment.course.title,
        ),
      ),
    );

    return NextResponse.json({
      enrollments,
      skipped: existingCourseIds.size,
      message:
        newCourseIds.length > 0
          ? `Successfully assigned ${newCourseIds.length} programme(s)${existingCourseIds.size > 0 ? ` (${existingCourseIds.size} already enrolled)` : ""}`
          : "All selected programmes were already assigned",
    });
  } catch (error) {
    console.error("Error creating enrollments:", error);
    return NextResponse.json(
      { error: "Failed to assign programmes" },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/users/[id]/enrollments - Remove programme enrollment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await params;
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");

    if (!courseId) {
      return NextResponse.json(
        { error: "Programme ID is required" },
        { status: 400 },
      );
    }

    // Check if enrollment exists
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      include: {
        course: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!enrollment) {
      return NextResponse.json(
        { error: "Enrollment not found" },
        { status: 404 },
      );
    }

    // Delete enrollment
    await prisma.courseEnrollment.delete({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    // Audit log
    await auditActions.programmeEnrollmentDeleted(
      session.user.id,
      enrollment.id,
      enrollment.course.title,
    );

    return NextResponse.json({
      message: "Programme enrollment removed successfully",
    });
  } catch (error) {
    console.error("Error deleting enrollment:", error);
    return NextResponse.json(
      { error: "Failed to remove programme enrollment" },
      { status: 500 },
    );
  }
}
