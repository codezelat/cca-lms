import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getB2SignedUrl } from "@/lib/b2";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/assignments/[id]/bulk-download - Get signed URLs for batch download
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "ADMIN" && session.user.role !== "LECTURER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const batchIndex = parseInt(searchParams.get("batch") || "0");
    const batchSize = parseInt(searchParams.get("batchSize") || "5"); // Default 5 files per batch

    // Get assignment with submissions
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        lesson: {
          select: {
            module: {
              select: {
                course: {
                  select: {
                    lecturers: {
                      select: { lecturerId: true },
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
            attachments: {
              select: {
                id: true,
                fileKey: true,
                fileName: true,
                fileSize: true,
              },
            },
          },
          orderBy: {
            submittedAt: "desc",
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

    // Check ownership if lecturer
    if (session.user.role === "LECTURER") {
      const isAssigned = assignment.lesson.module.course.lecturers.some(
        (l) => l.lecturerId === session.user.id,
      );
      if (!isAssigned) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Flatten all attachments with student info
    const allFiles: {
      fileKey: string;
      fileName: string;
      fileSize: number;
      studentName: string;
      studentEmail: string;
      submissionId: string;
    }[] = [];

    for (const submission of assignment.assignmentSubmissions) {
      for (const attachment of submission.attachments) {
        allFiles.push({
          fileKey: attachment.fileKey,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          studentName: submission.user.name || "Unknown",
          studentEmail: submission.user.email,
          submissionId: submission.id,
        });
      }
    }

    const totalFiles = allFiles.length;
    const totalBatches = Math.ceil(totalFiles / batchSize);
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, totalFiles);
    const batchFiles = allFiles.slice(startIndex, endIndex);

    // Generate signed URLs for this batch
    const filesWithUrls = await Promise.all(
      batchFiles.map(async (file) => {
        try {
          const signedUrl = await getB2SignedUrl(file.fileKey, 3600);
          return {
            ...file,
            url: signedUrl,
            error: null,
          };
        } catch (error) {
          console.error(`Error getting URL for ${file.fileKey}:`, error);
          return {
            ...file,
            url: null,
            error: "Failed to generate download link",
          };
        }
      }),
    );

    return NextResponse.json({
      assignmentTitle: assignment.title,
      files: filesWithUrls,
      batch: {
        current: batchIndex,
        total: totalBatches,
        filesInBatch: batchFiles.length,
        totalFiles,
        hasMore: endIndex < totalFiles,
      },
    });
  } catch (error) {
    console.error("Error in bulk download:", error);
    return NextResponse.json(
      { error: "Failed to prepare bulk download" },
      { status: 500 },
    );
  }
}
