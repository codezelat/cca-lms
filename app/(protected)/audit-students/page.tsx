import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import StudentAuditPage from "@/components/audit/student-audit-page";
import { Metadata } from "next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student Audit",
  description: "Audit student activity, progress, and logins",
};

export default async function AuditStudentsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-terminal-dark flex items-center justify-center p-4">
          <div className="h-6 w-6 border-2 border-terminal-green border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <StudentAuditPage />
    </Suspense>
  );
}
