// /jobs/[id]/review — Review page for both inspection and capture sessions
// Inspection: renders ReviewScreen with full summary, findings, sign-off
// Capture: redirects to the session detail (review happens inline there)

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import ReviewScreen from "@/components/inspect/review-screen";

type PageProps = { params: Promise<{ id: string }> };

export default async function JobReviewPage({ params }: PageProps) {
  const { id } = await params;

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
        select: {
          id: true,
          title: true,
          revisionDate: true,
          version: true,
          sections: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
      inspectionProgress: {
        include: {
          measurement: {
            include: { sources: true },
          },
          inspectionItem: true,
          completedBy: {
            select: { id: true, name: true, firstName: true, lastName: true },
          },
        },
      },
      inspectionFindings: {
        include: {
          createdBy: {
            select: { id: true, name: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!session) {
    redirect("/jobs");
  }

  // For capture sessions, review happens inline on the detail page
  if (session.sessionType !== "inspection") {
    redirect(`/jobs/${id}`);
  }

  // Load component if linked
  let component = null;
  if (session.componentId) {
    component = await prisma.component.findUnique({
      where: { id: session.componentId },
      select: { id: true, partNumber: true, serialNumber: true, description: true },
    });
  }

  // Count unassigned measurements
  const unassignedCount = await prisma.measurement.count({
    where: { captureSessionId: id, inspectionItemId: null },
  });

  // Fetch all photo evidence for gallery + missing-photo warnings
  const photos = await prisma.captureEvidence.findMany({
    where: { sessionId: id, type: "PHOTO" },
    select: {
      id: true,
      fileUrl: true,
      inspectionItemId: true,
      instanceIndex: true,
      capturedAt: true,
      inspectionItem: { select: { parameterName: true } },
    },
    orderBy: { capturedAt: "asc" },
  });
  const photoItemIds = [...new Set(photos.filter((p) => p.inspectionItemId).map((p) => p.inspectionItemId!))];

  const isReconciling = !session.reconciliationSummary && !session.signedOffAt;

  return (
    <ReviewScreen
      session={JSON.parse(JSON.stringify(session))}
      component={component ? JSON.parse(JSON.stringify(component)) : null}
      unassignedCount={unassignedCount}
      isReconciling={isReconciling}
      photoItemIds={photoItemIds}
      photos={JSON.parse(JSON.stringify(photos))}
    />
  );
}
