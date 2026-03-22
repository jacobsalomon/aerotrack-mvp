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
          pageNumbers: true,
          pass2Progress: true,
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

  // Determine current phase and page-level progress for Pass 2
  let phase: "indexing" | "page_extraction" | "section_finalization" | null = null;
  let pageProgress: { current: number; total: number } | null = null;

  if (template.status === "extracting_index") {
    phase = "indexing";
  } else if (template.status === "extracting_details" && currentSection) {
    const p2 = currentSection.pass2Progress as { nextPageOffset: number } | null;
    const totalPagesInSection = currentSection.pageNumbers.length;
    const pagesExtractedInSection = p2?.nextPageOffset ?? 0;

    if (pagesExtractedInSection >= totalPagesInSection && totalPagesInSection > 0) {
      phase = "section_finalization";
    } else {
      phase = "page_extraction";
    }
    pageProgress = { current: pagesExtractedInSection, total: totalPagesInSection };
  }

  // Short cache to reduce duplicate requests hitting the serverless function.
  // Extraction progress only changes every ~30-60s per section, so 5s cache
  // is fine and dramatically reduces log noise during extraction.
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
    // Current work
    phase,
    currentSection: currentSection
      ? {
          title: currentSection.title,
          figureNumber: currentSection.figureNumber,
          pageProgress,
        }
      : null,
    // Per-section breakdown for detailed progress UI
    sections: template.sections.map((s) => {
      const p2 = s.pass2Progress as { nextPageOffset: number } | null;
      return {
        id: s.id,
        title: s.title,
        figureNumber: s.figureNumber,
        status: s.status,
        itemCount: s.itemCount,
        confidence: s.extractionConfidence,
        pageProgress: s.status === "extracting" && p2
          ? { current: p2.nextPageOffset, total: s.pageNumbers.length }
          : undefined,
      };
    }),
  });
}
