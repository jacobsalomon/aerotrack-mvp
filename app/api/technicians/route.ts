// GET /api/technicians — List all users with session counts
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      _count: {
        select: { captureSessions: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
