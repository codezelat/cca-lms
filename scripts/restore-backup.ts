/**
 * Database Restore Script
 *
 * Usage:
 *   npx ts-node scripts/restore-backup.ts <path-to-backup-json>
 *   npx ts-node scripts/restore-backup.ts ./backup-2026-02-02.json
 *
 * Options:
 *   --dry-run    Show what would be restored without making changes
 *   --force      Skip confirmation prompt
 *
 * WARNING: This will REPLACE all data in the database!
 * Make sure to create a backup before restoring.
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
