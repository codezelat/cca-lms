import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const { id } = await params;

  // Admins can access all programmes, lecturers can only access their assigned programmes
  if (session.user.role === "LECTURER") {
    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        lecturers: {
          where: { lecturerId: session.user.id },
          select: { lecturerId: true },
        },
      },
    });

    if (!course || course.lecturers.length === 0) {
      redirect("/programmes");
    }
  } else if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <ProgrammeContentClient programmeId={id} />;
}
