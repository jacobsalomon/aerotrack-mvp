// /jobs/[id] — Unified job workspace
// Loads the session and renders the correct workspace based on sessionType:
//   "inspection" → InspectWorkspace (guided CMM inspection)
//   "capture"    → SessionDetailClient (freeform capture review)

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import InspectWorkspace from "@/app/(dashboard)/inspect/[sessionId]/inspect-workspace";
import SessionDetailClient from "@/app/(dashboard)/sessions/[id]/page";

type PageProps = { params: Promise<{ id: string }> };

export default async function JobPage({ params }: PageProps) {
  const { id } = await params;

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
    },
  });

  if (!session) {
    redirect("/jobs");
  }

  // Guided inspection — render InspectWorkspace
  if (session.sessionType === "inspection") {
    let component = null;
    if (session.componentId) {
      component = await prisma.component.findUnique({
        where: { id: session.componentId },
        select: { id: true, partNumber: true, serialNumber: true, description: true },
      });
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
