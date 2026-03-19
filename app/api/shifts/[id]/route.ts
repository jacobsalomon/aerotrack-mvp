// GET   /api/shifts/[id] — Get shift detail with measurement summary
// PATCH /api/shifts/[id] — Pause, resume, or end a shift
// GET is open for the web dashboard; PATCH requires Bearer auth (mobile)

import { authenticateRequest } from "@/lib/mobile-auth";
import { getShiftDetail, pauseShift, resumeShift, endShift } from "@/lib/shift-session";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

// Open for dashboard — no Bearer token required
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    // Pass null for orgId to skip org check (dashboard access)
    const shift = await getShiftDetail(id);
    if (!shift) {
      return NextResponse.json(
        { success: false, error: "Shift not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: shift });
  } catch (error) {
    console.error("Get shift error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get shift" },
      { status: 500 }
    );
  }
}

// PATCH requires auth — only the shift owner can pause/resume/end
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { action } = body;

    if (!action || !["pause", "resume", "end"].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "pause", "resume", or "end"' },
        { status: 400 }
      );
    }

    let shift;
    switch (action) {
      case "pause":
        shift = await pauseShift(id, auth.user.id);
        break;
      case "resume":
        shift = await resumeShift(id, auth.user.id);
        break;
      case "end":
        shift = await endShift(id, auth.user.id);
        break;
    }

    return NextResponse.json({ success: true, data: shift });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update shift";
    const status = message.includes("not found") ? 404
      : message.includes("Not authorized") ? 403
      : message.includes("Cannot") ? 409
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
