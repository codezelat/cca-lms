import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadToB2, deleteFromB2 } from "@/lib/b2";
import { createAuditLog } from "@/lib/audit";

// POST /api/student/submissions - Create or update submission
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "STUDENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const assignmentId = formData.get("assignmentId") as string;
    const content = formData.get("content") as string | null;
    const files = formData.getAll("files") as File[];

    if (!assignmentId) {
      return NextResponse.json(
        { error: "Assignment ID is required" },
        { status: 400 },
      );
    }

    // Get assignment details
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        lesson: {
          select: {
            module: {
              select: {
                course: {
                  select: {
                    enrollments: {
                      where: {
                        userId: session.user.id,
                      },
                    },
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

    // Check enrollment
    if (assignment.lesson.module.course.enrollments.length === 0) {
      return NextResponse.json(
        { error: "You are not enrolled in this course" },
        { status: 403 },
      );
    }

    // Check deadline
    const now = new Date();
    const isOverdue = assignment.dueDate < now;
    if (isOverdue && !assignment.allowLateSubmission) {
      return NextResponse.json(
        { error: "Submission deadline has passed" },
        { status: 400 },
      );
    }

    // Validate file count
    if (files.length > assignment.maxFiles) {
      return NextResponse.json(
        {
          error: `Maximum ${assignment.maxFiles} file(s) allowed`,
        },
        { status: 400 },
      );
    }

    // Validate files
    for (const file of files) {
      if (file.size === 0) continue; // Skip empty files

      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";

      // Check file type
      if (!assignment.allowedFileTypes.includes(fileExtension)) {
        return NextResponse.json(
          {
            error: `File type .${fileExtension} not allowed. Allowed types: ${assignment.allowedFileTypes.join(", ")}`,
          },
          { status: 400 },
        );
      }

      // Check file size
      if (file.size > assignment.maxFileSize) {
        const maxSizeMB = (assignment.maxFileSize / (1024 * 1024)).toFixed(1);
        return NextResponse.json(
          {
            error: `File "${file.name}" exceeds maximum size of ${maxSizeMB}MB`,
          },
          { status: 400 },
        );
      }
    }

    // Get or create submission
    let submission = await prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_userId: {
          assignmentId,
          userId: session.user.id,
        },
      },
      include: {
        attachments: true,
      },
    });

    // Check if already submitted and graded
    if (submission && submission.status === "GRADED") {
      return NextResponse.json(
        { error: "Cannot modify a graded submission" },
        { status: 400 },
      );
    }

    // Upload files to B2
    const uploadedFiles: Array<{
      fileKey: string;
      fileId: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
    }> = [];

    for (const file of files) {
      if (file.size === 0) continue;

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadToB2(buffer, file.name, file.type, {
          userId: session.user.id,
          assignmentId,
          uploadedAt: new Date().toISOString(),
        });

        uploadedFiles.push({
          fileKey: result.fileKey,
          fileId: result.fileId,
          fileName: result.fileName,
          fileSize: result.contentLength,
          mimeType: file.type,
        });
      } catch (error) {
        // Clean up already uploaded files if one fails
        for (const uploaded of uploadedFiles) {
          try {
            await deleteFromB2(uploaded.fileKey, uploaded.fileId);
          } catch (e) {
            console.error("Error cleaning up file:", e);
          }
        }
        throw error;
      }
    }

    // Create or update submission
    if (!submission) {
      submission = await prisma.assignmentSubmission.create({
        data: {
          assignmentId,
          userId: session.user.id,
          content: content || null,
          status: "SUBMITTED",
          submittedAt: new Date(),
          maxGrade: assignment.maxPoints,
          attachments: {
            create: uploadedFiles.map((file) => ({
              fileKey: file.fileKey,
              fileId: file.fileId,
              fileName: file.fileName,
              fileSize: file.fileSize,
              mimeType: file.mimeType,
            })),
          },
        },
        include: {
          attachments: true,
        },
      });
    } else {
      submission = await prisma.assignmentSubmission.update({
        where: { id: submission.id },
        data: {
          content: content || submission.content,
          status: "SUBMITTED",
          submittedAt: new Date(),
          attachments: {
            create: uploadedFiles.map((file) => ({
              fileKey: file.fileKey,
              fileId: file.fileId,
              fileName: file.fileName,
              fileSize: file.fileSize,
              mimeType: file.mimeType,
            })),
          },
        },
        include: {
          attachments: true,
        },
      });
    }

    await createAuditLog({
      userId: session.user.id,
      action: "SUBMISSION_CREATED",
      entityType: "AssignmentSubmission",
      entityId: submission.id,
      metadata: {
        assignmentId,
        fileCount: uploadedFiles.length,
        isLate: isOverdue,
      },
    });

    return NextResponse.json(
      {
        submission,
        message: "Submission uploaded successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating submission:", error);
    return NextResponse.json(
      { error: "Failed to submit assignment" },
      { status: 500 },
    );
  }
}
