import { NextRequest, NextResponse } from "next/server";
import {
  getRecentBackupWorkflowRuns,
  listDatabaseBackups,
  triggerDatabaseBackupWorkflow,
} from "@/lib/db-backups";
import { getMostRecentDbBackupSlot } from "@/lib/db-backup-schedule";
import { timingSafeStringCompare } from "@/lib/security";

export const dynamic = "force-dynamic";

function verifyCronAuthorization(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === "development") {
      return { authorized: true };
    }

    return {
      authorized: false,
      error: "CRON_SECRET is not configured.",
    };
  }

  if (authHeader && timingSafeStringCompare(authHeader, `Bearer ${cronSecret}`)) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: "Invalid authorization header.",
  };
}

export async function GET(request: NextRequest) {
  const authResult = verifyCronAuthorization(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const [backups, workflowRuns] = await Promise.all([
      listDatabaseBackups(),
      getRecentBackupWorkflowRuns(1).catch(() => []),
    ]);

    const latestBackup = backups[0] || null;
    const latestRun = workflowRuns[0] || null;
    const mostRecentScheduledSlot = getMostRecentDbBackupSlot();

    if (
      latestBackup &&
      new Date(latestBackup.lastModified).getTime() >=
        mostRecentScheduledSlot.getTime()
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "A backup already exists for the current daily window.",
        latestBackup,
      });
    }

    if (latestRun && latestRun.status !== "completed") {
      return NextResponse.json(
        {
          success: true,
          skipped: true,
          reason: "A backup workflow run is already in progress.",
          latestRun,
        },
        { status: 202 },
      );
    }

    const dispatch = await triggerDatabaseBackupWorkflow("vercel-cron");

    return NextResponse.json({
      success: true,
      queued: true,
      dispatch,
    });
  } catch (error) {
    console.error("[Cron Backup Dispatch] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
