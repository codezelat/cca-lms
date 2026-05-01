import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFromB2 } from "@/lib/b2";
import { deleteFromR2 } from "@/lib/r2";
import { recalculateCourseProgress } from "@/lib/progress";

// GET /api/admin/modules/[id] - Get single module
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "ADMIN" && session.user.role !== "LECTURER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const courseModule = await prisma.module.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            lecturers: {
              select: { lecturerId: true },
            },
          },
        },
        lessons: {
          orderBy: { order: "asc" },
          include: {
            _count: {
              select: {
                resources: true,
              },
            },
          },
        },
        _count: {
          select: {
            lessons: true,
          },
        },
      },
    });

    if (!courseModule) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    // Lecturers can only access modules for their own courses
    if (session.user.role === "LECTURER") {
      const isAssigned = courseModule.course.lecturers.some(
        (l) => l.lecturerId === session.user.id,
      );
      if (!isAssigned) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    return NextResponse.json({ module: courseModule });
  } catch (error) {
    console.error("Error fetching module:", error);
    return NextResponse.json(
      { error: "Failed to fetch module" },
      { status: 500 },
    );
  }
}

// PUT /api/admin/modules/[id] - Update module
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "ADMIN" && session.user.role !== "LECTURER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { title, description, order } = body;

    // Check ownership if lecturer
    if (session.user.role === "LECTURER") {
      const courseModule = await prisma.module.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              lecturers: {
                where: { lecturerId: session.user.id },
              },
            },
          },
        },
      });

      if (!courseModule || courseModule.course.lecturers.length === 0) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const courseModule = await prisma.module.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order }),
      },
      include: {
        _count: {
          select: {
            lessons: true,
          },
        },
      },
    });

    return NextResponse.json({
      module: courseModule,
      message: "Module updated successfully",
    });
  } catch (error) {
    console.error("Error updating module:", error);
    return NextResponse.json(
      { error: "Failed to update module" },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/modules/[id] - Delete module
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if module has lessons
    const courseModule = await prisma.module.findUnique({
      where: { id },
      select: {
        courseId: true,
        _count: {
          select: {
            lessons: true,
          },
        },
      },
    });

    if (!courseModule) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const courseId = courseModule.courseId;

    // Check for force delete query param
    const { searchParams } = new URL(request.url);
    const forceDelete = searchParams.get("force") === "true";

    if (courseModule._count.lessons > 0 && !forceDelete) {
      return NextResponse.json(
        {
          error: `Module has ${courseModule._count.lessons} lesson(s). Use force=true to delete all content including submissions and files.`,
          lessonsCount: courseModule._count.lessons,
        },
        { status: 400 },
      );
    }

    // If force delete, get all files to delete (R2 for resources, B2 for submissions)
    const r2FileKeys: string[] = [];
    const b2FileKeys: string[] = [];

    if (forceDelete && courseModule._count.lessons > 0) {
      const moduleWithFiles = await prisma.module.findUnique({
        where: { id },
        include: {
          lessons: {
            include: {
              resources: {
                select: { fileKey: true },
              },
              assignments: {
                include: {
                  assignmentSubmissions: {
                    include: {
                      attachments: {
                        select: { fileKey: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (moduleWithFiles) {
        for (const lesson of moduleWithFiles.lessons) {
          // Lesson resources are in R2
          for (const resource of lesson.resources) {
            if (resource.fileKey) {
              r2FileKeys.push(resource.fileKey);
            }
          }

          // Assignment submission attachments are in B2
          for (const assignment of lesson.assignments) {
            for (const submission of assignment.assignmentSubmissions) {
              for (const attachment of submission.attachments) {
                if (attachment.fileKey) {
                  b2FileKeys.push(attachment.fileKey);
                }
              }
            }
          }
        }
      }
    }

    // Delete from database (cascade handles relations)
    await prisma.module.delete({
      where: { id },
    });

    // Clean up R2 and B2 files with bounded parallelism
    const DELETE_CONCURRENCY = 10;
    const deleteJobs = [
      ...r2FileKeys.map(
        (fileKey) => async () => {
          try {
            await deleteFromR2(fileKey);
          } catch (error) {
            console.error(`Failed to delete R2 file ${fileKey}:`, error);
          }
        },
      ),
      ...b2FileKeys.map(
        (fileKey) => async () => {
          try {
            await deleteFromB2(fileKey);
          } catch (error) {
            console.error(`Failed to delete B2 file ${fileKey}:`, error);
          }
        },
      ),
    ];

    for (let i = 0; i < deleteJobs.length; i += DELETE_CONCURRENCY) {
      await Promise.allSettled(
        deleteJobs.slice(i, i + DELETE_CONCURRENCY).map((job) => job()),
      );
    }

    await recalculateCourseProgress(courseId).catch((error) => {
      console.error(
        `Failed to recalculate progress for course ${courseId} after module deletion:`,
        error
      );
    });

    return NextResponse.json({
      message: "Module deleted successfully",
      filesDeleted: r2FileKeys.length + b2FileKeys.length,
    });
  } catch (error) {
    console.error("Error deleting module:", error);
    return NextResponse.json(
      { error: "Failed to delete module" },
      { status: 500 },
    );
  }
}
