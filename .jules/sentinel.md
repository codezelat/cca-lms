## 2024-05-22 - Stored XSS in Lesson Resources
**Vulnerability:** The API routes for creating and updating lesson resources (`/api/admin/resources`) directly stored user-provided HTML (`embedCode`, `textContent`) into the database without sanitization. This allowed Stored XSS attacks via `dangerouslySetInnerHTML` in the frontend.
**Learning:** Even admin-only inputs must be sanitized because accounts can be compromised, and privilege escalation or CSRF could allow attackers to inject malicious scripts that target other users (students).
**Prevention:** Always sanitize HTML input on the server side using a robust library like `isomorphic-dompurify` before storing it in the database. Use strict allow-lists for `iframe` sources.

## 2024-05-22 - Stored XSS in Student Assignment Submissions
**Vulnerability:** The student assignment submission endpoint (`POST /api/student/submissions`) accepted raw HTML in the `content` field without sanitization. This allowed students to inject malicious scripts that would execute when lecturers or admins viewed the submission (Stored XSS).
**Learning:** Student-facing inputs that allow rich text are high-risk vectors for attacking privileged users (lecturers/admins). Input sanitization must be applied at the API boundary before storage.
**Prevention:** Applied `sanitizeHtml` from `@/lib/sanitize` to the `content` field in the submission handler, ensuring all scripts and dangerous attributes are stripped while preserving safe formatting.

## 2024-05-23 - Insecure Password Generation
**Vulnerability:** Admin user creation and password reset endpoints used `Math.random()` to generate temporary passwords. This is cryptographically insecure and predictable, potentially allowing attackers to guess generated passwords if they can observe the state of the RNG.
**Learning:** `Math.random()` should never be used for security-critical values like passwords or tokens.
**Prevention:** Use `crypto.getRandomValues()` (Web Crypto API) for all security-sensitive random value generation. Implemented `generateSecurePassword` helper in `lib/security.ts`.

## 2024-05-24 - Timing Attacks in Authentication Checks
**Vulnerability:** API key and token checks in cron and admin routes (`/api/admin/backups/route.ts`, `/api/cron/db-backup/route.ts`, etc.) were using strict equality (`===`) for comparing authorization secrets. This allows timing attacks where an attacker can theoretically guess the secret byte by byte.
**Learning:** Security-sensitive checks like API key validation must use a constant-time comparison algorithm. The algorithm must also be compatible with Next.js Edge runtimes.
**Prevention:** Created a utility `timingSafeStringCompare` in `lib/security.ts` using a constant-time XOR loop. Replaced `===` with this function across authorization validations.
