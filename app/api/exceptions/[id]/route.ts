// PATCH /api/exceptions/[id]
// Update an exception's status (e.g., mark as investigating, resolved, or false positive).
// Body: { status: "investigating" | "resolved" | "false_positive", resolvedBy?: string, resolutionNotes?: string }

import { prisma } from "@/lib/db";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const { status, resolvedBy, resolutionNotes } = body;

  if (!status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const validStatuses = ["open", "investigating", "resolved", "false_positive"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.exception.update({
      where: { id },
      data: {
        status,
        resolvedBy: resolvedBy || null,
        resolutionNotes: resolutionNotes || null,
        resolvedAt: status === "resolved" || status === "false_positive" ? new Date() : null,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    // Prisma P2025 = record not found; anything else is a real server error
    const isNotFound =
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2025";
    if (isNotFound) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 });
    }
    console.error("Exception update error:", error);
    return NextResponse.json({ error: "Failed to update exception" }, { status: 500 });
  }
}
