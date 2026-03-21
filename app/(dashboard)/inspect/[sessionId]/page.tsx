// /inspect/[sessionId] — Main inspection workspace
// Server component loads session data, client component renders the interactive UI

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import InspectWorkspace from "./inspect-workspace";

type PageProps = { params: Promise<{ sessionId: string }> };

export default async function InspectSessionPage({ params }: PageProps) {
  const { sessionId } = await params;

  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
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

  if (!session || session.sessionType !== "inspection") {
    redirect("/inspect");
  }

  // Also load the component info if linked
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
