/**
 * Progress Calculation Utilities
 *
 * This module provides functions to calculate and recalculate student progress
 * for courses. It ensures data integrity when programme content changes.
 *
 * Progress Calculation Method:
 * - Course progress = (completed lessons / total lessons) * 100
 * - A lesson is considered completed when LessonProgress.completed = true
 * - Progress is stored as a float (0-100) in CourseEnrollment.progress
 * - Status is automatically updated to COMPLETED when progress reaches 100%
 */

import { prisma } from "@/lib/prisma";
import type { EnrollmentStatus, Prisma } from "@/generated/prisma";

export function calculateEnrollmentProgress(
  completedLessons: number,
  totalLessons: number,
) {
  if (totalLessons <= 0) {
    return 0;
  }

  return (completedLessons / totalLessons) * 100;
}

export function resolveEnrollmentStatusForProgress({
  currentStatus,
  progress,
}: {
  currentStatus: EnrollmentStatus;
  progress: number;
}): EnrollmentStatus {
  if (currentStatus === "DROPPED") {
    return "DROPPED";
  }

  return progress >= 100 ? "COMPLETED" : "ACTIVE";
}

export function resolveEnrollmentCompletedAt({
  currentCompletedAt,
  nextStatus,
  completedAtWhenCompleting,
}: {
  currentCompletedAt: Date | null;
  nextStatus: EnrollmentStatus;
  completedAtWhenCompleting?: Date;
}) {
  if (nextStatus === "DROPPED") {
    return currentCompletedAt;
  }

  if (nextStatus === "COMPLETED") {
    return currentCompletedAt ?? completedAtWhenCompleting ?? new Date();
  }

  return null;
}

export function buildEnrollmentProgressState({
  currentCompletedAt,
  currentStatus,
  progress,
  completedAtWhenCompleting,
}: {
  currentCompletedAt: Date | null;
  currentStatus: EnrollmentStatus;
  progress: number;
  completedAtWhenCompleting?: Date;
}) {
  const status = resolveEnrollmentStatusForProgress({
    currentStatus,
    progress,
  });

  return {
    progress,
    status,
    completedAt: resolveEnrollmentCompletedAt({
      currentCompletedAt,
      nextStatus: status,
      completedAtWhenCompleting,
    }),
  };
}

/**
 * Recalculate progress for a single student enrollment in a course
 *
 * @param userId - The student's user ID
 * @param courseId - The course ID
 * @returns The updated enrollment with new progress, or null if not enrolled
 */
export async function recalculateEnrollmentProgress(
  userId: string,
  courseId: string,
): Promise<{ progress: number; status: EnrollmentStatus } | null> {
  try {
    // Get all lesson IDs in the course
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          include: {
            lessons: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!course) {
      console.error(`Course ${courseId} not found`);
      return null;
    }

    // Get enrollment
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (!enrollment) {
      return null;
    }

    // Extract all lesson IDs
    const allLessonIds = course.modules.flatMap((module) =>
      module.lessons.map((lesson) => lesson.id)
    );

    let completedCount = 0;
    const totalCount = allLessonIds.length;

    if (allLessonIds.length > 0) {
      const lessonProgress = await prisma.lessonProgress.findMany({
        where: {
          userId,
          lessonId: { in: allLessonIds },
        },
        select: {
          completed: true,
        },
      });

      completedCount = lessonProgress.filter((progress) => progress.completed).length;
    }

    const progress = calculateEnrollmentProgress(completedCount, totalCount);
    const nextState = buildEnrollmentProgressState({
      currentCompletedAt: enrollment.completedAt,
      currentStatus: enrollment.status,
      progress,
      completedAtWhenCompleting: new Date(),
    });

    // Update enrollment
    const updated = await prisma.courseEnrollment.update({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      data: {
        progress: nextState.progress,
        status: nextState.status,
        completedAt: nextState.completedAt,
      },
    });

    return { progress: updated.progress, status: updated.status };
  } catch (error) {
    console.error(
      `Error recalculating progress for user ${userId} in course ${courseId}:`,
      error
    );
    return null;
  }
}

/**
 * Recalculate progress for all students enrolled in a course
 *
 * This should be called whenever course content changes (lessons added/deleted)
 *
 * @param courseId - The course ID
 * @returns Statistics about the recalculation
 */
export async function recalculateCourseProgress(courseId: string): Promise<{
  courseId: string;
  totalEnrollments: number;
  updated: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let updated = 0;
  let failed = 0;

  try {
    // Get all enrollments for this course
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { courseId },
      select: {
        userId: true,
        courseId: true,
      },
    });

    const totalEnrollments = enrollments.length;

    // Recalculate progress for each enrollment
    for (const enrollment of enrollments) {
      const result = await recalculateEnrollmentProgress(
        enrollment.userId,
        enrollment.courseId
      );

      if (result !== null) {
        updated++;
      } else {
        failed++;
        errors.push(
          `Failed to recalculate for user ${enrollment.userId}`
        );
      }
    }

    return {
      courseId,
      totalEnrollments,
      updated,
      failed,
      errors,
    };
  } catch (error) {
    console.error(`Error recalculating course ${courseId} progress:`, error);
    return {
      courseId,
      totalEnrollments: 0,
      updated,
      failed,
      errors: [...errors, String(error)],
    };
  }
}

/**
 * Recalculate progress for all courses and all students
 *
 * This is a comprehensive integrity check that can be run by admins
 *
 * @returns Statistics about the recalculation across all courses
 */
export async function recalculateAllProgress(): Promise<{
  totalCourses: number;
  totalEnrollments: number;
  updated: number;
  failed: number;
  courseResults: Array<{
    courseId: string;
    courseTitle: string;
    enrollments: number;
    updated: number;
    failed: number;
  }>;
}> {
  try {
    // Get all published courses
    const courses = await prisma.course.findMany({
      where: {
        status: {
          in: ["PUBLISHED", "ARCHIVED"],
        },
      },
      select: {
        id: true,
        title: true,
      },
    });

    let totalEnrollments = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const courseResults = [];

    // Process each course
    for (const course of courses) {
      const result = await recalculateCourseProgress(course.id);

      totalEnrollments += result.totalEnrollments;
      totalUpdated += result.updated;
      totalFailed += result.failed;

      courseResults.push({
        courseId: course.id,
        courseTitle: course.title,
        enrollments: result.totalEnrollments,
        updated: result.updated,
        failed: result.failed,
      });

      // Log any errors
      if (result.errors.length > 0) {
        console.error(
          `Course ${course.title} had errors:`,
          result.errors.slice(0, 5)
        );
      }
    }

    return {
      totalCourses: courses.length,
      totalEnrollments,
      updated: totalUpdated,
      failed: totalFailed,
      courseResults,
    };
  } catch (error) {
    console.error("Error in recalculateAllProgress:", error);
    throw error;
  }
}

/**
 * Validate enrollment progress integrity
 *
 * Checks if stored progress matches calculated progress without updating
 *
 * @param userId - The student's user ID
 * @param courseId - The course ID
 * @returns Validation result with discrepancies
 */
export async function validateEnrollmentProgress(
  userId: string,
  courseId: string,
): Promise<{
  valid: boolean;
  storedProgress: number;
  calculatedProgress: number;
  difference: number;
  storedStatus: EnrollmentStatus;
  expectedStatus: EnrollmentStatus;
  statusValid: boolean;
  storedCompletedAt: Date | null;
  completedAtValid: boolean;
}> {
  try {
    // Get enrollment
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (!enrollment) {
      throw new Error("Enrollment not found");
    }

    // Get all lesson IDs in the course
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          include: {
            lessons: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!course) {
      throw new Error("Course not found");
    }

    const allLessonIds = course.modules.flatMap((module) =>
      module.lessons.map((lesson) => lesson.id)
    );

    let completedCount = 0;

    if (allLessonIds.length > 0) {
      const lessonProgress = await prisma.lessonProgress.findMany({
        where: {
          userId,
          lessonId: { in: allLessonIds },
        },
        select: {
          completed: true,
        },
      });

      completedCount = lessonProgress.filter((progress) => progress.completed).length;
    }

    const calculatedProgress = calculateEnrollmentProgress(
      completedCount,
      allLessonIds.length,
    );
    const difference = Math.abs(enrollment.progress - calculatedProgress);
    const expectedStatus = resolveEnrollmentStatusForProgress({
      currentStatus: enrollment.status,
      progress: calculatedProgress,
    });
    const statusValid = enrollment.status === expectedStatus;
    const completedAtValid = expectedStatus === "DROPPED"
      ? true
      : expectedStatus === "COMPLETED"
      ? enrollment.completedAt !== null
      : enrollment.completedAt === null;

    // Allow small floating point differences
    const valid = difference < 0.01 && statusValid && completedAtValid;

    return {
      valid,
      storedProgress: enrollment.progress,
      calculatedProgress,
      difference,
      storedStatus: enrollment.status,
      expectedStatus,
      statusValid,
      storedCompletedAt: enrollment.completedAt,
      completedAtValid,
    };
  } catch (error) {
    console.error("Error validating progress:", error);
    throw error;
  }
}
