// GET /api/technicians — List all technicians with session counts
// For the web dashboard technician management page

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const technicians = await prisma.technician.findMany({
    include: {
      organization: { select: { name: true } },
      _count: {
        select: {
          captureSessions: true,
          reviewedDocuments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(technicians);
}
