// /jobs/[id] — Unified job workspace
// Loads the session and renders the correct workspace based on sessionType:
//   "inspection" → InspectWorkspace (guided CMM inspection)
//   "capture"    → SessionDetailClient (freeform capture review)
// For new inspections with no progress, shows the Job Briefing screen first.

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import InspectWorkspace from "@/app/(dashboard)/inspect/[sessionId]/inspect-workspace";
import SessionDetailClient from "@/app/(dashboard)/sessions/[id]/page";
import JobBriefing from "./job-briefing";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function JobPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const search = await searchParams;

  const session = await prisma.captureSession.findUnique({
    where: { id },
    select: {
      id: true,
      sessionType: true,
      status: true,
      componentId: true,
      configurationVariant: true,
      workOrderRef: true,
      activeInspectionSectionId: true,
      signedOffAt: true,
      startedAt: true,
      inspectionTemplateId: true,
      inspectionTemplateVersion: true,
      cmmRevisionAcknowledgedAt: true,
      user: {
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
            select: {
              id: true,
              title: true,
              figureNumber: true,
              sortOrder: true,
              referenceImageUrls: true,
              itemCount: true,
              configurationApplicability: true,
              items: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  itemType: true,
                  itemCallout: true,
                  parameterName: true,
                  specification: true,
                  specValueLow: true,
                  specValueHigh: true,
                  specUnit: true,
                  specValueLowMetric: true,
                  specValueHighMetric: true,
                  specUnitMetric: true,
                  toolsRequired: true,
                  checkReference: true,
                  repairReference: true,
                  configurationApplicability: true,
                  notes: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
      // Count progress records to decide whether to show the briefing
      _count: { select: { inspectionProgress: true } },
    },
  });

  if (!session) {
    redirect("/jobs");
  }

  // Guided inspection
  if (session.sessionType === "inspection") {
    let component = null;
    if (session.componentId) {
      component = await prisma.component.findUnique({
        where: { id: session.componentId },
        select: { id: true, partNumber: true, serialNumber: true, description: true },
      });
    }

    // Show Job Briefing if no progress yet and inspector hasn't just tapped "Begin"
    const hasProgress = session._count.inspectionProgress > 0;
    const justStarted = search.started === "true";

    if (!hasProgress && !justStarted && !session.signedOffAt) {
      return (
        <JobBriefing
          session={JSON.parse(JSON.stringify(session))}
          component={component ? JSON.parse(JSON.stringify(component)) : null}
        />
      );
    }

    return (
      <InspectWorkspace
        session={JSON.parse(JSON.stringify(session))}
        component={component ? JSON.parse(JSON.stringify(component)) : null}
      />
    );
  }

  // Freeform capture — render the session detail client component.
  // It reads its ID from useParams() so the /jobs/[id] route param works directly.
  return <SessionDetailClient />;
}
