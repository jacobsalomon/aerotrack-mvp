// Core extraction logic — processes ONE step of a template's extraction.
// Called directly by the cron job (no HTTP, no fetch, no after()).
//
// Each call does one of:
// - Classify one batch of pages (Pass 1)
// - Extract one page of one section (Pass 2)
// - Finalize a section
// - Mark template complete
//
// Returns a status string for logging. Progress is saved to the DB after
// each step, so if the function crashes, the next call resumes from the
// last checkpoint.

import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";
import { runPass1Batch } from "@/lib/ai/cmm-extraction-pass1";
import { extractSectionPage, finalizeSectionExtraction } from "@/lib/ai/cmm-extraction-pass2";

const LEASE_DURATION_MS = 15 * 60 * 1000;

export interface ExtractionResult {
  templateId: string;
  status: string;
  detail?: string;
}

export async function processOneStep(templateId: string): Promise<ExtractionResult> {
  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    return { templateId, status: "not_found" };
  }

  // Skip if already done
  if (["active", "review_ready", "archived"].includes(template.status)) {
    return { templateId, status: "already_complete" };
  }

  // Acquire lease (prevent duplicate processing from overlapping cron calls)
  const runnerToken = randomUUID();
  const now = new Date();
  const leaseResult = await prisma.inspectionTemplate.updateMany({
    where: {
      id: templateId,
      OR: [
        { extractionRunnerToken: null },
        { extractionLeaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      extractionRunnerToken: runnerToken,
      extractionLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
    },
  });

  if (leaseResult.count === 0) {
    return { templateId, status: "locked" };
  }

  try {
    // ── Pass 1: Classify pages ──────────────────────────────────────
    if (template.status === "pending_extraction" || template.status === "extracting_index") {
      console.log(`[extract] Pass 1 for ${template.title} (${templateId})`);

      await prisma.inspectionTemplate.update({
        where: { id: templateId },
        data: { status: "extracting_index" },
      });

      const result = await runPass1Batch(templateId);

      if (result === 0) {
        await releaseLease(templateId, { status: "extraction_failed" });
        return { templateId, status: "failed", detail: "No inspection diagrams found" };
      }

      await releaseLease(templateId, result === "done" ? { currentSectionIndex: 0 } : {});
      return { templateId, status: result === "continue" ? "pass1_batch_done" : "pass1_complete" };
    }

    // ── Pass 2: Extract section pages ───────────────────────────────
    if (template.status === "extracting_details" || template.status === "extraction_failed") {
      // Find a section needing work (resume in-progress first, then pending)
      const nextSection =
        (await prisma.inspectionSection.findFirst({
          where: { templateId, status: "extracting" },
          orderBy: { sortOrder: "asc" },
        })) ||
        (await prisma.inspectionSection.findFirst({
          where: { templateId, status: "pending" },
          orderBy: { sortOrder: "asc" },
        }));

      if (!nextSection) {
        // All sections done — mark template complete
        const sections = await prisma.inspectionSection.findMany({
          where: { templateId },
          select: { status: true },
        });
        const hasAnyExtracted = sections.some((s) => s.status === "extracted");
        const finalStatus = hasAnyExtracted ? "review_ready" : "extraction_failed";

        await releaseLease(templateId, { status: finalStatus });
        console.log(`[extract] Complete: ${template.title} → ${finalStatus}`);
        return { templateId, status: finalStatus };
      }

      // Process one page
      console.log(`[extract] Pass 2: Fig. ${nextSection.figureNumber} of ${template.title}`);
      const pageResult = await extractSectionPage(templateId, nextSection.id);

      if (pageResult === "finalize") {
        const itemCount = await finalizeSectionExtraction(nextSection.id);
        const completedCount = await prisma.inspectionSection.count({
          where: { templateId, status: { in: ["extracted", "failed"] } },
        });

        await releaseLease(templateId, { currentSectionIndex: completedCount });
        return { templateId, status: "section_done", detail: `Fig. ${nextSection.figureNumber}: ${itemCount} items` };
      }

      await releaseLease(templateId);
      return { templateId, status: "page_done", detail: `Fig. ${nextSection.figureNumber}` };
    }

    // Unknown status
    await releaseLease(templateId);
    return { templateId, status: "unknown_status", detail: template.status };

  } catch (error) {
    console.error(`[extract] Error processing ${template.title}:`, error);
    await releaseLease(templateId).catch(() => {});
    return { templateId, status: "error", detail: error instanceof Error ? error.message : "unknown" };
  }
}

async function releaseLease(templateId: string, extraData: Record<string, unknown> = {}) {
  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      extractionRunnerToken: null,
      extractionLeaseExpiresAt: null,
      ...extraData,
    },
  });
}
