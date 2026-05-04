// Re-export sanitizeHtml from the main sanitize module
// This file is kept for backward compatibility
export { sanitizeHtml } from "./sanitize";

/**
 * Generates a cryptographically secure random password.
 *
 * Uses crypto.getRandomValues (Web Crypto API) which is available in
 * Node.js (global) and Edge runtimes.
 *
 * @param length Length of the random part of the password (default: 24)
 * @returns A secure password string containing mixed case alphanumeric characters plus "!@#"
 */
export function generateSecurePassword(length: number = 24): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[values[i] % charset.length];
  }

  return password + "!@#";
}

/**
 * Safely compares two strings using a constant-time algorithm to prevent timing attacks.
 * Designed to be compatible with Edge runtimes (no Node crypto module).
 *
 * @param a First string to compare
 * @param b Second string to compare
 * @returns boolean true if strings match, false otherwise
 */
export function timingSafeStringCompare(a: string, b: string): boolean {
  const aStr = a || "";
  const bStr = b || "";

  // Fold length difference into result to avoid early return
  let result = aStr.length ^ bStr.length;

  // Iterate to the maximum length, using 0 for out-of-range indices
  const maxLength = Math.max(aStr.length, bStr.length);
  for (let i = 0; i < maxLength; i++) {
    const aChar = aStr.charCodeAt(i) || 0;
    const bChar = bStr.charCodeAt(i) || 0;
    result |= aChar ^ bChar;
  }

  return result === 0;
}
