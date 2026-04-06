import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { duplicateModuleToCourse } from "@/lib/module-duplication";

export const runtime = "nodejs";

const duplicateModuleSchema = z.object({
  targetCourseId: z.string().cuid(),
  title: z
    .string()
    .trim()
    .min(3, "Module title must be at least 3 characters.")
    .max(200, "Module title is too long.")
    .optional(),
});

export async function POST(
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

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsedBody = duplicateModuleSchema.safeParse(body);

    if (!parsedBody.success) {
      const firstIssue = parsedBody.error.issues[0];

      return NextResponse.json(
        {
          error: firstIssue?.message || "Invalid duplication payload.",
        },
        { status: 400 },
      );
    }

    const duplicatedModule = await duplicateModuleToCourse({
      actorRole: session.user.role,
      actorUserId: session.user.id,
      sourceModuleId: id,
      targetCourseId: parsedBody.data.targetCourseId,
      title: parsedBody.data.title,
    });

    return NextResponse.json(
      {
        message: "Module duplicated successfully",
        ...duplicatedModule,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error duplicating module:", error);

    const message =
      error instanceof Error ? error.message : "Failed to duplicate module";
    const lowerMessage = message.toLowerCase();

    const status =
      lowerMessage.includes("not found")
        ? 404
        : lowerMessage.includes("different target programme")
          ? 400
          : lowerMessage.includes("assigned")
          ? 403
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
