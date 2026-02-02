import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { gzipSync } from "zlib";
import { prisma } from "./prisma";

// ============================================================================
// Configuration
// ============================================================================

const BACKUP_RETENTION_DAYS = 14;
const BACKUP_PREFIX = "backups/";
const BUCKET_NAME = process.env.R2_BUCKET_NAME || "cca-lms-uploads";

// ============================================================================
// R2 Client for Backups
// ============================================================================

function getBackupR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 credentials for backup. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }

  return new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// ============================================================================
// Types
// ============================================================================

export interface BackupResult {
  success: boolean;
  key?: string;
  size?: number;
  tablesBackedUp?: number;
  totalRecords?: number;
  duration?: number;
  error?: string;
}

export interface CleanupResult {
  success: boolean;
  deletedCount?: number;
  deletedKeys?: string[];
  error?: string;
}

export interface BackupMetadata {
  version: string;
  createdAt: string;
  environment: string;
  tables: {
    name: string;
    count: number;
  }[];
  totalRecords: number;
  checksum: string;
}

// ============================================================================
// Table Export Functions
// ============================================================================

/**
 * Export all database tables with their data
 * Ordered to respect foreign key dependencies for restoration
 */
async function exportAllTables(): Promise<{
  data: Record<string, unknown[]>;
  metadata: BackupMetadata;
}> {
  const startTime = Date.now();
  const tables: { name: string; count: number }[] = [];
  const data: Record<string, unknown[]> = {};

  // Export tables in order (respecting FK dependencies)
  // 1. Independent tables first
  console.log("[Backup] Exporting User table...");
  data.users = await prisma.user.findMany({
    include: {
      accounts: true,
      sessions: true,
    },
  });
  tables.push({ name: "users", count: data.users.length });

  console.log("[Backup] Exporting VerificationToken table...");
  data.verificationTokens = await prisma.verificationToken.findMany();
  tables.push({
    name: "verificationTokens",
    count: data.verificationTokens.length,
  });

  // 2. Course-related tables
  console.log("[Backup] Exporting Course table...");
  data.courses = await prisma.course.findMany();
  tables.push({ name: "courses", count: data.courses.length });

  console.log("[Backup] Exporting CourseLecturer table...");
  data.courseLecturers = await prisma.courseLecturer.findMany();
  tables.push({ name: "courseLecturers", count: data.courseLecturers.length });

  console.log("[Backup] Exporting Module table...");
  data.modules = await prisma.module.findMany();
  tables.push({ name: "modules", count: data.modules.length });

  console.log("[Backup] Exporting Lesson table...");
  data.lessons = await prisma.lesson.findMany();
  tables.push({ name: "lessons", count: data.lessons.length });

  // 3. Lesson content tables
  console.log("[Backup] Exporting LessonResource table...");
  data.lessonResources = await prisma.lessonResource.findMany();
  tables.push({ name: "lessonResources", count: data.lessonResources.length });

  console.log("[Backup] Exporting ResourceVersion table...");
  data.resourceVersions = await prisma.resourceVersion.findMany();
  tables.push({
    name: "resourceVersions",
    count: data.resourceVersions.length,
  });

  // 4. Quiz tables
  console.log("[Backup] Exporting Quiz table...");
  data.quizzes = await prisma.quiz.findMany();
  tables.push({ name: "quizzes", count: data.quizzes.length });

  console.log("[Backup] Exporting QuizQuestion table...");
  data.quizQuestions = await prisma.quizQuestion.findMany();
  tables.push({ name: "quizQuestions", count: data.quizQuestions.length });

  console.log("[Backup] Exporting QuizAnswer table...");
  data.quizAnswers = await prisma.quizAnswer.findMany();
  tables.push({ name: "quizAnswers", count: data.quizAnswers.length });

  console.log("[Backup] Exporting QuizAttempt table...");
  data.quizAttempts = await prisma.quizAttempt.findMany();
  tables.push({ name: "quizAttempts", count: data.quizAttempts.length });

  console.log("[Backup] Exporting QuizResponse table...");
  data.quizResponses = await prisma.quizResponse.findMany();
  tables.push({ name: "quizResponses", count: data.quizResponses.length });

  // 5. Enrollment & Progress tables
  console.log("[Backup] Exporting CourseEnrollment table...");
  data.courseEnrollments = await prisma.courseEnrollment.findMany();
  tables.push({
    name: "courseEnrollments",
    count: data.courseEnrollments.length,
  });

  console.log("[Backup] Exporting LessonProgress table...");
  data.lessonProgress = await prisma.lessonProgress.findMany();
  tables.push({ name: "lessonProgress", count: data.lessonProgress.length });

  // 6. Assignment tables
  console.log("[Backup] Exporting Assignment table...");
  data.assignments = await prisma.assignment.findMany();
  tables.push({ name: "assignments", count: data.assignments.length });

  console.log("[Backup] Exporting AssignmentSubmission table...");
  data.assignmentSubmissions = await prisma.assignmentSubmission.findMany();
  tables.push({
    name: "assignmentSubmissions",
    count: data.assignmentSubmissions.length,
  });

  console.log("[Backup] Exporting AssignmentSubmissionAttachment table...");
  data.assignmentSubmissionAttachments =
    await prisma.assignmentSubmissionAttachment.findMany();
  tables.push({
    name: "assignmentSubmissionAttachments",
    count: data.assignmentSubmissionAttachments.length,
  });

  // 7. Legacy Submission tables
  console.log("[Backup] Exporting Submission table...");
  data.submissions = await prisma.submission.findMany();
  tables.push({ name: "submissions", count: data.submissions.length });

  console.log("[Backup] Exporting SubmissionAttachment table...");
  data.submissionAttachments = await prisma.submissionAttachment.findMany();
  tables.push({
    name: "submissionAttachments",
    count: data.submissionAttachments.length,
  });

  // 8. File storage table
  console.log("[Backup] Exporting UploadedFile table...");
  data.uploadedFiles = await prisma.uploadedFile.findMany();
  tables.push({ name: "uploadedFiles", count: data.uploadedFiles.length });

  // 9. Notification table
  console.log("[Backup] Exporting Notification table...");
  data.notifications = await prisma.notification.findMany();
  tables.push({ name: "notifications", count: data.notifications.length });

  // 10. Audit log table
  console.log("[Backup] Exporting AuditLog table...");
  data.auditLogs = await prisma.auditLog.findMany();
  tables.push({ name: "auditLogs", count: data.auditLogs.length });

  const totalRecords = tables.reduce((sum, t) => sum + t.count, 0);
  const duration = Date.now() - startTime;

  console.log(
    `[Backup] Export complete: ${totalRecords} records from ${tables.length} tables in ${duration}ms`,
  );

  // Generate checksum from data
  const dataString = JSON.stringify(data);
  const checksum = generateChecksum(dataString);

  const metadata: BackupMetadata = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    tables,
    totalRecords,
    checksum,
  };

  return { data, metadata };
}

/**
 * Generate a simple checksum for data integrity
 */
function generateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// ============================================================================
// Backup Functions
// ============================================================================

/**
 * Create a full database backup and upload to R2
 */
export async function createBackup(): Promise<BackupResult> {
  const startTime = Date.now();

  try {
    console.log("[Backup] Starting full database backup...");

    // Export all tables
    const { data, metadata } = await exportAllTables();

    // Create backup payload
    const backupPayload = {
      metadata,
      data,
    };

    // Convert to JSON and compress
    const jsonString = JSON.stringify(backupPayload, null, 0); // No formatting for smaller size
    console.log(
      `[Backup] Uncompressed size: ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`,
    );

    const compressed = gzipSync(Buffer.from(jsonString, "utf-8"), { level: 9 });
    console.log(
      `[Backup] Compressed size: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`,
    );

    // Generate backup filename with timestamp
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const timeStr = now
      .toISOString()
      .split("T")[1]
      .slice(0, 8)
      .replace(/:/g, "-"); // HH-MM-SS
    const backupKey = `${BACKUP_PREFIX}${dateStr}/${dateStr}_${timeStr}_full.json.gz`;

    // Upload to R2
    console.log(`[Backup] Uploading to R2: ${backupKey}`);
    const client = getBackupR2Client();

    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: backupKey,
        Body: compressed,
        ContentType: "application/gzip",
        ContentEncoding: "gzip",
        Metadata: {
          "backup-version": metadata.version,
          "backup-date": metadata.createdAt,
          "total-records": metadata.totalRecords.toString(),
          checksum: metadata.checksum,
        },
      }),
    );

    const duration = Date.now() - startTime;
    console.log(`[Backup] Backup complete in ${duration}ms`);

    return {
      success: true,
      key: backupKey,
      size: compressed.length,
      tablesBackedUp: metadata.tables.length,
      totalRecords: metadata.totalRecords,
      duration,
    };
  } catch (error) {
    console.error("[Backup] Backup failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Delete backups older than retention period
 */
export async function cleanupOldBackups(): Promise<CleanupResult> {
  try {
    console.log(
      `[Backup] Cleaning up backups older than ${BACKUP_RETENTION_DAYS} days...`,
    );

    const client = getBackupR2Client();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - BACKUP_RETENTION_DAYS);

    // List all backup objects
    const listResponse = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: BACKUP_PREFIX,
      }),
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log("[Backup] No backups found to clean up");
      return { success: true, deletedCount: 0, deletedKeys: [] };
    }

    // Find objects older than cutoff date
    const keysToDelete: string[] = [];
    for (const obj of listResponse.Contents) {
      if (obj.Key && obj.LastModified && obj.LastModified < cutoffDate) {
        keysToDelete.push(obj.Key);
      }
    }

    if (keysToDelete.length === 0) {
      console.log("[Backup] No old backups to delete");
      return { success: true, deletedCount: 0, deletedKeys: [] };
    }

    console.log(`[Backup] Deleting ${keysToDelete.length} old backup(s)...`);

    // Delete old backups (R2 supports batch delete up to 1000 objects)
    await client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: keysToDelete.map((Key) => ({ Key })),
        },
      }),
    );

    console.log(`[Backup] Deleted ${keysToDelete.length} old backup(s)`);

    return {
      success: true,
      deletedCount: keysToDelete.length,
      deletedKeys: keysToDelete,
    };
  } catch (error) {
    console.error("[Backup] Cleanup failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// List Backups Function
// ============================================================================

export interface BackupInfo {
  key: string;
  size: number;
  lastModified: Date;
  metadata?: Record<string, string>;
}

/**
 * List all available backups
 */
export async function listBackups(): Promise<BackupInfo[]> {
  try {
    const client = getBackupR2Client();

    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: BACKUP_PREFIX,
      }),
    );

    if (!response.Contents) {
      return [];
    }

    return response.Contents.filter(
      (obj) => obj.Key && obj.Size && obj.LastModified,
    )
      .map((obj) => ({
        key: obj.Key!,
        size: obj.Size!,
        lastModified: obj.LastModified!,
      }))
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  } catch (error) {
    console.error("[Backup] Failed to list backups:", error);
    throw error;
  }
}

// ============================================================================
// Backup Statistics
// ============================================================================

export interface BackupStats {
  totalBackups: number;
  totalSize: number;
  oldestBackup?: Date;
  newestBackup?: Date;
  backupsByDate: Record<string, number>;
}

/**
 * Get backup statistics
 */
export async function getBackupStats(): Promise<BackupStats> {
  const backups = await listBackups();

  const stats: BackupStats = {
    totalBackups: backups.length,
    totalSize: backups.reduce((sum, b) => sum + b.size, 0),
    backupsByDate: {},
  };

  if (backups.length > 0) {
    stats.newestBackup = backups[0].lastModified;
    stats.oldestBackup = backups[backups.length - 1].lastModified;

    for (const backup of backups) {
      const dateKey = backup.lastModified.toISOString().split("T")[0];
      stats.backupsByDate[dateKey] = (stats.backupsByDate[dateKey] || 0) + 1;
    }
  }

  return stats;
}

// ============================================================================
// Full Backup Job (Create + Cleanup)
// ============================================================================

export interface BackupJobResult {
  backup: BackupResult;
  cleanup: CleanupResult;
  totalDuration: number;
}

/**
 * Run full backup job: create backup and cleanup old ones
 */
export async function runBackupJob(): Promise<BackupJobResult> {
  const startTime = Date.now();

  console.log("[Backup Job] Starting backup job...");

  // Create new backup
  const backupResult = await createBackup();

  // Cleanup old backups
  const cleanupResult = await cleanupOldBackups();

  const totalDuration = Date.now() - startTime;
  console.log(`[Backup Job] Job complete in ${totalDuration}ms`);

  return {
    backup: backupResult,
    cleanup: cleanupResult,
    totalDuration,
  };
}
