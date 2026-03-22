import { randomUUID } from "crypto";

import { prisma } from "@/lib/db";
import { runPass1Batch } from "@/lib/ai/cmm-extraction-pass1";
import {
  extractSectionPage,
  finalizeSectionExtraction,
} from "@/lib/ai/cmm-extraction-pass2";

export const EXTRACTION_STEP_MAX_DURATION_MS = 5 * 60 * 1000;
// How long to wait before considering a running extraction stale and reclaimable.
// 3 minutes: long enough for most pages to finish, short enough to self-heal quickly.
export const EXTRACTION_STALE_THRESHOLD_MS = 3 * 60 * 1000;

// Lease duration: 6 minutes. Covers the 5-min serverless max with 1 min buffer.
// If a function dies, the lease clears in 6 min max (or 3 min via stale threshold).
const LEASE_DURATION_MS = 6 * 60 * 1000;
const POLLABLE_TEMPLATE_STATUSES = [
  "pending_extraction",
  "extracting_index",
  "extracting_details",
] as const;
const TERMINAL_TEMPLATE_STATUSES = new Set([
  "active",
  "review_ready",
  "archived",
]);

export interface ExtractionStepResult {
  templateId: string;
  status: string;
  message?: string;
  templateStatus?: string;
  figureNumber?: string;
  itemsExtracted?: number;
  progress?: number;
  sections?: number;
  pageProgress?: { current: number; total: number };
  phase?: "indexing" | "page_extraction" | "section_finalization";
}

function getStaleBefore(now: Date) {
  return new Date(now.getTime() - EXTRACTION_STALE_THRESHOLD_MS);
}

async function releaseExtractionLease(templateId: string, data: Record<string, unknown> = {}) {
  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      extractionRunnerToken: null,
      extractionLeaseExpiresAt: null,
      ...data,
    },
  });
}

// Revive stale extracting sections so they can be picked up again.
// Keeps pass2Progress intact — we only reset the section status, not page work.
async function reviveStaleExtractingSections(templateId: string, staleBefore: Date) {
  const staleSections = await prisma.inspectionSection.findMany({
    where: {
      templateId,
      status: "extracting",
      updatedAt: { lt: staleBefore },
    },
    select: { id: true, pass2Progress: true },
  });

  if (staleSections.length === 0) return;

  // Reset status but keep pass2Progress so completed pages aren't redone
  await prisma.inspectionSection.updateMany({
    where: {
      id: { in: staleSections.map((s) => s.id) },
    },
    data: {
      status: "pending",
    },
  });

  console.warn(
    `[Extraction] Revived ${staleSections.length} stale section(s) for template ${templateId} (page progress preserved)`
  );
}

export async function findTemplatesReadyForExtraction(options: {
  limit?: number;
  templateId?: string;
} = {}) {
  const now = new Date();
  const staleBefore = getStaleBefore(now);

  return prisma.inspectionTemplate.findMany({
    where: {
      ...(options.templateId ? { id: options.templateId } : {}),
      status: { in: [...POLLABLE_TEMPLATE_STATUSES] },
      OR: [
        { extractionRunnerToken: null },
        { extractionLeaseExpiresAt: { lt: now } },
        { updatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    take: options.limit ?? 3,
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
    },
  });
}

export async function runTemplateExtractionStep(
  templateId: string
): Promise<ExtractionStepResult> {
  const existingTemplate = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      status: true,
    },
  });

  if (!existingTemplate) {
    return {
      templateId,
      status: "not_found",
      message: "Template not found",
    };
  }

  if (TERMINAL_TEMPLATE_STATUSES.has(existingTemplate.status)) {
    return {
      templateId,
      status: "already_complete",
      templateStatus: existingTemplate.status,
      message: "Already complete",
    };
  }

  const now = new Date();
  const staleBefore = getStaleBefore(now);
  const runnerToken = randomUUID();

  const leaseResult = await prisma.inspectionTemplate.updateMany({
    where: {
      id: templateId,
      OR: [
        { extractionRunnerToken: null },
        { extractionLeaseExpiresAt: { lt: now } },
        { updatedAt: { lt: staleBefore } },
      ],
    },
    data: {
      extractionRunnerToken: runnerToken,
      extractionLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
    },
  });

  if (leaseResult.count === 0) {
    return {
      templateId,
      status: "locked",
      message: "Another extraction worker is processing this template",
    };
  }

  try {
    const template = await prisma.inspectionTemplate.findUniqueOrThrow({
      where: { id: templateId },
    });

    if (TERMINAL_TEMPLATE_STATUSES.has(template.status)) {
      await releaseExtractionLease(templateId);
      return {
        templateId,
        status: "already_complete",
        templateStatus: template.status,
        message: "Already complete",
      };
    }

    // ── Pass 1: Page classification ──────────────────────────────────
    if (
      template.status === "pending_extraction" ||
      template.status === "extracting_index"
    ) {
      console.log(`[Extraction] Starting/continuing Pass 1 for template ${templateId}`);

      await prisma.inspectionTemplate.update({
        where: { id: templateId },
        data: { status: "extracting_index" },
      });

      const result = await runPass1Batch(templateId);

      if (result === 0) {
        await releaseExtractionLease(templateId, {
          status: "extraction_failed",
        });
        return {
          templateId,
          status: "failed",
          message: "No inspection diagrams found in the PDF",
          phase: "indexing",
        };
      }

      await releaseExtractionLease(templateId, result === "done" ? { currentSectionIndex: 0 } : {});

      return {
        templateId,
        status: result === "continue" ? "indexing_batch_complete" : "index_complete",
        phase: "indexing",
      };
    }

    // ── Pass 2: Page-at-a-time deep extraction ───────────────────────
    if (
      template.status === "extracting_details" ||
      template.status === "extraction_failed"
    ) {
      await reviveStaleExtractingSections(templateId, staleBefore);

      // Find a section that needs work. Priority:
      // 1. Section currently extracting with unfinished pages (resume in-progress work)
      // 2. Section in pending status (start new section)
      const inProgressSection = await prisma.inspectionSection.findFirst({
        where: {
          templateId,
          status: "extracting",
        },
        orderBy: { sortOrder: "asc" },
      });

      const workSection = inProgressSection || await prisma.inspectionSection.findFirst({
        where: {
          templateId,
          status: "pending",
        },
        orderBy: { sortOrder: "asc" },
      });

      if (!workSection) {
        // No sections need work — check if we're done
        const sections = await prisma.inspectionSection.findMany({
          where: { templateId },
          select: { status: true },
        });

        const hasAnyExtracted = sections.some((section) => section.status === "extracted");

        await releaseExtractionLease(templateId, {
          status: hasAnyExtracted ? "review_ready" : "extraction_failed",
        });

        console.log(
          `[Extraction] Complete for template ${templateId}: ${
            hasAnyExtracted ? "review_ready" : "extraction_failed"
          }`
        );

        return {
          templateId,
          status: hasAnyExtracted ? "review_ready" : "extraction_failed",
          sections: sections.length,
        };
      }

      // Check if this section's pages are all done and just needs finalization
      const progress = workSection.pass2Progress as { nextPageOffset: number } | null;
      const allPagesDone = progress && progress.nextPageOffset >= workSection.pageNumbers.length;

      if (allPagesDone) {
        // Finalize: merge, dedup, validate, save items
        console.log(
          `[Extraction] Finalizing Fig. ${workSection.figureNumber} for template ${templateId}`
        );

        const itemCount = await finalizeSectionExtraction(workSection.id);
        const completedCount = await prisma.inspectionSection.count({
          where: {
            templateId,
            status: { in: ["extracted", "failed"] },
          },
        });

        await releaseExtractionLease(templateId, {
          currentSectionIndex: completedCount,
        });

        return {
          templateId,
          status: "section_finalized",
          figureNumber: workSection.figureNumber,
          itemsExtracted: itemCount,
          progress: completedCount,
          phase: "section_finalization",
        };
      }

      // Extract one page of this section
      const currentPage = progress?.nextPageOffset ?? 0;
      const totalPages = workSection.pageNumbers.length;

      console.log(
        `[Extraction] Fig. ${workSection.figureNumber} page ${currentPage + 1}/${totalPages} for template ${templateId}`
      );

      const pageResult = await extractSectionPage(templateId, workSection.id);

      if (pageResult === "finalize") {
        // All pages done after this one — finalize in the same step
        const itemCount = await finalizeSectionExtraction(workSection.id);
        const completedCount = await prisma.inspectionSection.count({
          where: {
            templateId,
            status: { in: ["extracted", "failed"] },
          },
        });

        await releaseExtractionLease(templateId, {
          currentSectionIndex: completedCount,
        });

        return {
          templateId,
          status: "section_finalized",
          figureNumber: workSection.figureNumber,
          itemsExtracted: itemCount,
          progress: completedCount,
          pageProgress: { current: totalPages, total: totalPages },
          phase: "section_finalization",
        };
      }

      // More pages to go
      await releaseExtractionLease(templateId);

      return {
        templateId,
        status: "page_complete",
        figureNumber: workSection.figureNumber,
        pageProgress: { current: currentPage + 1, total: totalPages },
        phase: "page_extraction",
      };
    }

    await releaseExtractionLease(templateId);
    return {
      templateId,
      status: template.status,
    };
  } catch (error) {
    await releaseExtractionLease(templateId).catch(() => {});
    throw error;
  }
}
