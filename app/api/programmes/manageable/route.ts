import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "ADMIN" && session.user.role !== "LECTURER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const where =
      session.user.role === "LECTURER"
        ? {
            lecturers: {
              some: {
                lecturerId: session.user.id,
              },
            },
          }
        : {};

    const programmes = await prisma.course.findMany({
      where,
      orderBy: [
        {
          title: "asc",
        },
      ],
      select: {
        id: true,
        title: true,
        status: true,
        _count: {
          select: {
            enrollments: {
              where: {
                status: "ACTIVE",
                user: {
                  role: "STUDENT",
                },
              },
            },
            modules: true,
          },
        },
      },
    });

    return NextResponse.json({
      programmes: programmes.map((programme) => ({
        activeStudentCount: programme._count.enrollments,
        id: programme.id,
        moduleCount: programme._count.modules,
        status: programme.status,
        title: programme.title,
      })),
    });
  } catch (error) {
    console.error("Error fetching manageable programmes:", error);
    return NextResponse.json(
      { error: "Failed to fetch manageable programmes" },
      { status: 500 },
    );
  }
}
