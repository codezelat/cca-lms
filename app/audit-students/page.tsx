import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import StudentAuditPage from "@/components/audit/student-audit-page";
import { Metadata } from "next";

export const runtime = "nodejs";

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

  return <StudentAuditPage />;
}
