<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# CCA LMS Agent Guide

This file provides repository-wide instructions for AI coding agents working in this codebase. It complements `/Users/sayuru/Documents/GitHub/cca-lms/README.md` and `/Users/sayuru/Documents/GitHub/cca-lms/.github/copilot-instructions.md`.

## Scope

- This file applies to the whole repository.
- If a deeper `AGENTS.md` is added later in a subdirectory, the nearest file should take precedence for that subtree.
- Keep this file high-signal: only repo-wide rules, stable architecture notes, and validation expectations belong here.

## Project Snapshot

- CCA LMS is a production LMS built with Next.js App Router and React 19.
- The system has three roles: `STUDENT`, `LECTURER`, and `ADMIN`.
- Core domains include programmes, modules, lessons, quizzes, assignments, resources, enrollments, analytics, backups, and audit logs.
- The app is server-first: pages and route handlers do most of the work, while client components handle interactivity.

## Stack

- Framework: Next.js `16.2.1`
- UI: React `19.2.4`, Tailwind CSS `4`, Radix UI primitives
- Auth: NextAuth v5 credentials flow in `/Users/sayuru/Documents/GitHub/cca-lms/lib/auth.ts`
- Database: PostgreSQL with Prisma `7` and generated client output in `/Users/sayuru/Documents/GitHub/cca-lms/generated/prisma`
- Storage: Cloudflare R2 for course content, Backblaze B2 for assignment submissions
- Validation and security: Zod, `sanitize-html`, bcrypt, audit logging

## Repository Map

- `/Users/sayuru/Documents/GitHub/cca-lms/app`: App Router pages and API route handlers
- `/Users/sayuru/Documents/GitHub/cca-lms/components`: feature components and reusable UI primitives
- `/Users/sayuru/Documents/GitHub/cca-lms/lib`: auth, Prisma, audit, validation, storage, security, and shared helpers
- `/Users/sayuru/Documents/GitHub/cca-lms/prisma`: schema, migrations, seed, and RLS SQL
- `/Users/sayuru/Documents/GitHub/cca-lms/generated/prisma`: generated Prisma client; do not edit manually
- `/Users/sayuru/Documents/GitHub/cca-lms/proxy.ts`: request interception and auth redirects for protected routes
- `/Users/sayuru/Documents/GitHub/cca-lms/scripts`: operational scripts such as database backup packaging, sanitization verification, and local bulk student imports

## How To Work In This Repo

- Read the nearby implementation before changing code. For a feature change, trace the full flow: page -> client component -> API route -> Prisma/helper/storage.
- Prefer small, localized changes over broad refactors unless the task explicitly asks for a refactor.
- Preserve existing behavior unless the request clearly asks to change it.
- Reuse existing helpers and patterns before introducing new abstractions.
- When you change an API response shape, update every affected client and loading state in the same pass.
- When you change a dashboard, management page, or search/filter flow, inspect both the UI component and its backing route handler.

## Framework Rules

- Use App Router conventions only. Route handlers belong in `app/api/**/route.ts`.
- Prefer React Server Components by default. Add `"use client"` only when browser APIs, local state, refs, or event handlers require it.
- Use `next/navigation`, not `next/router`.
- Do not introduce `middleware.ts`; this repo uses Next.js 16 `proxy.ts`.
- Follow current Next.js 16 request and routing conventions. If touching framework-sensitive code, verify against the installed Next.js docs and current deprecations.
- Use `NextResponse.json()` and explicit HTTP status codes for route handler responses.

## Data, Auth, and Security Rules

- Import Prisma through `/Users/sayuru/Documents/GitHub/cca-lms/lib/prisma.ts` for runtime usage. Do not hand-roll new Prisma clients.
- If `prisma/schema.prisma` changes, regenerate the client with `npm run db:generate`.
- Do not hand-edit files in `/Users/sayuru/Documents/GitHub/cca-lms/generated/prisma`.
- Keep role boundaries intact. `LECTURER` and `ADMIN` capabilities are not interchangeable unless the existing code explicitly allows it.
- Use the auth helpers from `/Users/sayuru/Documents/GitHub/cca-lms/lib/auth.ts` for session and role checks.
- Preserve Cloudflare Turnstile verification behavior around login flows.
- Sanitize user-provided HTML with `/Users/sayuru/Documents/GitHub/cca-lms/lib/sanitize.ts` before storage or rendering.
- Keep audit logging for significant actions using `/Users/sayuru/Documents/GitHub/cca-lms/lib/audit.ts`.
- Keep storage boundaries intact: R2 for course assets and lesson resources, B2 for assignment submission files.

## UI And Frontend Rules

- Prefer existing primitives in `/Users/sayuru/Documents/GitHub/cca-lms/components/ui` before creating new UI building blocks.
- Use Tailwind utility classes and the existing `cn()` helper for class composition.
- Preserve the established visual language unless the task explicitly asks for a redesign.
- Reuse existing shared patterns when relevant:
  - debounced search: `/Users/sayuru/Documents/GitHub/cca-lms/lib/use-debounced-value.ts`
  - global in-page loading state: `/Users/sayuru/Documents/GitHub/cca-lms/components/ui/fetch-activity.tsx`
  - top-right global activity indicator: `/Users/sayuru/Documents/GitHub/cca-lms/components/ui/global-activity-indicator.tsx`

## Coding Conventions

- Language: TypeScript with `strict` mode enabled.
- Use the `@/*` path alias for project-root imports where it improves clarity.
- File names use `kebab-case`.
- React components use `PascalCase`.
- Functions, variables, and hooks use `camelCase`.
- Prefer extending existing feature folders rather than creating parallel structures for the same concern.
- Add comments only where the logic is not obvious from the code itself.

## Validation Expectations

- Primary install and run commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm start`
  - `npm run lint`
  - `npm run students:import -- --help`
- Database commands:
  - `npm run db:generate`
  - `npm run db:push`
  - `npm run db:migrate`
  - `npm run db:seed`
  - `npm run db:setup`
- There is no automated test suite configured in this repository right now. Do not add a test framework unless asked.
- For substantive code changes, the baseline verification is `npm run build`.
- Run `npm run db:generate` after Prisma schema changes and before handing off.
- Treat global lint output cautiously: keep touched files clean where practical, but do not start unrelated repo-wide lint cleanup unless explicitly asked.

## Documentation Rules

- If you change versions, commands, architecture, or cross-cutting workflow expectations, update the relevant docs in the same task.
- Keep `/Users/sayuru/Documents/GitHub/cca-lms/README.md`, `/Users/sayuru/Documents/GitHub/cca-lms/.github/copilot-instructions.md`, and this file aligned when a project-wide fact changes.

## When Unsure

- First inspect adjacent files and existing patterns in the same feature.
- Then inspect shared helpers in `/Users/sayuru/Documents/GitHub/cca-lms/lib` and `/Users/sayuru/Documents/GitHub/cca-lms/components/ui`.
- Only after that, consult the current framework or library documentation for behavior that may have changed.
