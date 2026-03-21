import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { guardSignedOff } from "@/lib/inspect/inspection-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  // For production: requireSupervisor(). For demo: requireAuth() since all users are USER role.
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

    // Already signed off?
    const guard = guardSignedOff(session);
    if (guard) return guard;

    // Must be in reviewing status to sign off
    if (session.status !== "reviewing" && session.status !== "inspecting") {
      return NextResponse.json({ success: false, error: "Session must be in reviewing or inspecting status to sign off" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { notes } = body as { notes?: string };

    const updated = await prisma.captureSession.update({
      where: { id },
      data: {
        status: "signed_off",
        signedOffById: authResult.user.id,
        signedOffAt: new Date(),
        signOffNotes: notes || null,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: { signedOff: true, sessionId: updated.id } });
  } catch (error) {
    console.error("[inspect/sign-off POST]", error);
    return NextResponse.json({ success: false, error: "Failed to sign off" }, { status: 500 });
  }
}
