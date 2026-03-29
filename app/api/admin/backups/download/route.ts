import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabaseBackupDownloadUrl } from "@/lib/db-backups";

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { error: "Backup key is required." },
        { status: 400 },
      );
    }

    const downloadUrl = await getDatabaseBackupDownloadUrl(key);
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    console.error("[Admin Backups Download] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
