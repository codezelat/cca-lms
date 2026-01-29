"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showPageJump?: boolean;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  showPageJump = true,
  className = "",
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const delta = 2; // Show 2 pages before and after current page

    // Always show first page
    if (1 < currentPage - delta) {
      pages.push(1);
      if (2 < currentPage - delta) {
        pages.push("...");
      }
    }

    // Show pages around current page
    for (
      let i = Math.max(1, currentPage - delta);
      i <= Math.min(totalPages, currentPage + delta);
      i++
    ) {
      pages.push(i);
    }

    // Always show last page
    if (totalPages > currentPage + delta) {
      if (totalPages - 1 > currentPage + delta) {
        pages.push("...");
      }
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}
    >
      {/* Results info */}
      <div className="text-sm font-mono text-terminal-text-muted order-2 sm:order-1">
        Showing {startItem} to {endItem} of {totalCount} results
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-2 order-1 sm:order-2">
        {/* Previous button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, index) => (
            <div key={index}>
              {page === "..." ? (
                <div className="px-2 py-1">
                  <MoreHorizontal className="h-4 w-4 text-terminal-text-muted" />
                </div>
              ) : (
                <Button
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(page as number)}
                  className={`min-w-[40px] ${
                    page === currentPage
                      ? "bg-terminal-green text-terminal-dark hover:bg-terminal-green/90"
                      : "hover:bg-terminal-green/10"
                  }`}
                >
                  {page}
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Next button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="gap-1"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Page jump (optional) */}
      {showPageJump && totalPages > 5 && (
        <div className="flex items-center gap-2 order-3 sm:order-3">
          <span className="text-sm font-mono text-terminal-text-muted">
            Go to:
          </span>
          <Input
            type="number"
            min="1"
            max={totalPages}
            value={currentPage}
            onChange={(e) => {
              const page = parseInt(e.target.value);
              if (page >= 1 && page <= totalPages) {
                onPageChange(page);
              }
            }}
            className="w-16 h-8 text-center font-mono"
          />
          <span className="text-sm font-mono text-terminal-text-muted">
            of {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
