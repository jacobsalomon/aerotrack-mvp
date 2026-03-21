import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;

    // Verify session ownership
    const session = await prisma.captureSession.findUnique({
      where: { id },
      select: { organizationId: true, sessionType: true },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");

    const where: Record<string, unknown> = { captureSessionId: id };
    if (since) {
      where.updatedAt = { gt: new Date(since) };
    }

    const progress = await prisma.inspectionProgress.findMany({
      where,
      include: {
        measurement: {
          select: { id: true, value: true, unit: true, inTolerance: true, status: true },
        },
        inspectionItem: {
          select: { id: true, parameterName: true, specValueLow: true, specValueHigh: true, specUnit: true },
        },
      },
      orderBy: { updatedAt: "asc" },
    });

    return NextResponse.json({ success: true, data: progress });
  } catch (error) {
    console.error("[inspect/sessions/[id]/progress GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load progress" }, { status: 500 });
  }
}
