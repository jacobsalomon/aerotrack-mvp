import { prisma } from "@/lib/db";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const alerts = await prisma.alert.findMany({
    include: {
      component: {
        select: {
          partNumber: true,
          serialNumber: true,
          description: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Sort by severity (critical → warning → info) then by date
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => {
    const sDiff = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
    if (sDiff !== 0) return sDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return NextResponse.json(alerts);
}
