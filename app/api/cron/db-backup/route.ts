import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import {
  getDatabaseBackupsOverview,
  isValidBackupReport,
  type BackupReportPayload,
} from "@/lib/db-backups";

export const dynamic = "force-dynamic";

interface AuthResult {
  authorized: boolean;
  triggeredBy?: string;
  error?: string;
}

function verifyAuthorization(request: NextRequest): AuthResult {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === "development") {
      return { authorized: true, triggeredBy: "development-no-secret" };
    }

    return {
      authorized: false,
      error: "CRON_SECRET is not configured.",
    };
  }

  if (authHeader === `Bearer ${cronSecret}`) {
    return {
      authorized: true,
      triggeredBy: "github-actions-report",
    };
  }

  return {
    authorized: false,
    error: "Invalid authorization header.",
  };
}

export async function GET(request: NextRequest) {
  const authResult = verifyAuthorization(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const overview = await getDatabaseBackupsOverview();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...overview,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  const authResult = verifyAuthorization(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as unknown;

    if (!isValidBackupReport(payload)) {
      return NextResponse.json(
        { error: "Invalid backup report payload." },
        { status: 400 },
      );
    }

    const report = payload as BackupReportPayload;

    if (report.status === "success") {
      await createAuditLog({
        action: "BACKUP_CREATED",
        entityType: "DatabaseBackup",
        entityId: report.artifactKey,
        metadata: {
          triggeredBy: report.triggeredBy || authResult.triggeredBy,
          artifactKey: report.artifactKey,
          artifactSizeBytes: report.artifactSizeBytes,
          artifactChecksum: report.artifactChecksum,
          durationMs: report.durationMs,
          workflowRunUrl: report.workflowRunUrl,
          workflowRunId: report.workflowRunId,
        },
        ipAddress,
        userAgent,
      });

      if (report.cleanupDeletedCount && report.cleanupDeletedCount > 0) {
        await createAuditLog({
          action: "BACKUP_CLEANUP",
          entityType: "DatabaseBackup",
          metadata: {
            deletedCount: report.cleanupDeletedCount,
            deletedKeys: report.cleanupDeletedKeys || [],
            workflowRunUrl: report.workflowRunUrl,
          },
          ipAddress,
          userAgent,
        });
      }
    } else {
      await createAuditLog({
        action: "BACKUP_FAILED",
        entityType: "DatabaseBackup",
        metadata: {
          triggeredBy: report.triggeredBy || authResult.triggeredBy,
          error: report.error || "Unknown backup workflow failure",
          workflowRunUrl: report.workflowRunUrl,
          workflowRunId: report.workflowRunId,
        },
        ipAddress,
        userAgent,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
