import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditActions } from "@/lib/audit";

// GET /api/admin/programmes/[id]/enrollments - Get programme enrollments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: courseId } = await params;
    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get("role"); // STUDENT or LECTURER

    // Get enrollments
    const enrollments = await prisma.courseEnrollment.findMany({
      where: roleFilter
        ? {
            courseId,
            user: {
              role: roleFilter as "STUDENT" | "LECTURER",
            },
          }
        : {
            courseId,
          },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    return NextResponse.json({ enrollments });
  } catch (error) {
    console.error("Error fetching programme enrollments:", error);
    return NextResponse.json(
      { error: "Failed to fetch enrollments" },
      { status: 500 },
    );
  }
}

// POST /api/admin/programmes/[id]/enrollments - Enroll users to programme
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: courseId } = await params;
    const body = await request.json();
    const { userIds } = body;

    // Validation
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "At least one user must be selected" },
        { status: 400 },
      );
    }

    // Get course info
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    });

    if (!course) {
      return NextResponse.json(
        { error: "Programme not found" },
        { status: 404 },
      );
    }

    // Get existing enrollments to avoid duplicates
    const existingEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        courseId,
        userId: { in: userIds },
      },
      select: { userId: true },
    });

    const existingUserIds = new Set(existingEnrollments.map((e) => e.userId));
    const newUserIds = userIds.filter((id) => !existingUserIds.has(id));

    // Create new enrollments
    const enrollments = await prisma.$transaction(
      newUserIds.map((userId) =>
        prisma.courseEnrollment.create({
          data: {
            userId,
            courseId,
            status: "ACTIVE",
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
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
          course.title,
        ),
      ),
    );

    return NextResponse.json({
      enrollments,
      skipped: existingUserIds.size,
      message:
        newUserIds.length > 0
          ? `Successfully enrolled ${newUserIds.length} user(s)${existingUserIds.size > 0 ? ` (${existingUserIds.size} already enrolled)` : ""}`
          : "All selected users were already enrolled",
    });
  } catch (error) {
    console.error("Error creating enrollments:", error);
    return NextResponse.json(
      { error: "Failed to enroll users" },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/programmes/[id]/enrollments - Remove user enrollment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: courseId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
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
      message: "User enrollment removed successfully",
    });
  } catch (error) {
    console.error("Error deleting enrollment:", error);
    return NextResponse.json(
      { error: "Failed to remove enrollment" },
      { status: 500 },
    );
  }
}
