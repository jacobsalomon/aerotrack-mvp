import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { guardSignedOff } from "@/lib/inspect/inspection-helpers";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id, itemId } = await params;
    const session = await prisma.captureSession.findUnique({ where: { id } });
    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    const guard = guardSignedOff(session);
    if (guard) return guard;

    const body = await request.json();
    const instanceIndex = body.instanceIndex ?? 0;
    if (!body.reason) {
      return NextResponse.json({ success: false, error: "reason is required to skip an item" }, { status: 400 });
    }

    await prisma.inspectionProgress.upsert({
      where: {
        captureSessionId_inspectionItemId_instanceIndex: {
          captureSessionId: id,
          inspectionItemId: itemId,
          instanceIndex,
        },
      },
      create: {
        captureSessionId: id,
        inspectionItemId: itemId,
        instanceIndex,
        status: "skipped",
        result: "not_applicable",
        skipReason: body.reason,
        notes: body.notes || null,
        completedAt: new Date(),
        completedById: authResult.user.id,
      },
      update: {
        status: "skipped",
        result: "not_applicable",
        skipReason: body.reason,
        notes: body.notes || null,
        completedAt: new Date(),
        completedById: authResult.user.id,
      },
    });

    return NextResponse.json({ success: true, data: { status: "skipped" } });
  } catch (error) {
    console.error("[inspect/skip POST]", error);
    return NextResponse.json({ success: false, error: "Failed to skip item" }, { status: 500 });
  }
}
