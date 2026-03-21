// GET /api/library/[templateId]/progress — Lightweight polling endpoint
// for tracking extraction progress. The client polls this every few seconds
// while a CMM is being processed.

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { templateId } = await params;

  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      status: true,
      title: true,
      totalPages: true,
      currentSectionIndex: true,
      organizationId: true,
      extractionMetadata: true,
      sections: {
        select: {
          id: true,
          title: true,
          figureNumber: true,
          status: true,
          itemCount: true,
          extractionConfidence: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!template || template.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const totalSections = template.sections.length;
  const completedSections = template.sections.filter(
    (s) => s.status === "extracted" || s.status === "failed"
  ).length;
  const failedSections = template.sections.filter(
    (s) => s.status === "failed"
  ).length;
  const totalItems = template.sections.reduce((sum, s) => sum + s.itemCount, 0);

  // Figure out what's currently being worked on
  const currentSection = template.sections.find((s) => s.status === "extracting")
    || template.sections.find((s) => s.status === "pending");

  // During Pass 1, report page classification progress from extractionMetadata
  const meta = template.extractionMetadata as Record<string, unknown> | null;
  const pass1Progress = meta?.pass1Progress as {
    pagesToProcess: number[];
    classifiedSoFar: unknown[];
    nextBatchStart: number;
  } | undefined;

  const pagesClassified = pass1Progress?.classifiedSoFar?.length ?? 0;
  const pagesToClassify = pass1Progress?.pagesToProcess?.length ?? template.totalPages;

  return NextResponse.json({
    status: template.status,
    totalPages: template.totalPages,
    totalSections,
    completedSections,
    failedSections,
    totalItems,
    // Pass 1 progress (page classification)
    pagesClassified,
    pagesToClassify,
    currentSection: currentSection
      ? { title: currentSection.title, figureNumber: currentSection.figureNumber }
      : null,
    // Per-section breakdown for detailed progress UI
    sections: template.sections.map((s) => ({
      id: s.id,
      title: s.title,
      figureNumber: s.figureNumber,
      status: s.status,
      itemCount: s.itemCount,
      confidence: s.extractionConfidence,
    })),
  });
}
