import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import StudentAuditDetail from "@/components/audit/student-audit-detail";
import { Metadata } from "next";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Student Audit Detail",
  description: "Detailed audit view for a student",
};

export default async function AuditStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const { id } = await params;

  return <StudentAuditDetail studentId={id} />;
}
