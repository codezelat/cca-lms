import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLogFromRequest } from "@/lib/audit";

const VISIT_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "STUDENT") {
      return NextResponse.json({ skipped: true }, { status: 200 });
    }

    const lastLogin = await prisma.auditLog.findFirst({
      where: {
        userId: session.user.id,
        action: "USER_LOGIN",
      },
      orderBy: { createdAt: "desc" },
    });

    if (
      lastLogin &&
      Date.now() - lastLogin.createdAt.getTime() < VISIT_THROTTLE_MS
    ) {
      return NextResponse.json({ skipped: true }, { status: 200 });
    }

    await createAuditLogFromRequest(
      {
        userId: session.user.id,
        action: "USER_LOGIN",
        entityType: "User",
        entityId: session.user.id,
        metadata: {
          source: "visit",
        },
      },
      request,
    );

    return NextResponse.json({ logged: true }, { status: 201 });
  } catch (error) {
    console.error("Error logging visit:", error);
    return NextResponse.json(
      { error: "Failed to log visit" },
      { status: 500 },
    );
  }
}
