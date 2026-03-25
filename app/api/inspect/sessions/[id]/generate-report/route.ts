// POST /api/inspect/sessions/[id]/generate-report
// Generates a PDF inspection report and returns it as binary download.
// Loads all session data (template, progress, measurements, findings, photos)
// and passes it to generateInspectionPdf().

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { generateInspectionPdf } from "@/lib/inspect/generate-inspection-pdf";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;

    // Load full session with all related data needed for the PDF
    const session = await prisma.captureSession.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true } },
        user: {
          select: { firstName: true, lastName: true, name: true, badgeNumber: true },
        },
        signedOffBy: {
          select: { firstName: true, lastName: true, name: true },
        },
        inspectionTemplate: {
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: {
                items: {
                  orderBy: { sortOrder: "asc" },
                  select: {
                    id: true,
                    itemCallout: true,
                    parameterName: true,
                    specification: true,
                    specUnit: true,
                    specValueLow: true,
                    specValueHigh: true,
                    itemType: true,
                    instanceCount: true,
                    instanceLabels: true,
                    notes: true,
                  },
                },
              },
            },
          },
        },
        inspectionProgress: {
          include: {
            measurement: {
              select: { value: true, unit: true, inTolerance: true },
            },
          },
        },
        inspectionFindings: {
          include: {
            inspectionItem: {
              select: { parameterName: true, itemCallout: true },
            },
            inspectionSection: {
              select: { title: true, figureNumber: true },
            },
            createdBy: {
              select: { firstName: true, name: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    if (session.sessionType !== "inspection") {
      return NextResponse.json({ success: false, error: "Not an inspection session" }, { status: 400 });
    }

    // Load component if linked
    let component = null;
    if (session.componentId) {
      component = await prisma.component.findUnique({
        where: { id: session.componentId },
        select: { partNumber: true, serialNumber: true, description: true },
      });
    }

    // Load photos for the appendix
    const photos = await prisma.captureEvidence.findMany({
      where: { sessionId: id, type: "PHOTO" },
      select: {
        fileUrl: true,
        inspectionItemId: true,
        instanceIndex: true,
        inspectionItem: {
          select: { parameterName: true, itemCallout: true },
        },
      },
      orderBy: { capturedAt: "asc" },
    });

    // Build the data shape expected by generateInspectionPdf
    const pdfData = {
      workOrderRef: session.workOrderRef,
      startedAt: session.startedAt.toISOString(),
      signedOffAt: session.signedOffAt?.toISOString() || null,
      signOffNotes: session.signOffNotes,
      cmmRevisionAcknowledgedAt: session.cmmRevisionAcknowledgedAt?.toISOString() || null,
      organization: session.organization,
      user: session.user,
      signedOffBy: session.signedOffBy,
      component,
      template: session.inspectionTemplate ? {
        title: session.inspectionTemplate.title,
        revisionDate: session.inspectionTemplate.revisionDate?.toISOString() || null,
        sections: session.inspectionTemplate.sections.map((s) => ({
          id: s.id,
          title: s.title,
          figureNumber: s.figureNumber,
          items: s.items,
        })),
      } : null,
      progress: session.inspectionProgress.map((p) => ({
        inspectionItemId: p.inspectionItemId,
        instanceIndex: p.instanceIndex,
        status: p.status,
        result: p.result,
        notes: p.notes,
        measurement: p.measurement ? {
          value: p.measurement.value,
          unit: p.measurement.unit,
          inTolerance: p.measurement.inTolerance,
        } : null,
      })),
      findings: session.inspectionFindings.map((f) => ({
        description: f.description,
        severity: f.severity,
        status: f.status,
        inspectionItemId: f.inspectionItemId,
        inspectionItem: f.inspectionItem,
        inspectionSection: f.inspectionSection,
        photoUrls: f.photoUrls,
        createdBy: f.createdBy,
      })),
      photos,
    };

    const pdfBytes = await generateInspectionPdf(pdfData);

    // Build filename: Inspection_Report_WO12345_881700-1089_2026-03-25.pdf
    const wo = session.workOrderRef?.replace(/[^a-zA-Z0-9-]/g, "") || "NoWO";
    const pn = component?.partNumber?.replace(/[^a-zA-Z0-9-]/g, "") || "Unknown";
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Inspection_Report_${wo}_${pn}_${dateStr}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("[generate-report POST]", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate inspection report" },
      { status: 500 }
    );
  }
}
