// /inspect/[sessionId]/review — Inspection review page
// Shows full summary, problems, findings, section-by-section breakdown, and sign-off button

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import ReviewScreen from "@/components/inspect/review-screen";

type PageProps = { params: Promise<{ sessionId: string }> };

export default async function ReviewPage({ params }: PageProps) {
  const { sessionId } = await params;

  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
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

  if (!session || session.sessionType !== "inspection") {
    redirect("/inspect");
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
    where: { captureSessionId: sessionId, inspectionItemId: null },
  });

  return (
    <ReviewScreen
      session={JSON.parse(JSON.stringify(session))}
      component={component ? JSON.parse(JSON.stringify(component)) : null}
      unassignedCount={unassignedCount}
    />
  );
}
