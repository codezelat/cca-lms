# Copilot Instructions for CCA LMS

## Project Overview

CCA LMS (Codezela Career Accelerator Learning Management System) is a production-ready, enterprise-grade LMS built with a terminal-inspired aesthetic. It supports a three-tier content hierarchy (Programmes → Modules → Lessons) and serves three user roles: Students, Lecturers, and Admins.

Key capabilities:
- Multi-format lesson content: video, rich text, quizzes, assignments, PDFs, links
- Interactive assessments: MCQ, true/false, short/long-answer quizzes with auto-grading
- Assignment system with file uploads, grading, and feedback
- Bulk student enrollment via CSV upload
- Real-time progress tracking and analytics
- Audit logging (20+ action types) with IP and user-agent capture
- Email notifications via Resend
- Role-based access control (RBAC): STUDENT, LECTURER, ADMIN

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) with React 19 |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS 4 |
| UI Components | Radix UI primitives wrapped in `components/ui/` |
| Auth | NextAuth v5-beta (JWT, credentials provider, Cloudflare Turnstile CAPTCHA) |
| Database | PostgreSQL 14+ on Supabase with Row-Level Security (RLS) |
| ORM | Prisma v7 (generated client in `generated/prisma/`) |
| File Storage | Cloudflare R2 (course content) + Backblaze B2 (assignment submissions) |
| Email | Resend |
| Validation | Zod |
| Sanitization | sanitize-html (XSS prevention) |
| Deployment | Vercel |

---

## Project Structure

```
cca-lms/
├── app/                    # Next.js App Router
│   ├── (public)/           # Public-facing pages (auth, landing)
│   ├── api/                # REST API routes (~54 endpoints)
│   │   ├── admin/          # Admin operations
│   │   ├── lecturer/       # Lecturer operations
│   │   ├── student/        # Student operations
│   │   ├── auth/           # Authentication endpoints
│   │   ├── quizzes/        # Quiz submissions
│   │   ├── cron/           # Scheduled jobs (backup, reminders)
│   │   ├── audit/          # Audit visit tracking
│   │   └── download/       # Secure file downloads
│   ├── dashboard/          # Main dashboard
│   ├── learn/              # Student learning interface
│   ├── programmes/         # Programme management (admin/lecturer)
│   ├── students/           # Student management
│   └── analytics/          # Admin analytics
├── components/
│   ├── ui/                 # Reusable Radix UI wrappers (button, dialog, input, etc.)
│   └── [feature]/          # Feature-specific components (quizzes, assignments, etc.)
├── lib/                    # Shared utilities
│   ├── auth.ts             # NextAuth configuration
│   ├── prisma.ts           # Prisma client singleton
│   ├── r2.ts               # Cloudflare R2 operations
│   ├── b2.ts               # Backblaze B2 operations
│   ├── audit.ts            # Audit logging helpers
│   ├── resend.ts           # Email service wrapper
│   ├── sanitize.ts         # HTML sanitization
│   ├── security.ts         # Security utilities
│   ├── utils.ts            # General utilities
│   └── validations.ts      # Zod schemas
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── seed.ts             # Database seeding
│   └── migrations/         # Migration history
├── types/
│   └── next-auth.d.ts      # Augmented session/user types
├── middleware.ts            # Auth-based route protection
└── scripts/                # Utility scripts (backup restore, sanitization verify)
```

---

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint (ESLint 9)
npm run lint

# Database – generate Prisma client after schema changes
npm run db:generate

# Database – push schema to database (no migration files)
npm run db:push

# Database – create and run migrations
npm run db:migrate

# Database – open Prisma Studio GUI
npm run db:studio

# Database – seed with initial data
npm run db:seed

# Database – full setup (push + seed)
npm run db:setup
```

---

## Coding Conventions

### TypeScript
- Strict mode is enabled (`"strict": true` in `tsconfig.json`).
- Use the `@/*` path alias for absolute imports (resolves to repo root).
- Augment NextAuth types in `types/next-auth.d.ts` when adding fields to the session or user objects.

### React / Next.js
- Prefer **React Server Components** by default; add `"use client"` only when browser APIs or interactivity is required.
- API routes live in `app/api/` and export named HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`).
- Use `NextResponse.json()` for API responses with appropriate HTTP status codes.

### Naming
- Files: `kebab-case` (e.g., `auth-provider.tsx`, `programme-content-client.tsx`)
- React components: `PascalCase`
- Functions and variables: `camelCase`
- Environment variables and constants: `UPPER_SNAKE_CASE`

### Styling
- Use Tailwind CSS utility classes exclusively.
- Use `cn()` from `lib/utils.ts` (or the dedicated `lib/cn.ts` alias) — both are powered by `clsx` + `tailwind-merge` — to conditionally compose class names.
- UI component primitives are in `components/ui/`; prefer extending these over creating new ones.

### Validation
- Define all input schemas with **Zod** in `lib/validations.ts` or co-located where appropriate.
- Validate at **both** the API route level and the client-side form level.
- Video lessons require a mandatory `videoUrl` field validated via a Zod refinement.

### Sanitization
- Run user-generated HTML through `sanitize-html` (see `lib/sanitize.ts`) before persisting or rendering to prevent XSS.

### Database
- All IDs use **CUID** format.
- Timestamps use `createdAt` / `updatedAt` with auto-defaults.
- Relations use explicit foreign keys with `onDelete: Cascade` where appropriate.
- After any schema change, run `npm run db:generate` to regenerate the Prisma client.

### Authentication & Authorization
- Protect pages via `middleware.ts` (checks session role).
- Use the `auth()` helper from `lib/auth.ts` inside API routes to get the current session.
- Roles are `STUDENT`, `LECTURER`, `ADMIN` (defined in the `UserRole` enum in `prisma/schema.prisma`).

### Audit Logging
- Call `createAuditLog()` from `lib/audit.ts` for all significant user actions.
- Include the action type (from the `AuditAction` enum), user ID, and relevant metadata.

### Error Handling
- Return structured JSON error responses from API routes: `{ error: "message" }` with the appropriate HTTP status.
- Catch Prisma errors and map them to meaningful HTTP status codes (e.g., unique constraint → 409).

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values. Key variables:

```env
# Database (Supabase Postgres)
DATABASE_URL=             # Pooler connection string
DIRECT_DATABASE_URL=      # Direct connection (used by Prisma migrations)

# NextAuth
NEXTAUTH_SECRET=          # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Cloudflare R2 (course file storage)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# Backblaze B2 (assignment submission storage)
B2_APPLICATION_KEY_ID=
B2_APPLICATION_KEY=
B2_BUCKET_ID=
B2_BUCKET_NAME=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Security
CRON_SECRET=
CLOUDFLARE_TURNSTILE_SECRET=
```

---

## Key Architectural Decisions

- **Server-first**: Next.js Server Components and API routes handle all data fetching and mutations; client components are limited to interactive UI.
- **Security-first**: Passwords hashed with bcryptjs; all HTML input sanitized; Zod validation at every boundary; Cloudflare Turnstile on login; Row-Level Security in PostgreSQL.
- **Storage split**: Course assets go to Cloudflare R2 (fast CDN delivery); assignment submissions go to Backblaze B2 (cost-effective, student-uploaded content).
- **Prisma Postgres adapter**: Uses the native Prisma Postgres adapter for optimal query performance with Supabase.
- **No test framework currently configured**: There is no existing test suite; do not add tests unless explicitly requested.
