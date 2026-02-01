import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/assignments/[id]/analytics - Get assignment submission statistics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || !["ADMIN", "LECTURER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Fetch assignment with submissions and student enrollments
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        lesson: {
          include: {
            module: {
              include: {
                course: {
                  include: {
                    enrollments: {
                      where: {
                        status: "ACTIVE",
                      },
                      include: {
                        user: {
                          select: {
                            id: true,
                            name: true,
                            email: true,
                          },
                        },
                      },
                    },
                    lecturers: {
                      select: {
                        lecturerId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        assignmentSubmissions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            attachments: true,
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

    // Check lecturer authorization
    if (session.user.role === "LECTURER") {
      const isAssigned = assignment.lesson.module.course.lecturers.some(
        (l) => l.lecturerId === session.user.id,
      );

      if (!isAssigned) {
        return NextResponse.json(
          { error: "Not authorized for this course" },
          { status: 403 },
        );
      }
    }

    const enrolledStudents = assignment.lesson.module.course.enrollments;
    const totalStudents = enrolledStudents.length;
    const submissions = assignment.assignmentSubmissions;

    // Calculate statistics
    const totalSubmissions = submissions.length;
    const submissionRate =
      totalStudents > 0
        ? ((totalSubmissions / totalStudents) * 100).toFixed(1)
        : "0";

    const gradedSubmissions = submissions.filter(
      (s) => s.grade !== null,
    ).length;
    const pendingGrading = totalSubmissions - gradedSubmissions;
    const gradingRate =
      totalSubmissions > 0
        ? ((gradedSubmissions / totalSubmissions) * 100).toFixed(1)
        : "0";

    // Late submissions
    const lateSubmissions = submissions.filter(
      (s) =>
        s.submittedAt && new Date(s.submittedAt) > new Date(assignment.dueDate),
    ).length;

    // Average grade
    const gradedScores = submissions
      .filter((s) => s.grade !== null)
      .map((s) => s.grade!);
    const averageGrade =
      gradedScores.length > 0
        ? (
            gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length
          ).toFixed(1)
        : null;

    // Grade distribution
    const gradeRanges = {
      excellent: gradedScores.filter((g) => g >= assignment.maxPoints * 0.9)
        .length,
      good: gradedScores.filter(
        (g) =>
          g >= assignment.maxPoints * 0.7 && g < assignment.maxPoints * 0.9,
      ).length,
      average: gradedScores.filter(
        (g) =>
          g >= assignment.maxPoints * 0.5 && g < assignment.maxPoints * 0.7,
      ).length,
      poor: gradedScores.filter((g) => g < assignment.maxPoints * 0.5).length,
    };

    // Students who haven't submitted
    const submittedStudentIds = new Set(submissions.map((s) => s.userId));
    const notSubmitted = enrolledStudents
      .filter((e) => !submittedStudentIds.has(e.userId))
      .map((e) => ({
        id: e.user.id,
        name: e.user.name,
        email: e.user.email,
      }));

    // Submission timeline (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSubmissions = submissions.filter(
      (s) => s.submittedAt && new Date(s.submittedAt) >= sevenDaysAgo,
    );

    const submissionsByDay: Record<string, number> = {};
    recentSubmissions.forEach((s) => {
      if (s.submittedAt) {
        const day = new Date(s.submittedAt).toLocaleDateString();
        submissionsByDay[day] = (submissionsByDay[day] || 0) + 1;
      }
    });

    return NextResponse.json({
      assignment: {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.dueDate,
        maxPoints: assignment.maxPoints,
      },
      overview: {
        totalStudents,
        totalSubmissions,
        submissionRate: parseFloat(submissionRate),
        notSubmittedCount: notSubmitted.length,
        gradedSubmissions,
        pendingGrading,
        gradingRate: parseFloat(gradingRate),
        lateSubmissions,
        averageGrade: averageGrade ? parseFloat(averageGrade) : null,
      },
      gradeDistribution: gradeRanges,
      notSubmittedStudents: notSubmitted,
      submissionTimeline: submissionsByDay,
    });
  } catch (error) {
    console.error("Error fetching assignment analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
