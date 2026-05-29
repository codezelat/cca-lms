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

type TurnstileVerificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyTurnstileToken(
  token: string | null | undefined,
): Promise<TurnstileVerificationResult> {
  const isDevelopment =
    (process.env.NODE_ENV || "production") === "development";

  if (isDevelopment && token === "dev-bypass") {
    return { ok: true };
  }

  if (!token) {
    return { ok: false, error: "CAPTCHA verification required" };
  }

  if (!process.env.TURNSTILE_SECRET_KEY) {
    return { ok: false, error: "CAPTCHA verification is not configured" };
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
      },
    );

    if (!response.ok) {
      return { ok: false, error: "CAPTCHA verification failed" };
    }

    const result = (await response.json()) as { success?: boolean };

    if (!result.success) {
      return { ok: false, error: "CAPTCHA verification failed" };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "CAPTCHA verification failed" };
  }
}
