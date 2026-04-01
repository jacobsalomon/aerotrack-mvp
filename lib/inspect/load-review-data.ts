// Shared data loader for inspection review pages.
// Used by both /jobs/[id]/review and /inspect/[sessionId]/review
// to avoid duplicating the same Prisma query + processing logic.

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loadReviewData(sessionId: string, notFoundRedirect: string) {
  // Get the current user's org for scoping
  const authSession = await auth();
  const userOrgId = authSession?.user?.organizationId;

  if (!userOrgId) {
    redirect("/login");
  }

  // Load session with org-scoping: only returns if it belongs to this user's org
  const session = await prisma.captureSession.findFirst({
    where: { id: sessionId, organizationId: userOrgId },
    select: {
      id: true,
      sessionType: true,
      startedAt: true,
      signedOffAt: true,
      configurationVariant: true,
      workOrderRef: true,
      componentId: true,
      reconciliationSummary: true,
      user: {
        select: { id: true, name: true, firstName: true, lastName: true },
      },
      signedOffBy: {
        select: { id: true, name: true, firstName: true, lastName: true },
      },
      inspectionTemplate: {
        select: {
          id: true,
          title: true,
          revisionDate: true,
          version: true,
          sections: {
            orderBy: { sortOrder: "asc" as const },
            select: {
              id: true,
              title: true,
              figureNumber: true,
              items: {
                orderBy: { sortOrder: "asc" as const },
                select: {
                  id: true,
                  parameterName: true,
                  itemType: true,
                  specValueLow: true,
                  specValueHigh: true,
                  checkReference: true,
                  repairReference: true,
                },
              },
            },
          },
        },
      },
      inspectionProgress: {
        select: {
          id: true,
          inspectionItemId: true,
          instanceIndex: true,
          status: true,
          result: true,
          measurement: {
            select: {
              id: true,
              value: true,
              unit: true,
              inTolerance: true,
            },
          },
          inspectionItem: {
            select: {
              id: true,
              parameterName: true,
              itemType: true,
              specValueLow: true,
              specValueHigh: true,
              checkReference: true,
              repairReference: true,
            },
          },
          completedBy: {
            select: { id: true, name: true, firstName: true, lastName: true },
          },
        },
      },
      inspectionFindings: {
        select: {
          id: true,
          description: true,
          severity: true,
          status: true,
          createdBy: {
            select: { id: true, name: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: "desc" as const },
      },
    },
  });

  if (!session || session.sessionType !== "inspection") {
    redirect(notFoundRedirect);
  }

  // Load component if linked
  let component = null;
  if (session.componentId) {
    component = await prisma.component.findUnique({
      where: { id: session.componentId },
      select: { id: true, partNumber: true, serialNumber: true, description: true },
    });
  }

  // Count unassigned measurements + fetch photos in parallel
  const [unassignedCount, photos] = await Promise.all([
    prisma.measurement.count({
      where: { captureSessionId: sessionId, inspectionItemId: null },
    }),
    prisma.captureEvidence.findMany({
      where: { sessionId, type: "PHOTO" },
      select: {
        id: true,
        fileUrl: true,
        inspectionItemId: true,
        instanceIndex: true,
        capturedAt: true,
        inspectionItem: { select: { parameterName: true } },
      },
      orderBy: { capturedAt: "asc" },
    }),
  ]);

  const photoItemIds = [...new Set(
    photos.filter((p) => p.inspectionItemId).map((p) => p.inspectionItemId!)
  )];

  // Only show "Finalizing AI analysis..." when actual work has been done.
  // Progress records are pre-created at session start (all "pending"), so we
  // only count items that have been worked on (done, problem, skipped).
  const hasActualWork = photos.length > 0 || unassignedCount > 0 ||
    session.inspectionProgress.some((p) => p.status !== "pending");
  const isReconciling = hasActualWork && !session.reconciliationSummary && !session.signedOffAt;
  const hasNoEvidence = !hasActualWork && !session.signedOffAt;

  // Serialize for client component (strips Prisma types, handles dates)
  return {
    session: JSON.parse(JSON.stringify(session)),
    component: component ? JSON.parse(JSON.stringify(component)) : null,
    unassignedCount,
    isReconciling,
    hasNoEvidence,
    photoItemIds,
    photos: JSON.parse(JSON.stringify(photos)),
  };
}
