import { prisma } from "@/lib/db";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { NextResponse } from "next/server";

// GET /api/components/[id] — get single component with full lifecycle
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const { id } = await params;

  const component = await prisma.component.findUnique({
    where: { id },
    include: {
      events: {
        include: {
          evidence: true,
          generatedDocs: true,
          partsConsumed: true,
        },
        orderBy: { date: "asc" },
      },
      alerts: {
        orderBy: { createdAt: "desc" },
      },
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  return NextResponse.json(component);
}
