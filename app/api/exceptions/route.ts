// GET /api/exceptions
// Returns a filterable list of all exceptions in the system.
// Query params: ?componentId=X&severity=critical&status=open&limit=50

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const componentId = searchParams.get("componentId");
  const severity = searchParams.get("severity");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  // Build the filter dynamically based on what query params are present
  const where: Record<string, unknown> = {};

  if (componentId) {
    where.componentId = componentId;
  }
  if (severity && severity !== "all") {
    where.severity = severity;
  }
  if (status && status !== "all") {
    where.status = status;
  }

  const exceptions = await prisma.exception.findMany({
    where,
    include: {
      component: {
        select: {
          partNumber: true,
          serialNumber: true,
          description: true,
        },
      },
    },
    orderBy: [
      { severity: "asc" }, // "critical" sorts before "info" and "warning" alphabetically
      { detectedAt: "desc" },
    ],
    take: limit,
  });

  return NextResponse.json(exceptions);
}
