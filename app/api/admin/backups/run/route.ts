import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { triggerDatabaseBackupWorkflow } from "@/lib/db-backups";

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const triggeredBy = session.user.email || session.user.id;
    const dispatch = await triggerDatabaseBackupWorkflow(triggeredBy);

    return NextResponse.json({
      success: true,
      message: "Backup workflow queued successfully.",
      dispatch,
    });
  } catch (error) {
    console.error("[Admin Backups Run] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
