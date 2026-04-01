// Evidence Audit API — returns all inspection items with their linked
// measurements, sources, and evidence files in one efficient query.
// Read-only endpoint: any authenticated user in the org can view.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json(
        { success: false, error: "No organization assigned" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Load the session with its template, user, and component info
    const session = await prisma.captureSession.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, firstName: true, lastName: true, badgeNumber: true },
        },
        signedOffBy: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
        inspectionTemplate: {
          select: { id: true, title: true, revisionDate: true, version: true },
        },
      },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.sessionType !== "inspection" || !session.inspectionTemplateId) {
      return NextResponse.json(
        { success: false, error: "Not an inspection session" },
        { status: 400 }
      );
    }

    // Load component if linked
    let component = null;
    if (session.componentId) {
      component = await prisma.component.findUnique({
        where: { id: session.componentId },
        select: { id: true, partNumber: true, serialNumber: true, description: true },
      });
    }

    // Build configuration filter — only show items applicable to this variant
    const configFilter = session.configurationVariant
      ? {
          OR: [
            { configurationApplicability: { isEmpty: true } },
            { configurationApplicability: { has: session.configurationVariant } },
          ],
        }
      : {};

    // Single query: sections → items → progress → measurement → sources → evidence
    const sections = await prisma.inspectionSection.findMany({
      where: {
        templateId: session.inspectionTemplateId,
        // Also filter sections by configuration applicability
        ...(session.configurationVariant
          ? {
              OR: [
                { configurationApplicability: { isEmpty: true } },
                { configurationApplicability: { has: session.configurationVariant } },
              ],
            }
          : {}),
      },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        figureNumber: true,
        sortOrder: true,
        items: {
          where: configFilter,
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            itemCallout: true,
            parameterName: true,
            specification: true,
            specValueLow: true,
            specValueHigh: true,
            specUnit: true,
            itemType: true,
            sortOrder: true,
            inspectionProgress: {
              where: { captureSessionId: id },
              select: {
                id: true,
                status: true,
                result: true,
                measurementId: true,
                notes: true,
                completedAt: true,
              },
            },
            measurements: {
              where: { captureSessionId: id },
              select: {
                id: true,
                value: true,
                unit: true,
                confidence: true,
                corroborationLevel: true,
                status: true,
                measuredAt: true,
                sources: {
                  orderBy: { createdAt: "asc" },
                  select: {
                    id: true,
                    sourceType: true,
                    value: true,
                    unit: true,
                    confidence: true,
                    rawExcerpt: true,
                    timestamp: true,
                    captureEvidenceId: true,
                    captureEvidence: {
                      select: {
                        id: true,
                        fileUrl: true,
                        mimeType: true,
                        type: true,
                        durationSeconds: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Convert epoch-second timestamps to session-relative seconds.
    // Audio route stores MeasurementSource.timestamp as epoch seconds
    // (chunkStartTime/1000 + timestampInChunk). The UI displays "MM:SS into session"
    // so we subtract the session start time to get session-relative seconds.
    const sessionStartEpoch = session.startedAt
      ? new Date(session.startedAt).getTime() / 1000
      : null;

    function toSessionRelativeTimestamp(timestamp: number | null): number | null {
      if (timestamp == null) return null;
      // If timestamp is clearly epoch seconds (> 1 billion), convert to session-relative.
      // Small values (< 86400 = 24 hours) are already session-relative or chunk-relative.
      if (sessionStartEpoch && timestamp > 1_000_000_000) {
        return Math.max(0, timestamp - sessionStartEpoch);
      }
      return timestamp;
    }

    // Reshape into the response format the PRD specifies
    const shapedSections = sections.map((section) => ({
      id: section.id,
      title: section.title,
      figureNumber: section.figureNumber,
      sortOrder: section.sortOrder,
      items: section.items.map((item) => {
        // Get the progress record for this item in this session
        const progress = item.inspectionProgress[0] ?? null;
        // Get the measurement linked via progress (or the first one for this item)
        const measurement = progress?.measurementId
          ? item.measurements.find((m) => m.id === progress.measurementId) ?? item.measurements[0] ?? null
          : item.measurements[0] ?? null;

        return {
          id: item.id,
          calloutNumber: item.itemCallout,
          parameterName: item.parameterName,
          specification: item.specification,
          specValueLow: item.specValueLow,
          specValueHigh: item.specValueHigh,
          specUnit: item.specUnit,
          itemType: item.itemType,
          sortOrder: item.sortOrder,
          progress: progress
            ? {
                status: progress.status,
                result: progress.result,
                measurementId: progress.measurementId,
                notes: progress.notes,
                completedAt: progress.completedAt,
              }
            : null,
          measurement: measurement
            ? {
                id: measurement.id,
                value: measurement.value,
                unit: measurement.unit,
                confidence: measurement.confidence,
                corroborationLevel: measurement.corroborationLevel,
                status: measurement.status,
                measuredAt: measurement.measuredAt,
                sources: measurement.sources.map((src) => ({
                  id: src.id,
                  sourceType: src.sourceType,
                  value: src.value,
                  unit: src.unit,
                  confidence: src.confidence,
                  rawExcerpt: src.rawExcerpt,
                  timestamp: src.timestamp,
                  sessionTimestamp: toSessionRelativeTimestamp(src.timestamp),
                  evidence: src.captureEvidence
                    ? {
                        id: src.captureEvidence.id,
                        fileUrl: src.captureEvidence.fileUrl,
                        mimeType: src.captureEvidence.mimeType,
                        type: src.captureEvidence.type,
                        durationSeconds: src.captureEvidence.durationSeconds,
                      }
                    : null,
                })),
              }
            : null,
        };
      }),
    }));

    return NextResponse.json({
      success: true,
      data: {
        session: {
          id: session.id,
          status: session.status,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          signedOffAt: session.signedOffAt,
          configurationVariant: session.configurationVariant,
          user: session.user,
          signedOffBy: session.signedOffBy,
          component,
          template: session.inspectionTemplate,
        },
        sections: shapedSections,
      },
    });
  } catch (error) {
    console.error("[inspect/sessions/[id]/audit GET]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load audit data" },
      { status: 500 }
    );
  }
}
