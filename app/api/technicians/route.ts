// GET /api/technicians — List all users with session counts
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  // Cross-org isolation: only return users in the authenticated user's org
  if (!authResult.user.organizationId) {
    return NextResponse.json({ error: "No organization assigned" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { organizationId: authResult.user.organizationId },
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
