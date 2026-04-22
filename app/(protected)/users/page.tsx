import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import UsersClient from "@/components/users/users-client";
import { Metadata } from "next";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "User Management",
  description: "Manage students and lecturers",
};

export default async function UsersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Only admins can manage users
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <UsersClient />;
}
