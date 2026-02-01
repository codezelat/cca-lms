"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  AlertCircle,
  Package,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface Submission {
  id: string;
  submittedAt: string;
  grade: number | null;
  user?: { id: string; name: string | null; email: string };
  attachments?: {
    id: string;
    fileKey: string;
    fileName: string;
    fileSize?: number;
  }[];
}

interface BulkActionsProps {
  assignmentId: string;
  assignmentTitle: string;
  dueDate: string;
  maxPoints: number;
  submissions: Submission[];
}

interface DownloadProgress {
  phase: "preparing" | "downloading" | "zipping" | "complete" | "error";
  currentBatch: number;
  totalBatches: number;
  filesDownloaded: number;
  totalFiles: number;
  currentFileName?: string;
  zipProgress?: number;
  errorMessage?: string;
}

export function BulkSubmissionActions({
  assignmentId,
  assignmentTitle,
  dueDate,
  maxPoints,
  submissions,
}: BulkActionsProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // Export submissions to XLSX with full details and file links
  const exportToExcel = useCallback(async () => {
    if (!submissions.length) {
      toast.error("No submissions to export");
      return;
    }

    setIsExporting(true);
    try {
      const dueDateObj = new Date(dueDate);
      const baseUrl = window.location.origin;

      // Create workbook
      const wb = XLSX.utils.book_new();

      // ============================================
      // SHEET 1: All Submissions with Full Details
      // ============================================
      const submissionsData: (string | number | null)[][] = [
        [
          "#",
          "Student Name",
          "Email",
          "Student ID",
          "Submission ID",
          "Submitted At",
          "Status",
          "Grade",
          "Max Points",
          "Percentage",
          "Files Count",
          "File 1 Name",
          "File 1 Size (KB)",
          "File 1 Download Link",
          "File 2 Name",
          "File 2 Size (KB)",
          "File 2 Download Link",
          "File 3 Name",
          "File 3 Size (KB)",
          "File 3 Download Link",
        ],
      ];

      submissions.forEach((sub, index) => {
        const submittedDate = new Date(sub.submittedAt);
        const isLate = submittedDate > dueDateObj;
        const percentage =
          sub.grade !== null ? ((sub.grade / maxPoints) * 100).toFixed(1) : "";

        const row: (string | number | null)[] = [
          index + 1,
          sub.user?.name || "Unknown",
          sub.user?.email || "N/A",
          sub.user?.id || "",
          sub.id,
          submittedDate.toISOString(),
          isLate ? "Late" : "On Time",
          sub.grade,
          maxPoints,
          percentage ? `${percentage}%` : "Not Graded",
          sub.attachments?.length || 0,
        ];

        // Add up to 3 file columns (can extend if needed)
        for (let i = 0; i < 3; i++) {
          const attachment = sub.attachments?.[i];
          if (attachment) {
            row.push(attachment.fileName);
            row.push(
              attachment.fileSize
                ? Math.round(attachment.fileSize / 1024)
                : null,
            );
            // Download link through our authenticated proxy
            row.push(`${baseUrl}/api/download/${attachment.fileKey}`);
          } else {
            row.push("", null, "");
          }
        }

        submissionsData.push(row);
      });

      const submissionsWs = XLSX.utils.aoa_to_sheet(submissionsData);

      // Set column widths
      submissionsWs["!cols"] = [
        { wch: 5 }, // #
        { wch: 25 }, // Student Name
        { wch: 30 }, // Email
        { wch: 28 }, // Student ID
        { wch: 28 }, // Submission ID
        { wch: 22 }, // Submitted At
        { wch: 10 }, // Status
        { wch: 8 }, // Grade
        { wch: 10 }, // Max Points
        { wch: 12 }, // Percentage
        { wch: 12 }, // Files Count
        { wch: 30 }, // File 1 Name
        { wch: 12 }, // File 1 Size
        { wch: 60 }, // File 1 Link
        { wch: 30 }, // File 2 Name
        { wch: 12 }, // File 2 Size
        { wch: 60 }, // File 2 Link
        { wch: 30 }, // File 3 Name
        { wch: 12 }, // File 3 Size
        { wch: 60 }, // File 3 Link
      ];

      // Add hyperlinks to download columns
      submissions.forEach((sub, index) => {
        const rowNum = index + 2; // +2 for header row and 1-based index
        sub.attachments?.slice(0, 3).forEach((attachment, fileIndex) => {
          const colIndex = 13 + fileIndex * 3; // File link columns: N, Q, T (13, 16, 19)
          const cellRef = XLSX.utils.encode_cell({
            r: rowNum - 1,
            c: colIndex,
          });
          if (submissionsWs[cellRef]) {
            submissionsWs[cellRef].l = {
              Target: `${baseUrl}/api/download/${attachment.fileKey}`,
              Tooltip: `Download ${attachment.fileName}`,
            };
          }
        });
      });

      XLSX.utils.book_append_sheet(wb, submissionsWs, "Submissions");

      // ============================================
      // SHEET 2: Files List (All files in one sheet)
      // ============================================
      const filesData: (string | number | null)[][] = [
        [
          "#",
          "Student Name",
          "Email",
          "File Name",
          "File Size (KB)",
          "Submitted At",
          "Download Link",
        ],
      ];

      let fileIndex = 1;
      submissions.forEach((sub) => {
        sub.attachments?.forEach((attachment) => {
          filesData.push([
            fileIndex++,
            sub.user?.name || "Unknown",
            sub.user?.email || "N/A",
            attachment.fileName,
            attachment.fileSize ? Math.round(attachment.fileSize / 1024) : null,
            new Date(sub.submittedAt).toISOString(),
            `${baseUrl}/api/download/${attachment.fileKey}`,
          ]);
        });
      });

      const filesWs = XLSX.utils.aoa_to_sheet(filesData);
      filesWs["!cols"] = [
        { wch: 5 },
        { wch: 25 },
        { wch: 30 },
        { wch: 40 },
        { wch: 12 },
        { wch: 22 },
        { wch: 70 },
      ];

      // Add hyperlinks to file download column
      for (let i = 1; i < filesData.length; i++) {
        const cellRef = XLSX.utils.encode_cell({ r: i, c: 6 }); // Column G (index 6)
        if (filesWs[cellRef] && filesData[i][6]) {
          filesWs[cellRef].l = {
            Target: filesData[i][6] as string,
            Tooltip: `Download ${filesData[i][3]}`,
          };
        }
      }

      XLSX.utils.book_append_sheet(wb, filesWs, "All Files");

      // ============================================
      // SHEET 3: Summary Report (at the end)
      // ============================================
      const gradedSubmissions = submissions.filter((s) => s.grade !== null);
      const grades = gradedSubmissions.map((s) => s.grade as number);
      const avgGrade =
        grades.length > 0
          ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2)
          : "N/A";
      const highestGrade = grades.length > 0 ? Math.max(...grades) : "N/A";
      const lowestGrade = grades.length > 0 ? Math.min(...grades) : "N/A";

      const summaryData = [
        ["ASSIGNMENT SUBMISSIONS REPORT"],
        [""],
        ["ASSIGNMENT DETAILS"],
        ["Assignment Title", assignmentTitle],
        ["Assignment ID", assignmentId],
        ["Due Date", new Date(dueDate).toLocaleString()],
        ["Maximum Points", maxPoints],
        [""],
        ["SUBMISSION STATISTICS"],
        ["Total Submissions", submissions.length],
        ["Graded Submissions", gradedSubmissions.length],
        ["Pending Grading", submissions.length - gradedSubmissions.length],
        [
          "Late Submissions",
          submissions.filter((s) => new Date(s.submittedAt) > dueDateObj)
            .length,
        ],
        [
          "On-Time Submissions",
          submissions.filter((s) => new Date(s.submittedAt) <= dueDateObj)
            .length,
        ],
        [""],
        ["GRADE STATISTICS"],
        ["Average Grade", avgGrade],
        ["Highest Grade", highestGrade],
        ["Lowest Grade", lowestGrade],
        [
          "Pass Rate (≥50%)",
          grades.length > 0
            ? `${((grades.filter((g) => g >= maxPoints * 0.5).length / grades.length) * 100).toFixed(1)}%`
            : "N/A",
        ],
        [""],
        ["FILE STATISTICS"],
        [
          "Total Files Submitted",
          submissions.reduce((acc, s) => acc + (s.attachments?.length || 0), 0),
        ],
        [
          "Average Files per Submission",
          (
            submissions.reduce(
              (acc, s) => acc + (s.attachments?.length || 0),
              0,
            ) / submissions.length
          ).toFixed(1),
        ],
        [""],
        ["REPORT INFORMATION"],
        ["Generated At", new Date().toLocaleString()],
        ["Generated By", "CCA LMS System"],
        [
          "Note",
          "Download links require admin/lecturer authentication to access.",
        ],
      ];

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      summaryWs["!cols"] = [{ wch: 25 }, { wch: 50 }];

      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary Report");

      // Generate and download
      const fileName = `${assignmentTitle.replace(/[^a-z0-9]/gi, "_")}_submissions_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success("Export Complete", {
        description: `Downloaded ${fileName}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Export Failed", {
        description: "Could not generate Excel file",
      });
    } finally {
      setIsExporting(false);
    }
  }, [submissions, assignmentTitle, dueDate, maxPoints]);

  // Cancel ongoing download
  const cancelDownload = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setDownloadProgress(null);
    toast.info("Download cancelled");
  }, [abortController]);

  // Download all files as ZIP (batched)
  const downloadAllFiles = useCallback(async () => {
    const totalFiles = submissions.reduce(
      (acc, sub) => acc + (sub.attachments?.length || 0),
      0,
    );

    if (totalFiles === 0) {
      toast.error("No files to download");
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);

    setDownloadProgress({
      phase: "preparing",
      currentBatch: 0,
      totalBatches: 0,
      filesDownloaded: 0,
      totalFiles,
    });

    try {
      const zip = new JSZip();
      const BATCH_SIZE = 5; // Files per batch to avoid overwhelming
      let filesDownloaded = 0;
      let currentBatch = 0;

      // Get first batch to know total batches
      const firstResponse = await fetch(
        `/api/admin/assignments/${assignmentId}/bulk-download?batch=0&batchSize=${BATCH_SIZE}`,
        { signal: controller.signal },
      );

      if (!firstResponse.ok) {
        throw new Error("Failed to prepare download");
      }

      const firstData = await firstResponse.json();
      const totalBatches = firstData.batch.total;

      setDownloadProgress((prev) => ({
        ...prev!,
        phase: "downloading",
        totalBatches,
      }));

      // Process all batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        if (controller.signal.aborted) break;

        currentBatch = batchIndex;

        // Fetch batch (skip first if already fetched)
        const batchData =
          batchIndex === 0
            ? firstData
            : await fetch(
                `/api/admin/assignments/${assignmentId}/bulk-download?batch=${batchIndex}&batchSize=${BATCH_SIZE}`,
                { signal: controller.signal },
              ).then((r) => r.json());

        // Download files in this batch
        for (const file of batchData.files) {
          if (controller.signal.aborted) break;

          setDownloadProgress((prev) => ({
            ...prev!,
            currentBatch,
            currentFileName: file.fileName,
          }));

          try {
            // Download file content via our proxy endpoint
            // fileKey is like "submissions/timestamp-file.pdf" - don't encode the slash
            const fileResponse = await fetch(`/api/download/${file.fileKey}`, {
              signal: controller.signal,
            });
            if (!fileResponse.ok) {
              console.warn(`Failed to download: ${file.fileName}`);
              continue;
            }

            const blob = await fileResponse.blob();

            // Organize by student: StudentName_Email/filename
            const studentFolder = `${file.studentName.replace(/[^a-z0-9]/gi, "_")}_${file.studentEmail.split("@")[0]}`;
            zip.file(`${studentFolder}/${file.fileName}`, blob);

            filesDownloaded++;
            setDownloadProgress((prev) => ({
              ...prev!,
              filesDownloaded,
            }));
          } catch (fileError) {
            if ((fileError as Error).name === "AbortError") throw fileError;
            console.warn(`Error downloading ${file.fileName}:`, fileError);
          }
        }

        // Small delay between batches to prevent overwhelming
        if (batchIndex < totalBatches - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (controller.signal.aborted) return;

      // Generate ZIP
      setDownloadProgress((prev) => ({
        ...prev!,
        phase: "zipping",
        zipProgress: 0,
      }));

      const zipBlob = await zip.generateAsync(
        {
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        },
        (metadata) => {
          setDownloadProgress((prev) => ({
            ...prev!,
            zipProgress: Math.round(metadata.percent),
          }));
        },
      );

      // Download ZIP
      const zipFileName = `${assignmentTitle.replace(/[^a-z0-9]/gi, "_")}_submissions_${new Date().toISOString().split("T")[0]}.zip`;
      saveAs(zipBlob, zipFileName);

      setDownloadProgress({
        phase: "complete",
        currentBatch: totalBatches,
        totalBatches,
        filesDownloaded,
        totalFiles,
      });

      toast.success("Download Complete", {
        description: `Downloaded ${filesDownloaded} files as ${zipFileName}`,
      });

      // Clear progress after a delay
      setTimeout(() => setDownloadProgress(null), 3000);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return; // User cancelled
      }
      console.error("Bulk download error:", error);
      setDownloadProgress((prev) => ({
        ...prev!,
        phase: "error",
        errorMessage:
          error instanceof Error ? error.message : "Download failed",
      }));
      toast.error("Download Failed", {
        description: "Could not download all files. Please try again.",
      });
    } finally {
      setAbortController(null);
    }
  }, [assignmentId, assignmentTitle, submissions]);

  const totalFiles = submissions.reduce(
    (acc, sub) => acc + (sub.attachments?.length || 0),
    0,
  );

  return (
    <div className="space-y-3">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={exportToExcel}
          disabled={isExporting || !!downloadProgress}
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 mr-2" />
          )}
          Export to Excel
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={downloadAllFiles}
          disabled={totalFiles === 0 || !!downloadProgress}
        >
          <Package className="h-4 w-4 mr-2" />
          Download All Files ({totalFiles})
        </Button>
      </div>

      {/* Download Progress */}
      {downloadProgress && (
        <Card className="p-4 bg-terminal-darker">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {downloadProgress.phase === "complete" ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : downloadProgress.phase === "error" ? (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-terminal-accent" />
                )}
                <span className="font-medium">
                  {downloadProgress.phase === "preparing" &&
                    "Preparing download..."}
                  {downloadProgress.phase === "downloading" &&
                    "Downloading files..."}
                  {downloadProgress.phase === "zipping" &&
                    "Creating ZIP archive..."}
                  {downloadProgress.phase === "complete" &&
                    "Download complete!"}
                  {downloadProgress.phase === "error" && "Download failed"}
                </span>
              </div>
              {downloadProgress.phase !== "complete" &&
                downloadProgress.phase !== "error" && (
                  <Button size="sm" variant="ghost" onClick={cancelDownload}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
            </div>

            {downloadProgress.phase === "downloading" && (
              <>
                <Progress
                  value={
                    (downloadProgress.filesDownloaded /
                      downloadProgress.totalFiles) *
                    100
                  }
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-terminal-text-muted">
                  <span>
                    {downloadProgress.filesDownloaded} /{" "}
                    {downloadProgress.totalFiles} files
                  </span>
                  <span>
                    Batch {downloadProgress.currentBatch + 1} /{" "}
                    {downloadProgress.totalBatches}
                  </span>
                </div>
                {downloadProgress.currentFileName && (
                  <p className="text-xs text-terminal-text-muted truncate">
                    Downloading: {downloadProgress.currentFileName}
                  </p>
                )}
              </>
            )}

            {downloadProgress.phase === "zipping" && (
              <>
                <Progress
                  value={downloadProgress.zipProgress || 0}
                  className="h-2"
                />
                <p className="text-xs text-terminal-text-muted">
                  Compressing... {downloadProgress.zipProgress}%
                </p>
              </>
            )}

            {downloadProgress.phase === "error" &&
              downloadProgress.errorMessage && (
                <p className="text-xs text-red-400">
                  {downloadProgress.errorMessage}
                </p>
              )}
          </div>
        </Card>
      )}
    </div>
  );
}
