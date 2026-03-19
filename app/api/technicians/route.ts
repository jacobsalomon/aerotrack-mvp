// GET /api/technicians — List all users with session counts
// For the web dashboard user management page
// Protected by dashboard auth (passcode cookie)

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      badgeNumber: true,
      role: true,
      status: true,
      // apiKey intentionally excluded — never expose secrets to the client
      organization: { select: { name: true } },
      _count: {
        select: {
          captureSessions: true,
          reviewedDocuments: true,
        },
      },
    },
    orderBy: { id: "desc" },
  });

  return NextResponse.json(users);
}
