import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
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
