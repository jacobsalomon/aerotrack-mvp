// GET /api/sessions — List all capture sessions for the web dashboard
// Includes technician info, evidence counts, and document counts
// Not authenticated (web dashboard is internal admin tool for PoC)

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;

  const sessions = await prisma.captureSession.findMany({
    where,
    include: {
      technician: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          badgeNumber: true,
        },
      },
      organization: {
        select: { name: true },
      },
      _count: {
        select: {
          evidence: true,
          documents: true,
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(sessions);
}
