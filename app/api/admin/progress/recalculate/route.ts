import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  recalculateAllProgress,
  recalculateCourseProgress,
  recalculateEnrollmentProgress,
  validateEnrollmentProgress,
} from "@/lib/progress";

/**
 * POST /api/admin/progress/recalculate - Recalculate student progress
 *
 * Body options:
 * - { scope: "all" } - Recalculate all courses
 * - { scope: "course", courseId: "..." } - Recalculate specific course
 * - { scope: "enrollment", userId: "...", courseId: "..." } - Recalculate specific enrollment
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { scope, courseId, userId } = body;

    if (!scope) {
      return NextResponse.json(
        { error: "scope is required (all, course, or enrollment)" },
        { status: 400 }
      );
    }

    switch (scope) {
      case "all": {
        const result = await recalculateAllProgress();
        return NextResponse.json({
          message: "Successfully recalculated progress for all courses",
          ...result,
        });
      }

      case "course": {
        if (!courseId) {
          return NextResponse.json(
            { error: "courseId is required for course scope" },
            { status: 400 }
          );
        }

        const result = await recalculateCourseProgress(courseId);
        return NextResponse.json({
          message: `Successfully recalculated progress for course ${courseId}`,
          ...result,
        });
      }

      case "enrollment": {
        if (!userId || !courseId) {
          return NextResponse.json(
            { error: "userId and courseId are required for enrollment scope" },
            { status: 400 }
          );
        }

        const result = await recalculateEnrollmentProgress(userId, courseId);

        if (!result) {
          return NextResponse.json(
            { error: "Enrollment not found or recalculation failed" },
            { status: 404 }
          );
        }

        return NextResponse.json({
          message: `Successfully recalculated progress for enrollment`,
          userId,
          courseId,
          ...result,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid scope. Must be: all, course, or enrollment" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error recalculating progress:", error);
    return NextResponse.json(
      { error: "Failed to recalculate progress" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/progress/validate - Validate progress integrity
 *
 * Query params:
 * - userId: Student user ID
 * - courseId: Course ID
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const courseId = searchParams.get("courseId");

    if (!userId || !courseId) {
      return NextResponse.json(
        { error: "userId and courseId query parameters are required" },
        { status: 400 }
      );
    }

    const validation = await validateEnrollmentProgress(userId, courseId);

    return NextResponse.json({
      message: validation.valid
        ? "Progress is valid"
        : "Progress discrepancy detected",
      ...validation,
    });
  } catch (error) {
    console.error("Error validating progress:", error);
    return NextResponse.json(
      { error: "Failed to validate progress" },
      { status: 500 }
    );
  }
}
