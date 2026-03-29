"use client";

import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFetchActivity } from "@/components/ui/fetch-activity";

export function GlobalActivityIndicator() {
  const { isVisible, pendingCount } = useFetchActivity();

  return (
    <div className="flex w-10 sm:w-32 justify-end">
      <div
        role="status"
        aria-live="polite"
        aria-hidden={!isVisible}
        className={cn(
          "pointer-events-none flex h-9 items-center gap-2 rounded-md border border-terminal-green/20 bg-terminal-darker/85 px-3 font-mono text-xs text-terminal-text-muted shadow-[0_0_18px_rgba(34,197,94,0.12)] backdrop-blur-sm transition-all duration-200",
          isVisible
            ? "translate-y-0 opacity-100"
            : "translate-y-1 opacity-0",
        )}
      >
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-terminal-green" />
        <span className="hidden whitespace-nowrap sm:inline">
          {pendingCount > 1 ? `${pendingCount} tasks` : "Working"}
        </span>
        <span className="sr-only">
          {pendingCount > 1
            ? `${pendingCount} requests in progress`
            : "Request in progress"}
        </span>
      </div>
    </div>
  );
}
