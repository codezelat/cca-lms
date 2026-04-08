import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const toPositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const selectedUserId = (searchParams.get("selectedUserId") || "").trim();
    const limit = Math.min(toPositiveInt(searchParams.get("limit"), 20), 50);

    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [matchingUsers, selectedUser] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: limit + 1,
      }),
      selectedUserId
        ? prisma.user.findUnique({
            where: { id: selectedUserId },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const users = [];
    const seenUserIds = new Set<string>();

    if (selectedUser) {
      users.push(selectedUser);
      seenUserIds.add(selectedUser.id);
    }

    for (const user of matchingUsers.slice(0, limit)) {
      if (seenUserIds.has(user.id)) continue;
      users.push(user);
      seenUserIds.add(user.id);
    }

    return NextResponse.json({
      users,
      selectedUser,
      hasMore: matchingUsers.length > limit,
    });
  } catch (error) {
    console.error("Error fetching activity log users:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity log users" },
      { status: 500 },
    );
  }
}
