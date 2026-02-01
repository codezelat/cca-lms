import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDeadlinePassed } from "@/lib/utils";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/student/assignments/[id] - Get assignment details for student
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "STUDENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get assignment details
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            module: {
              select: {
                id: true,
                title: true,
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    // Check enrollment using the same pattern as working endpoints
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId: assignment.lesson.module.course.id,
        },
      },
    });

    if (!enrollment || enrollment.status === "DROPPED") {
      return NextResponse.json(
        { error: "You are not enrolled in this course" },
        { status: 403 },
      );
    }

    // Get student's submission if exists
    const submission = await prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: {
          assignmentId: id,
          userId: session.user.id,
        },
      },
      include: {
        attachments: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    // Check if overdue - compare dates in UTC
    const now = new Date();
    const isOverdue = isDeadlinePassed(assignment.dueDate);
    const canSubmit =
      !isOverdue || (isOverdue && assignment.allowLateSubmission);

    // DEBUG: Log for Vercel troubleshooting
    console.log(
      "📅 ASSIGNMENT DEBUG:",
      JSON.stringify({
        assignmentId: id,
        dueDate_raw: assignment.dueDate,
        dueDate_iso: assignment.dueDate.toISOString(),
        dueDate_ts: assignment.dueDate.getTime(),
        now_iso: now.toISOString(),
        now_ts: now.getTime(),
        diff_hours: (
          (assignment.dueDate.getTime() - now.getTime()) /
          (1000 * 60 * 60)
        ).toFixed(2),
        isOverdue,
        canSubmit,
        allowLateSubmission: assignment.allowLateSubmission,
      }),
    );

    return NextResponse.json({
      assignment: {
        ...assignment,
        lesson: {
          ...assignment.lesson,
          module: {
            ...assignment.lesson.module,
            course: {
              id: assignment.lesson.module.course.id,
              title: assignment.lesson.module.course.title,
            },
          },
        },
      },
      submission,
      canSubmit,
      isOverdue,
    });
  } catch (error) {
    console.error("Error fetching assignment:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignment" },
      { status: 500 },
    );
  }
}
