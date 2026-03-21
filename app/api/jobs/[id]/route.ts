// Delete a job (CaptureSession) and all its related records.
// Only allowed if the job has NOT been signed off.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;

    const session = await prisma.captureSession.findUnique({
      where: { id },
      select: { id: true, organizationId: true, signedOffAt: true },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    if (session.signedOffAt) {
      return NextResponse.json({ success: false, error: "Cannot delete a signed-off job" }, { status: 403 });
    }

    // Delete in dependency order within a transaction
    await prisma.$transaction([
      prisma.inspectionFinding.deleteMany({ where: { captureSessionId: id } }),
      prisma.inspectionProgress.deleteMany({ where: { captureSessionId: id } }),
      prisma.measurementSource.deleteMany({ where: { measurement: { captureSessionId: id } } }),
      prisma.measurement.deleteMany({ where: { captureSessionId: id } }),
      prisma.videoAnnotation.deleteMany({ where: { evidence: { sessionId: id } } }),
      prisma.captureDocument.deleteMany({ where: { sessionId: id } }),
      prisma.sessionAnalysis.deleteMany({ where: { sessionId: id } }),
      prisma.captureEvidence.deleteMany({ where: { sessionId: id } }),
      prisma.captureSession.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[jobs/[id] DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete job" }, { status: 500 });
  }
}
