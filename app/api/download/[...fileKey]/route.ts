import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getB2SignedUrl } from "@/lib/b2";

type RouteParams = { params: Promise<{ fileKey: string[] }> };

// GET /api/download/[...fileKey] - Proxy download through our domain
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileKey: fileKeyParts } = await params;
    const fileKey = fileKeyParts.join("/"); // Reconstruct path like "submissions/timestamp-file.pdf"

    if (!fileKey) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    // Determine file type and verify permission
    let hasPermission = false;
    let fileName = fileKey.split("/").pop() || "download";

    if (fileKey.startsWith("submissions/")) {
      // Assignment submission file - check if user owns it or is instructor
      const attachment = await prisma.assignmentSubmissionAttachment.findFirst({
        where: { fileKey },
        include: {
          submission: {
            include: {
              user: { select: { id: true } },
              assignment: {
                include: {
                  lesson: {
                    include: {
                      module: {
                        include: {
                          course: {
                            include: {
                              lecturers: { select: { lecturerId: true } },
                              enrollments: {
                                where: { userId: session.user.id },
                                select: { id: true },
                              },
                            },
                          },
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

      if (attachment) {
        fileName = attachment.fileName;
        const isOwner = attachment.submission.user.id === session.user.id;
        const isAdmin = session.user.role === "ADMIN";
        const isLecturer =
          session.user.role === "LECTURER" &&
          attachment.submission.assignment.lesson.module.course.lecturers.some(
            (l) => l.lecturerId === session.user.id,
          );
        const isEnrolled =
          attachment.submission.assignment.lesson.module.course.enrollments
            .length > 0;

        hasPermission = isOwner || isAdmin || isLecturer || isEnrolled;
      }
    } else if (fileKey.startsWith("resources/")) {
      // Lesson resource file - check enrollment or instructor
      const resource = await prisma.lessonResource.findFirst({
        where: { fileKey },
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: {
                    include: {
                      lecturers: { select: { lecturerId: true } },
                      enrollments: {
                        where: { userId: session.user.id },
                        select: { id: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (resource) {
        fileName = resource.fileName || fileName;
        const isAdmin = session.user.role === "ADMIN";
        const isLecturer =
          session.user.role === "LECTURER" &&
          resource.lesson.module.course.lecturers.some(
            (l) => l.lecturerId === session.user.id,
          );
        const isEnrolled = resource.lesson.module.course.enrollments.length > 0;

        hasPermission = isAdmin || isLecturer || isEnrolled;
      }
    } else {
      // Unknown file type - only admin can access
      hasPermission = session.user.role === "ADMIN";
    }

    if (!hasPermission) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get signed URL from B2
    const signedUrl = await getB2SignedUrl(fileKey, 300); // 5 min expiry for proxy

    // Fetch from B2
    const b2Response = await fetch(signedUrl);

    if (!b2Response.ok) {
      console.error(
        "B2 fetch failed:",
        b2Response.status,
        b2Response.statusText,
      );
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Get content type from B2 response or guess from extension
    const contentType =
      b2Response.headers.get("content-type") || getContentType(fileName);

    // Stream the response
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );

    // Copy content-length if available
    const contentLength = b2Response.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    // Cache for 1 hour (file won't change)
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(b2Response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Download proxy error:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}

function getContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}
