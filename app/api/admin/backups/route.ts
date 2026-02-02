import { NextRequest, NextResponse } from "next/server";
import { listBackups, BackupInfo } from "@/lib/backup";
import { auth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/backups
 *
 * List all available backups (Admin only)
 * Returns backup files with metadata for restore operations
 *
 * Security:
 * - Requires admin session OR valid ADMIN_API_SECRET/CRON_SECRET
 * - Logs all access attempts to audit system
 * - Does not expose actual file contents, only metadata
 */
export async function GET(request: NextRequest) {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  try {
    // Check for session-based admin auth first
    const session = await auth();
    const isSessionAdmin = session?.user?.role === "ADMIN";

    // Then check for API key auth
    const authHeader = request.headers.get("authorization");
    const adminSecret = process.env.ADMIN_API_SECRET || process.env.CRON_SECRET;
    const isApiKeyAuth = adminSecret && authHeader === `Bearer ${adminSecret}`;

    // In development, allow access for testing
    const isDevelopment = process.env.NODE_ENV === "development";

    if (!isSessionAdmin && !isApiKeyAuth && !isDevelopment) {
      // Log unauthorized access attempt
      await createAuditLog({
        action: "SYSTEM_WARNING",
        entityType: "Backup",
        metadata: {
          reason: "Unauthorized backup list access attempt",
          endpoint: "/api/admin/backups",
        },
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 401 },
      );
    }

    const backups = await listBackups();

    // Format backup list for response (no sensitive data exposed)
    const formattedBackups = backups.map((backup: BackupInfo) => ({
      key: backup.key,
      sizeBytes: backup.size,
      sizeMB: (backup.size / 1024 / 1024).toFixed(2),
      lastModified: backup.lastModified.toISOString(),
      ageInDays: Math.floor(
        (Date.now() - backup.lastModified.getTime()) / (1000 * 60 * 60 * 24),
      ),
    }));

    // Group by date
    const backupsByDate: Record<string, typeof formattedBackups> = {};
    for (const backup of formattedBackups) {
      const dateKey = backup.lastModified.split("T")[0];
      if (!backupsByDate[dateKey]) {
        backupsByDate[dateKey] = [];
      }
      backupsByDate[dateKey].push(backup);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: backups.length,
      totalSizeMB: (
        backups.reduce((sum, b) => sum + b.size, 0) /
        1024 /
        1024
      ).toFixed(2),
      backups: formattedBackups,
      byDate: backupsByDate,
      restoreInstructions: {
        note: "To restore a backup, download the file from R2 and use the restore script",
        steps: [
          "1. Download the backup file from R2 using the key",
          "2. Decompress the .gz file to get the JSON",
          "3. Run: npx ts-node scripts/restore-backup.ts <path-to-json>",
          "4. Or use the Supabase dashboard to import if needed",
        ],
      },
    });
  } catch (error) {
    console.error("[Admin Backups] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
