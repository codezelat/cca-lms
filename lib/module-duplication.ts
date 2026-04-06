import type { Prisma } from "@/generated/prisma";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { recalculateCourseProgress } from "@/lib/progress";
import { deleteFromR2, duplicateInR2 } from "@/lib/r2";

type ActorRole = "ADMIN" | "LECTURER";

type DuplicateModuleParams = {
  actorRole: ActorRole;
  actorUserId: string;
  sourceModuleId: string;
  targetCourseId: string;
  title?: string;
};

type DuplicateModuleResult = {
  module: {
    courseId: string;
    id: string;
    title: string;
  };
  sourceCourseId: string;
  sourceCourseTitle: string;
  targetCourseId: string;
  targetCourseTitle: string;
  stats: {
    assignments: number;
    lessons: number;
    pastDueAssignments: number;
    quizzes: number;
    resources: number;
  };
};

const moduleSourceInclude = {
  course: {
    select: {
      id: true,
      title: true,
      lecturers: {
        select: {
          lecturerId: true,
        },
      },
    },
  },
  lessons: {
    orderBy: {
      order: "asc",
    },
    include: {
      assignments: {
        orderBy: {
          createdAt: "asc",
        },
      },
      quiz: {
        include: {
          questions: {
            orderBy: {
              order: "asc",
            },
            include: {
              answers: {
                orderBy: {
                  order: "asc",
                },
              },
            },
          },
        },
      },
      resources: {
        orderBy: {
          order: "asc",
        },
        include: {
          versions: {
            orderBy: {
              version: "asc",
            },
          },
        },
      },
    },
  },
} as const;

const targetCourseSelect = {
  id: true,
  title: true,
  lecturers: {
    select: {
      lecturerId: true,
    },
  },
} as const;

type SourceModuleRecord = Prisma.ModuleGetPayload<{
  include: typeof moduleSourceInclude;
}>;

type SourceResourceRecord = SourceModuleRecord["lessons"][number]["resources"][number];

function canLecturerManageCourse(
  lecturers: Array<{ lecturerId: string }>,
  userId: string,
) {
  return lecturers.some((lecturer) => lecturer.lecturerId === userId);
}

async function cleanupCopiedFiles(fileKeys: string[]) {
  if (fileKeys.length === 0) {
    return;
  }

  await Promise.allSettled(
    fileKeys.map(async (fileKey) => {
      try {
        await deleteFromR2(fileKey);
      } catch (error) {
        console.error(`Failed to clean up copied R2 file ${fileKey}:`, error);
      }
    }),
  );
}

async function duplicateResourceFile(
  sourceKey: string | null,
  fileName: string | null,
  copiedFileKeys: string[],
) {
  if (!sourceKey) {
    return null;
  }

  const { key } = await duplicateInR2(sourceKey, fileName);
  copiedFileKeys.push(key);

  return key;
}

async function buildResourceCreateInput(
  resource: SourceResourceRecord,
  order: number,
  copiedFileKeys: string[],
): Promise<Prisma.LessonResourceCreateWithoutLessonInput> {
  const versionsCreate: Prisma.ResourceVersionCreateWithoutResourceInput[] = [];
  let duplicatedCurrentFileKey: string | null = null;

  for (const version of resource.versions) {
    const duplicatedVersionFileKey = await duplicateResourceFile(
      version.fileKey,
      version.fileName,
      copiedFileKeys,
    );

    versionsCreate.push({
      fileKey: duplicatedVersionFileKey,
      fileName: version.fileName,
      fileSize: version.fileSize,
      mimeType: version.mimeType,
      uploadedBy: version.uploadedBy,
      version: version.version,
    });

    if (version.fileKey && version.fileKey === resource.fileKey) {
      duplicatedCurrentFileKey = duplicatedVersionFileKey;
    }
  }

  if (resource.fileKey && !duplicatedCurrentFileKey) {
    duplicatedCurrentFileKey = await duplicateResourceFile(
      resource.fileKey,
      resource.fileName,
      copiedFileKeys,
    );

    const currentVersionExists = versionsCreate.some(
      (version) => version.version === resource.version,
    );

    if (!currentVersionExists) {
      versionsCreate.push({
        fileKey: duplicatedCurrentFileKey,
        fileName: resource.fileName,
        fileSize: resource.fileSize,
        mimeType: resource.mimeType,
        uploadedBy: null,
        version: resource.version,
      });
    }
  }

  return {
    title: resource.title,
    description: resource.description,
    type: resource.type,
    fileKey: duplicatedCurrentFileKey,
    fileName: resource.fileName,
    fileSize: resource.fileSize,
    mimeType: resource.mimeType,
    externalUrl: resource.externalUrl,
    embedCode: resource.embedCode,
    textContent: resource.textContent,
    version: resource.version,
    isLatest: resource.isLatest,
    visibility: resource.visibility,
    scheduledAt: resource.scheduledAt,
    downloadable: resource.downloadable,
    tags: [...resource.tags],
    order,
    ...(versionsCreate.length > 0
      ? {
          versions: {
            create: versionsCreate.sort((left, right) => left.version - right.version),
          },
        }
      : {}),
  };
}

export async function duplicateModuleToCourse({
  actorRole,
  actorUserId,
  sourceModuleId,
  targetCourseId,
  title,
}: DuplicateModuleParams): Promise<DuplicateModuleResult> {
  const [sourceModule, targetCourse] = await Promise.all([
    prisma.module.findUnique({
      where: { id: sourceModuleId },
      include: moduleSourceInclude,
    }),
    prisma.course.findUnique({
      where: { id: targetCourseId },
      select: targetCourseSelect,
    }),
  ]);

  if (!sourceModule) {
    throw new Error("Source module not found.");
  }

  if (!targetCourse) {
    throw new Error("Target programme not found.");
  }

  if (sourceModule.courseId === targetCourseId) {
    throw new Error("Choose a different target programme.");
  }

  if (actorRole === "LECTURER") {
    const canManageSource = canLecturerManageCourse(
      sourceModule.course.lecturers,
      actorUserId,
    );
    const canManageTarget = canLecturerManageCourse(
      targetCourse.lecturers,
      actorUserId,
    );

    if (!canManageSource || !canManageTarget) {
      throw new Error(
        "You must be assigned to both the source and target programmes to duplicate a module.",
      );
    }
  }

  const copiedFileKeys: string[] = [];
  const now = new Date();
  const stats = {
    lessons: sourceModule.lessons.length,
    resources: sourceModule.lessons.reduce(
      (count, lesson) => count + lesson.resources.length,
      0,
    ),
    quizzes: sourceModule.lessons.filter((lesson) => lesson.quiz).length,
    assignments: sourceModule.lessons.reduce(
      (count, lesson) => count + lesson.assignments.length,
      0,
    ),
    pastDueAssignments: sourceModule.lessons.reduce(
      (count, lesson) =>
        count +
        lesson.assignments.filter((assignment) => assignment.dueDate < now).length,
      0,
    ),
  };

  try {
    const lessonsCreate: Prisma.LessonCreateWithoutModuleInput[] = [];

    for (const [lessonIndex, lesson] of sourceModule.lessons.entries()) {
      const resourcesCreate: Prisma.LessonResourceCreateWithoutLessonInput[] = [];

      for (const [resourceIndex, resource] of lesson.resources.entries()) {
        resourcesCreate.push(
          await buildResourceCreateInput(resource, resourceIndex, copiedFileKeys),
        );
      }

      const assignmentsCreate: Prisma.AssignmentCreateWithoutLessonInput[] =
        lesson.assignments.map((assignment) => ({
          title: assignment.title,
          description: assignment.description,
          instructions: assignment.instructions,
          dueDate: assignment.dueDate,
          maxPoints: assignment.maxPoints,
          allowedFileTypes: [...assignment.allowedFileTypes],
          maxFileSize: assignment.maxFileSize,
          maxFiles: assignment.maxFiles,
          allowLateSubmission: assignment.allowLateSubmission,
        }));

      const quizCreate: Prisma.QuizCreateWithoutLessonInput | undefined = lesson.quiz
        ? {
            title: lesson.quiz.title,
            description: lesson.quiz.description,
            timeLimit: lesson.quiz.timeLimit,
            passingScore: lesson.quiz.passingScore,
            maxAttempts: lesson.quiz.maxAttempts,
            shuffleQuestions: lesson.quiz.shuffleQuestions,
            shuffleAnswers: lesson.quiz.shuffleAnswers,
            showResults: lesson.quiz.showResults,
            questions: {
              create: lesson.quiz.questions.map((question, questionIndex) => ({
                type: question.type,
                question: question.question,
                explanation: question.explanation,
                points: question.points,
                order: questionIndex,
                answers: {
                  create: question.answers.map((answer, answerIndex) => ({
                    answer: answer.answer,
                    isCorrect: answer.isCorrect,
                    order: answerIndex,
                  })),
                },
              })),
            },
          }
        : undefined;

      lessonsCreate.push({
        title: lesson.title,
        description: lesson.description,
        type: lesson.type,
        duration: lesson.duration ?? 0,
        videoUrl: lesson.videoUrl,
        order: lessonIndex + 1,
        isPublished: lesson.isPublished,
        ...(resourcesCreate.length > 0
          ? {
              resources: {
                create: resourcesCreate,
              },
            }
          : {}),
        ...(assignmentsCreate.length > 0
          ? {
              assignments: {
                create: assignmentsCreate,
              },
            }
          : {}),
        ...(quizCreate
          ? {
              quiz: {
                create: quizCreate,
              },
            }
          : {}),
      });
    }

    const duplicatedModule = await prisma.$transaction(async (tx) => {
      const lastModule = await tx.module.findFirst({
        where: {
          courseId: targetCourseId,
        },
        orderBy: {
          order: "desc",
        },
        select: {
          order: true,
        },
      });

      return tx.module.create({
        data: {
          course: {
            connect: {
              id: targetCourseId,
            },
          },
          title: title?.trim() || sourceModule.title,
          description: sourceModule.description,
          order: (lastModule?.order ?? 0) + 1,
          ...(lessonsCreate.length > 0
            ? {
                lessons: {
                  create: lessonsCreate,
                },
              }
            : {}),
        },
        select: {
          courseId: true,
          id: true,
          title: true,
        },
      });
    });

    await createAuditLog({
      userId: actorUserId,
      action: "COURSE_UPDATED",
      entityType: "Course",
      entityId: targetCourseId,
      metadata: {
        duplicatedModuleId: duplicatedModule.id,
        duplicatedModuleTitle: duplicatedModule.title,
        sourceCourseId: sourceModule.course.id,
        sourceCourseTitle: sourceModule.course.title,
        sourceModuleId: sourceModule.id,
        sourceModuleTitle: sourceModule.title,
        stats,
        type: "module_duplicated",
      },
    });

    recalculateCourseProgress(targetCourseId).catch((error) => {
      console.error(
        `Failed to recalculate progress for course ${targetCourseId} after module duplication:`,
        error,
      );
    });

    return {
      module: duplicatedModule,
      sourceCourseId: sourceModule.course.id,
      sourceCourseTitle: sourceModule.course.title,
      stats,
      targetCourseId: targetCourse.id,
      targetCourseTitle: targetCourse.title,
    };
  } catch (error) {
    await cleanupCopiedFiles(copiedFileKeys);
    throw error;
  }
}
