// Review page — server component that loads the template data
// and passes it to the client component for interactive review.

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ReviewClient from "./review-client";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    redirect("/login");
  }

  const { templateId } = await params;

  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!template || template.organizationId !== session.user.organizationId) {
    redirect("/library");
  }

  return (
    <ReviewClient
      template={{
        id: template.id,
        title: template.title,
        status: template.status,
        sourceFileUrl: template.sourceFileUrl,
        partNumbersCovered: template.partNumbersCovered,
        totalPages: template.totalPages,
        sections: template.sections.map((s) => ({
          id: s.id,
          title: s.title,
          figureNumber: s.figureNumber,
          sheetInfo: s.sheetInfo,
          pageNumbers: s.pageNumbers,
          status: s.status,
          itemCount: s.itemCount,
          extractionConfidence: s.extractionConfidence,
          notes: s.notes,
          items: s.items.map((item) => ({
            id: item.id,
            itemType: item.itemType,
            itemCallout: item.itemCallout,
            parameterName: item.parameterName,
            specification: item.specification,
            specValueLow: item.specValueLow,
            specValueHigh: item.specValueHigh,
            specUnit: item.specUnit,
            specValueLowMetric: item.specValueLowMetric,
            specValueHighMetric: item.specValueHighMetric,
            specUnitMetric: item.specUnitMetric,
            toolsRequired: item.toolsRequired,
            checkReference: item.checkReference,
            repairReference: item.repairReference,
            specialAssemblyRef: item.specialAssemblyRef,
            configurationApplicability: item.configurationApplicability,
            notes: item.notes,
            confidence: item.confidence,
            reviewReason: item.reviewReason,
            sortOrder: item.sortOrder,
            correctedAt: item.correctedAt?.toISOString() ?? null,
            humanCorrection: item.humanCorrection as { action: "approved" | "corrected" } | null,
          })),
        })),
      }}
    />
  );
}
