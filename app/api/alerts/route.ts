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
    orderBy: [
      { severity: "asc" },  // critical first
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json(alerts);
}
