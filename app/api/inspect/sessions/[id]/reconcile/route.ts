// POST /api/inspect/sessions/[id]/reconcile
// Triggers the post-session reconciliation pass that re-evaluates unassigned
// and low-confidence measurements against the full template.
// Idempotent — returns existing summary if already reconciled.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { reconcileInspectionSession } from "@/lib/inspection-matching";

type RouteContext = { params: Promise<{ id: string }> };

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

    if (session.sessionType !== "inspection") {
      return NextResponse.json({ success: false, error: "Not an inspection session" }, { status: 400 });
    }

    const summary = await reconcileInspectionSession(id);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("[reconcile POST]", error);
    return NextResponse.json({ success: false, error: "Reconciliation failed" }, { status: 500 });
  }
}
