/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    CCA LMS - DATABASE RESTORE UTILITY                        ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  This script restores database backups created by the automated backup       ║
 * ║  system. Use this for disaster recovery or data migration.                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ PREREQUISITES                                                               │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ 1. Node.js 18+ installed                                                    │
 * │ 2. Project dependencies installed: npm install                              │
 * │ 3. Environment variables configured in .env file:                           │
 * │    - DATABASE_URL: PostgreSQL connection string (Supabase)                  │
 * │    - DIRECT_URL: Direct database URL for migrations                         │
 * │ 4. Backup file downloaded from R2 (either .json or .json.gz format)         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ HOW TO DOWNLOAD A BACKUP FROM R2                                            │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ Option 1: Cloudflare Dashboard                                              │
 * │   1. Go to Cloudflare Dashboard → R2                                        │
 * │   2. Select your bucket                                                     │
 * │   3. Navigate to backups/ folder                                            │
 * │   4. Download the desired backup file                                       │
 * │                                                                             │
 * │ Option 2: AWS CLI (configured for R2)                                       │
 * │   aws s3 cp s3://your-bucket/backups/backup-YYYY-MM-DD.json.gz ./           │
 * │   --endpoint-url https://<account-id>.r2.cloudflarestorage.com              │
 * │                                                                             │
 * │ Option 3: Admin API (if server is running)                                  │
 * │   curl https://your-domain.com/api/admin/backups                            │
 * │     -H "Authorization: Bearer YOUR_ADMIN_SECRET"                            │
 * │   (This lists available backups with download URLs)                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ USAGE                                                                       │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ Basic restore (with confirmation prompt):                                   │
 * │   npx tsx --env-file=.env scripts/restore-backup.ts ./backup.json.gz        │
 * │                                                                             │
 * │ Dry run (preview only, no changes):                                         │
 * │   npx tsx --env-file=.env scripts/restore-backup.ts ./backup.json --dry-run │
 * │                                                                             │
 * │ Force restore (skip confirmation, use in scripts):                          │
 * │   npx tsx --env-file=.env scripts/restore-backup.ts ./backup.json --force   │
 * │                                                                             │
 * │ Combined options:                                                           │
 * │   npx tsx --env-file=.env scripts/restore-backup.ts ./backup.json.gz        │
 * │     --dry-run --force                                                       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ OPTIONS                                                                     │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ --dry-run    Validates the backup file and shows what would be restored     │
 * │              without making any database changes. ALWAYS run this first!    │
 * │                                                                             │
 * │ --force      Skips the interactive confirmation prompt. Use this when       │
 * │              running from automated scripts or CI/CD pipelines.             │
 * │              ⚠️  DANGEROUS: Use with caution!                               │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ RESTORE PROCESS                                                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ 1. Reads and decompresses backup file (if .gz)                              │
 * │ 2. Validates backup structure and displays metadata                         │
 * │ 3. Prompts for confirmation (unless --force or --dry-run)                   │
 * │ 4. DELETES ALL EXISTING DATA from all tables                                │
 * │ 5. Restores data in correct order (respecting foreign key constraints)      │
 * │ 6. Reports success/failure for each table                                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ ⚠️  SECURITY CONSIDERATIONS                                                 │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ 1. RUN LOCALLY ONLY: This script should be run from a secure local machine  │
 * │    with direct database access. Never expose this as a web endpoint!        │
 * │                                                                             │
 * │ 2. VERIFY BACKUP SOURCE: Only restore from backups you trust. Malicious     │
 * │    backup files could inject harmful data into your database.               │
 * │                                                                             │
 * │ 3. BACKUP BEFORE RESTORE: Always create a fresh backup before restoring     │
 * │    in case you need to rollback: npm run backup (or trigger via API)        │
 * │                                                                             │
 * │ 4. DATABASE CREDENTIALS: The script uses DATABASE_URL from .env file.       │
 * │    Ensure .env is not committed to git and has proper permissions (600).    │
 * │                                                                             │
 * │ 5. AUDIT LOGGING: This script does NOT create audit logs. Consider          │
 * │    manually logging the restore action after completion.                    │
 * │                                                                             │
 * │ 6. CHECKSUM VERIFICATION: The backup includes a SHA-256 checksum in         │
 * │    metadata. Future versions will verify this automatically.                │
 * │                                                                             │
 * │ 7. NETWORK: Ensure you're on a trusted network when restoring, as           │
 * │    database credentials are transmitted to Supabase.                        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ TROUBLESHOOTING                                                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ Error: "Cannot find module '../generated/prisma/client'"                    │
 * │   → Run: npx prisma generate                                                │
 * │                                                                             │
 * │ Error: "Connection refused" or "ECONNREFUSED"                               │
 * │   → Check DATABASE_URL in .env is correct                                   │
 * │   → Verify Supabase project is running                                      │
 * │   → Check IP allowlist in Supabase dashboard                                │
 * │                                                                             │
 * │ Error: "Foreign key constraint failed"                                      │
 * │   → The restore order may need updating for schema changes                  │
 * │   → Check if backup is from a compatible schema version                     │
 * │                                                                             │
 * │ Error: "Invalid backup format"                                              │
 * │   → Ensure file is a valid JSON backup (not corrupted during download)      │
 * │   → Try downloading the backup file again                                   │
 * │                                                                             │
 * │ Error: "ENOMEM" (out of memory)                                             │
 * │   → Backup file is too large for available memory                           │
 * │   → Try on a machine with more RAM or stream processing (advanced)          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ EXAMPLE DISASTER RECOVERY WORKFLOW                                          │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ 1. Identify the issue and determine restore point needed                    │
 * │                                                                             │
 * │ 2. Download the appropriate backup:                                         │
 * │    - Go to Cloudflare R2 → your-bucket → backups/                           │
 * │    - Download backup-YYYY-MM-DD.json.gz                                     │
 * │                                                                             │
 * │ 3. Validate the backup (dry run):                                           │
 * │    npx tsx --env-file=.env scripts/restore-backup.ts \                      │
 * │      ./backup-2026-02-01.json.gz --dry-run                                  │
 * │                                                                             │
 * │ 4. Create a backup of current state (just in case):                         │
 * │    curl -X POST https://your-domain.com/api/cron/db-backup \                │
 * │      -H "Authorization: Bearer YOUR_CRON_SECRET"                            │
 * │                                                                             │
 * │ 5. Perform the restore:                                                     │
 * │    npx tsx --env-file=.env scripts/restore-backup.ts \                      │
 * │      ./backup-2026-02-01.json.gz                                            │
 * │    → Type "yes" when prompted                                               │
 * │                                                                             │
 * │ 6. Verify the application is working correctly                              │
 * │                                                                             │
 * │ 7. Log the incident and restore action for audit purposes                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * @version 1.0.0
 * @author CCA LMS Team
 * @license Proprietary - Codezela Technologies
 */

import * as fs from "fs";
import * as zlib from "zlib";
import * as readline from "readline";
import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient();

interface BackupMetadata {
  version: string;
  createdAt: string;
  environment: string;
  tables: { name: string; count: number }[];
  totalRecords: number;
  checksum: string;
}

interface BackupData {
  metadata: BackupMetadata;
  data: Record<string, unknown[]>;
}

async function main() {
  const args = process.argv.slice(2);
  const backupPath = args.find((arg) => !arg.startsWith("--"));
  const isDryRun = args.includes("--dry-run");
  const forceRestore = args.includes("--force");

  if (!backupPath) {
    console.error(
      "Usage: npx ts-node scripts/restore-backup.ts <path-to-backup>",
    );
    console.error("");
    console.error("Options:");
    console.error(
      "  --dry-run    Show what would be restored without making changes",
    );
    console.error("  --force      Skip confirmation prompt");
    console.error("");
    console.error("Example:");
    console.error("  npx ts-node scripts/restore-backup.ts ./backup.json");
    console.error("  npx ts-node scripts/restore-backup.ts ./backup.json.gz");
    process.exit(1);
  }

  console.log(
    "╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║           CCA LMS Database Restore Utility                     ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝",
  );
  console.log("");

  // Read and parse backup file
  console.log(`📂 Reading backup file: ${backupPath}`);
  let backupJson: string;

  try {
    const fileContent = fs.readFileSync(backupPath);

    // Check if file is gzipped
    if (backupPath.endsWith(".gz")) {
      console.log("📦 Decompressing gzipped backup...");
      backupJson = zlib.gunzipSync(fileContent).toString("utf-8");
    } else {
      backupJson = fileContent.toString("utf-8");
    }
  } catch (error) {
    console.error(`❌ Failed to read backup file: ${error}`);
    process.exit(1);
  }

  // Parse JSON
  let backup: BackupData;
  try {
    backup = JSON.parse(backupJson);
  } catch (error) {
    console.error(`❌ Failed to parse backup JSON: ${error}`);
    process.exit(1);
  }

  // Validate backup structure
  if (!backup.metadata || !backup.data) {
    console.error("❌ Invalid backup format: missing metadata or data");
    process.exit(1);
  }

  // Display backup info
  console.log("");
  console.log("📋 Backup Information:");
  console.log(`   Version: ${backup.metadata.version}`);
  console.log(`   Created: ${backup.metadata.createdAt}`);
  console.log(`   Environment: ${backup.metadata.environment}`);
  console.log(`   Checksum: ${backup.metadata.checksum}`);
  console.log("");
  console.log("📊 Tables to restore:");
  for (const table of backup.metadata.tables) {
    console.log(`   • ${table.name}: ${table.count.toLocaleString()} records`);
  }
  console.log("");
  console.log(
    `   Total: ${backup.metadata.totalRecords.toLocaleString()} records`,
  );
  console.log("");

  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made");
    console.log("");
    console.log("✅ Backup file is valid and ready for restore");
    process.exit(0);
  }

  // Confirmation
  if (!forceRestore) {
    console.log(
      "⚠️  WARNING: This will DELETE all existing data and replace it!",
    );
    console.log("");

    const confirmed = await askConfirmation(
      "Are you sure you want to restore this backup? (yes/no): ",
    );

    if (!confirmed) {
      console.log("❌ Restore cancelled");
      process.exit(0);
    }
  }

  // Perform restore
  console.log("");
  console.log("🔄 Starting database restore...");
  console.log("");

  try {
    await restoreDatabase(backup);
    console.log("");
    console.log("✅ Database restore completed successfully!");
  } catch (error) {
    console.error("");
    console.error("❌ Restore failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
    });
  });
}

async function restoreDatabase(backup: BackupData): Promise<void> {
  const { data } = backup;

  // Delete all existing data in reverse order (respecting FK constraints)
  console.log("🗑️  Clearing existing data...");

  // Order matters for deletion (reverse of creation order)
  const deleteOrder = [
    "auditLogs",
    "notifications",
    "uploadedFiles",
    "submissionAttachments",
    "submissions",
    "assignmentSubmissionAttachments",
    "assignmentSubmissions",
    "assignments",
    "lessonProgress",
    "courseEnrollments",
    "quizResponses",
    "quizAttempts",
    "quizAnswers",
    "quizQuestions",
    "quizzes",
    "resourceVersions",
    "lessonResources",
    "lessons",
    "modules",
    "courseLecturers",
    "courses",
    "sessions",
    "accounts",
    "verificationTokens",
    "users",
  ];

  for (const tableName of deleteOrder) {
    try {
      // @ts-expect-error - dynamic table access
      const deleted = await prisma[tableName].deleteMany({});
      console.log(`   Cleared ${tableName}: ${deleted.count} records`);
    } catch (error) {
      // Table might not exist or already empty
      console.log(`   Skipped ${tableName}: ${error}`);
    }
  }

  // Insert data in correct order (respecting FK constraints)
  console.log("");
  console.log("📥 Restoring data...");

  // Order matters for insertion
  const insertOrder = [
    { key: "users", model: "user" },
    { key: "verificationTokens", model: "verificationToken" },
    { key: "courses", model: "course" },
    { key: "courseLecturers", model: "courseLecturer" },
    { key: "modules", model: "module" },
    { key: "lessons", model: "lesson" },
    { key: "lessonResources", model: "lessonResource" },
    { key: "resourceVersions", model: "resourceVersion" },
    { key: "quizzes", model: "quiz" },
    { key: "quizQuestions", model: "quizQuestion" },
    { key: "quizAnswers", model: "quizAnswer" },
    { key: "quizAttempts", model: "quizAttempt" },
    { key: "quizResponses", model: "quizResponse" },
    { key: "courseEnrollments", model: "courseEnrollment" },
    { key: "lessonProgress", model: "lessonProgress" },
    { key: "assignments", model: "assignment" },
    { key: "assignmentSubmissions", model: "assignmentSubmission" },
    {
      key: "assignmentSubmissionAttachments",
      model: "assignmentSubmissionAttachment",
    },
    { key: "submissions", model: "submission" },
    { key: "submissionAttachments", model: "submissionAttachment" },
    { key: "uploadedFiles", model: "uploadedFile" },
    { key: "notifications", model: "notification" },
    { key: "auditLogs", model: "auditLog" },
  ];

  for (const { key, model } of insertOrder) {
    const records = data[key];
    if (!records || records.length === 0) {
      console.log(`   Skipped ${key}: no records`);
      continue;
    }

    try {
      // Handle users specially - exclude relations from the data
      if (key === "users") {
        const usersWithoutRelations = (
          records as Record<string, unknown>[]
        ).map((user) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { accounts, sessions, ...userWithoutRelations } = user;
          return userWithoutRelations;
        });

        // @ts-expect-error - dynamic model access
        await prisma[model].createMany({
          data: usersWithoutRelations,
          skipDuplicates: true,
        });
      } else {
        // @ts-expect-error - dynamic model access
        await prisma[model].createMany({
          data: records,
          skipDuplicates: true,
        });
      }

      console.log(`   Restored ${key}: ${records.length} records`);
    } catch (error) {
      console.error(`   ❌ Failed to restore ${key}:`, error);
      throw error;
    }
  }

  // Restore accounts separately (part of user export but needs separate insert)
  if (data.users) {
    const allAccounts: unknown[] = [];
    for (const user of data.users as Record<string, unknown>[]) {
      if (user.accounts && Array.isArray(user.accounts)) {
        allAccounts.push(...(user.accounts as unknown[]));
      }
    }
    if (allAccounts.length > 0) {
      await prisma.account.createMany({
        // @ts-expect-error - Dynamic data from backup
        data: allAccounts,
        skipDuplicates: true,
      });
      console.log(`   Restored accounts: ${allAccounts.length} records`);
    }
  }

  // Restore sessions separately
  if (data.users) {
    const allSessions: unknown[] = [];
    for (const user of data.users as Record<string, unknown>[]) {
      if (user.sessions && Array.isArray(user.sessions)) {
        allSessions.push(...(user.sessions as unknown[]));
      }
    }
    if (allSessions.length > 0) {
      await prisma.session.createMany({
        // @ts-expect-error - Dynamic data from backup
        data: allSessions,
        skipDuplicates: true,
      });
      console.log(`   Restored sessions: ${allSessions.length} records`);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
