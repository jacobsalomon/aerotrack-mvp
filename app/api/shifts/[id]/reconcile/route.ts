// POST /api/shifts/[id]/reconcile — Trigger end-of-shift reconciliation
// Reviews all measurements, checks spec completeness, flags issues.
// Open for web dashboard (no Bearer token required)

import { prisma } from "@/lib/db";
import { reconcileShift } from "@/lib/ai/shift-reconciliation";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const { id: shiftId } = await params;

  try {
    const shift = await prisma.shiftSession.findUnique({ where: { id: shiftId } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Shift not found" }, { status: 404 });
    }
    if (shift.status === "completed") {
      // Already reconciled — return cached result
      return NextResponse.json({
        success: true,
        data: shift.reconciliationJson ? JSON.parse(shift.reconciliationJson) : null,
        cached: true,
      });
    }

    const result = await reconcileShift(shiftId);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Reconciliation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reconcile shift" },
      { status: 500 }
    );
  }
}
