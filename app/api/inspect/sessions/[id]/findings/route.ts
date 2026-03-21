import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { guardSignedOff } from "@/lib/inspect/inspection-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;
    const session = await prisma.captureSession.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    const findings = await prisma.inspectionFinding.findMany({
      where: { captureSessionId: id },
      include: {
        createdBy: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: findings });
  } catch (error) {
    console.error("[inspect/findings GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load findings" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;
    const session = await prisma.captureSession.findUnique({ where: { id } });
    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    const guard = guardSignedOff(session);
    if (guard) return guard;

    const body = await request.json();
    const { description, severity, inspectionItemId, inspectionSectionId, photoUrls, recommendedAction } = body;

    if (!description || !inspectionSectionId) {
      return NextResponse.json({ success: false, error: "description and inspectionSectionId are required" }, { status: 400 });
    }

    const finding = await prisma.inspectionFinding.create({
      data: {
        captureSessionId: id,
        inspectionItemId: inspectionItemId || null,
        inspectionSectionId,
        description,
        severity: severity || "major",
        recommendedAction: recommendedAction || null,
        photoUrls: photoUrls || [],
        status: "open",
        createdById: authResult.user.id,
      },
    });

    return NextResponse.json({ success: true, data: finding }, { status: 201 });
  } catch (error) {
    console.error("[inspect/findings POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create finding" }, { status: 500 });
  }
}
