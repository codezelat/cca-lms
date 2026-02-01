import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get current time for DISPLAY in Sri Lanka timezone (UTC+5:30)
 * Only use this for UI display, NOT for date comparisons!
 */
export function getServerTime(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }),
  );
}

/**
 * Check if a deadline has passed (comparing in UTC)
 * Dates are stored and compared in UTC
 */
export function isDeadlinePassed(deadline: Date): boolean {
  const now = new Date();
  return deadline.getTime() < now.getTime();
}

/**
 * Format date for Sri Lankan timezone display
 */
export function formatServerDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleString("en-US", {
    timeZone: "Asia/Colombo",
    ...options,
  });
}
