import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabaseBackupsOverview } from "@/lib/db-backups";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  try {
    const session = await auth();
    const isAdmin = session?.user?.role === "ADMIN";

    const authHeader = request.headers.get("authorization");
    const adminSecret = process.env.ADMIN_API_SECRET || process.env.CRON_SECRET;
    const isApiKeyAuth = Boolean(adminSecret && authHeader === `Bearer ${adminSecret}`);

    if (!isAdmin && !isApiKeyAuth) {
      await createAuditLog({
        action: "SYSTEM_WARNING",
        entityType: "Backup",
        metadata: {
          reason: "Unauthorized backup overview access attempt",
          endpoint: "/api/admin/backups",
        },
        ipAddress,
        userAgent,
      });

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const overview = await getDatabaseBackupsOverview();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...overview,
      restore: {
        note: "Database backups are portable SQL exports bundled into a private R2 archive. Storage objects are not included.",
        steps: [
          "1. Download a backup archive from the list below.",
          "2. Extract roles.sql, schema.sql, data.sql, and manifest.json from the archive.",
          "3. Restore roles only if you intentionally use custom database roles.",
          "4. Apply schema.sql first, then data.sql against the target database.",
          "5. Validate the application before promoting the restored database.",
        ],
        commands: {
          roles: 'psql "$TARGET_DATABASE_URL" -f roles.sql',
          schema: 'psql "$TARGET_DATABASE_URL" -f schema.sql',
          data: 'psql "$TARGET_DATABASE_URL" -f data.sql',
        },
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
