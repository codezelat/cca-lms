import { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminBackupsPage from "@/components/backups/admin-backups-page";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Database Backups",
  description: "Monitor daily database backups and restore readiness",
};

export default async function BackupsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <AdminBackupsPage />;
}
