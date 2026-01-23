import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ProgrammeContentClient from "@/components/programmes/programme-content-client";

export const runtime = "nodejs";

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Only admins can manage programme content
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const { id } = await params;

  return <ProgrammeContentClient programmeId={id} />;
}
