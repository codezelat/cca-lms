## 2025-05-15 - Stored XSS in Rich Text/Embeds
**Vulnerability:** `dangerouslySetInnerHTML` was used directly with `embedCode` in `LessonPage` and `ResourceManager` components, allowing execution of malicious scripts injected by privileged users.
**Learning:** Next.js/React's `dangerouslySetInnerHTML` is a sink and must always be paired with sanitization, even for internal/admin content (Defense in Depth).
**Prevention:** Use `isomorphic-dompurify` to sanitize any HTML content before rendering it with `dangerouslySetInnerHTML`.
