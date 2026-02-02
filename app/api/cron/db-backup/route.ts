import { NextRequest, NextResponse } from "next/server";
import { runBackupJob, getBackupStats, BackupJobResult } from "@/lib/backup";
import { createAuditLog } from "@/lib/audit";

export const maxDuration = 300; // 5 minutes for Pro plan
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/db-backup
 *
 * Daily database backup job triggered by Vercel Cron
 * - Creates a full database backup
 * - Uploads compressed backup to R2
 * - Cleans up backups older than 14 days
 * - Logs all operations to audit system
 *
 * Schedule: Daily at 2:00 AM UTC (configured in vercel.json)
 *
 * Security:
 * - Only Vercel Cron or authenticated requests with CRON_SECRET can trigger
 * - Backup files stored in private R2 bucket (not publicly accessible)
 * - Backup keys use date-based paths, no sensitive data in filenames
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  try {
    // Verify authorization
    const authResult = verifyAuthorization(request);
    if (!authResult.authorized) {
      // Log unauthorized attempt
      await createAuditLog({
        action: "SYSTEM_WARNING",
        entityType: "Backup",
        metadata: {
          reason: "Unauthorized backup attempt",
          error: authResult.error,
        },
        ipAddress,
        userAgent,
      });

      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    console.log("[DB Backup Cron] Starting daily backup job...");
    console.log(`[DB Backup Cron] Triggered by: ${authResult.triggeredBy}`);

    // Run the backup job
    const result: BackupJobResult = await runBackupJob();

    // Get current backup stats
    const stats = await getBackupStats();

    // Prepare response
    const response = {
      success: result.backup.success && result.cleanup.success,
      timestamp: new Date().toISOString(),
      triggeredBy: authResult.triggeredBy,
      backup: {
        success: result.backup.success,
        key: result.backup.key,
        sizeBytes: result.backup.size,
        sizeMB: result.backup.size
          ? (result.backup.size / 1024 / 1024).toFixed(2)
          : undefined,
        tablesBackedUp: result.backup.tablesBackedUp,
        totalRecords: result.backup.totalRecords,
        durationMs: result.backup.duration,
        error: result.backup.error,
      },
      cleanup: {
        success: result.cleanup.success,
        deletedCount: result.cleanup.deletedCount,
        deletedKeys: result.cleanup.deletedKeys,
        error: result.cleanup.error,
      },
      stats: {
        totalBackups: stats.totalBackups,
        totalSizeBytes: stats.totalSize,
        totalSizeMB: (stats.totalSize / 1024 / 1024).toFixed(2),
        oldestBackup: stats.oldestBackup?.toISOString(),
        newestBackup: stats.newestBackup?.toISOString(),
      },
      totalDurationMs: Date.now() - startTime,
    };

    // Audit log for successful backup
    if (result.backup.success) {
      await createAuditLog({
        action: "BACKUP_CREATED",
        entityType: "Backup",
        entityId: result.backup.key,
        metadata: {
          triggeredBy: authResult.triggeredBy,
          tablesBackedUp: result.backup.tablesBackedUp,
          totalRecords: result.backup.totalRecords,
          sizeBytes: result.backup.size,
          durationMs: result.backup.duration,
        },
        ipAddress,
        userAgent,
      });
    } else {
      await createAuditLog({
        action: "BACKUP_FAILED",
        entityType: "Backup",
        metadata: {
          triggeredBy: authResult.triggeredBy,
          error: result.backup.error,
        },
        ipAddress,
        userAgent,
      });
    }

    // Audit log for cleanup if any files were deleted
    if (result.cleanup.deletedCount && result.cleanup.deletedCount > 0) {
      await createAuditLog({
        action: "BACKUP_CLEANUP",
        entityType: "Backup",
        metadata: {
          deletedCount: result.cleanup.deletedCount,
          deletedKeys: result.cleanup.deletedKeys,
        },
        ipAddress,
        userAgent,
      });
    }

    console.log(
      "[DB Backup Cron] Job completed:",
      JSON.stringify(response, null, 2),
    );

    return NextResponse.json(response, {
      status: result.backup.success ? 200 : 500,
    });
  } catch (error) {
    console.error("[DB Backup Cron] Critical error:", error);

    // Audit log for critical failure
    await createAuditLog({
      action: "BACKUP_FAILED",
      entityType: "Backup",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        critical: true,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/cron/db-backup
 *
 * Get backup status and statistics
 * Useful for monitoring backup health
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    const authResult = verifyAuthorization(request);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const stats = await getBackupStats();

    const now = new Date();
    const daysSinceLastBackup = stats.newestBackup
      ? Math.floor(
          (now.getTime() - stats.newestBackup.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      stats: {
        totalBackups: stats.totalBackups,
        totalSizeBytes: stats.totalSize,
        totalSizeMB: (stats.totalSize / 1024 / 1024).toFixed(2),
        oldestBackup: stats.oldestBackup?.toISOString(),
        newestBackup: stats.newestBackup?.toISOString(),
        daysSinceLastBackup,
        backupsByDate: stats.backupsByDate,
      },
      health: {
        status:
          daysSinceLastBackup === null || daysSinceLastBackup > 1
            ? "WARNING"
            : "HEALTHY",
        message:
          daysSinceLastBackup === null
            ? "No backups found"
            : daysSinceLastBackup > 1
              ? `Last backup was ${daysSinceLastBackup} days ago`
              : "Backups are up to date",
      },
      config: {
        retentionDays: 14,
        schedule: "Daily at 2:00 AM UTC",
      },
    });
  } catch (error) {
    console.error("[DB Backup Status] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// ============================================================================
// Authorization Helper
// ============================================================================

interface AuthResult {
  authorized: boolean;
  triggeredBy?: string;
  error?: string;
}

function verifyAuthorization(request: NextRequest): AuthResult {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // SECURITY: In production, CRON_SECRET is REQUIRED
  // Vercel automatically sends: Authorization: Bearer <CRON_SECRET>
  // when CRON_SECRET env var is set in your Vercel project
  
  if (!cronSecret) {
    // No CRON_SECRET configured - only allow in development
    if (process.env.NODE_ENV === "development") {
      return { authorized: true, triggeredBy: "development-no-secret" };
    }
    return {
      authorized: false,
      error: "CRON_SECRET environment variable not configured.",
    };
  }

  // Verify the authorization header matches CRON_SECRET
  // This works for both:
  // 1. Vercel Cron (automatically sends Bearer token)
  // 2. Manual API calls (you provide Bearer token)
  if (authHeader === `Bearer ${cronSecret}`) {
    // Check if it's from Vercel Cron (for logging purposes only, not security)
    const userAgent = request.headers.get("user-agent") || "";
    const isVercelCron = userAgent.includes("vercel-cron");
    return { 
      authorized: true, 
      triggeredBy: isVercelCron ? "vercel-cron" : "manual-api" 
    };
  }

  // In development, allow without auth for testing
  if (process.env.NODE_ENV === "development") {
    return { authorized: true, triggeredBy: "development" };
  }

  return {
    authorized: false,
    error: "Invalid or missing CRON_SECRET authorization.",
  };
}
