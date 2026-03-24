// Core extraction logic — called directly by the cron job.
// No HTTP, no fetch between serverless functions, no after().
//
// Processes as many steps as possible within a soft deadline,
// checkpointing to DB after each step. If the function crashes
// or times out, the next cron invocation resumes from the last
// checkpoint.

import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";
import { runPass1Batch } from "@/lib/ai/cmm-extraction-pass1";
import { extractSectionPage, finalizeSectionExtraction } from "@/lib/ai/cmm-extraction-pass2";

// Lease = maxDuration (300s) + 1 min buffer. If the function dies,
// recovery happens in ~6 min instead of 15.
const LEASE_DURATION_MS = 6 * 60 * 1000;

// Stop taking new work after this many seconds so we don't get killed
// mid-step by the 300s hard limit.
const SOFT_DEADLINE_MS = 240 * 1000;

export interface ExtractionResult {
  templateId: string;
  stepsCompleted: number;
  lastStatus: string;
  detail?: string;
  elapsedMs: number;
}

/**
 * Process as many extraction steps as possible for one template,
 * up to the soft deadline. Each step is checkpointed to the DB.
 */
export async function processTemplate(templateId: string): Promise<ExtractionResult> {
  const startTime = Date.now();
  let stepsCompleted = 0;
  let lastStatus = "started";
  let detail: string | undefined;

  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    return { templateId, stepsCompleted: 0, lastStatus: "not_found", elapsedMs: 0 };
  }

  if (["active", "review_ready", "archived"].includes(template.status)) {
    return { templateId, stepsCompleted: 0, lastStatus: "already_complete", elapsedMs: 0 };
  }

  // Acquire fenced lease — the token is checked on every release
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
    return { templateId, stepsCompleted: 0, lastStatus: "locked", elapsedMs: 0 };
  }

  // Download PDF once — reused across all steps in this invocation
  let pdfBytes: Buffer | undefined;
  try {
    const res = await fetch(template.sourceFileUrl);
    if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
    pdfBytes = Buffer.from(await res.arrayBuffer());
    console.log(`[extract] Downloaded PDF (${(pdfBytes.length / 1024 / 1024).toFixed(1)} MB) for ${template.title}`);
  } catch (err) {
    console.error(`[extract] PDF download failed for ${template.title}:`, err);
    await releaseLease(templateId, runnerToken);
    return { templateId, stepsCompleted: 0, lastStatus: "pdf_download_failed", elapsedMs: Date.now() - startTime };
  }

  try {
    // Loop: process steps until soft deadline or completion
    while (Date.now() - startTime < SOFT_DEADLINE_MS) {
      // Reload template status (may have changed between steps)
      const current = await prisma.inspectionTemplate.findUnique({
        where: { id: templateId },
        select: { status: true, title: true },
      });
      if (!current) break;

      // ── Pass 1: Classify pages ────────────────────────────────
      if (current.status === "pending_extraction" || current.status === "extracting_index") {
        await prisma.inspectionTemplate.update({
          where: { id: templateId },
          data: { status: "extracting_index" },
        });

        const result = await runPass1Batch(templateId, pdfBytes);
        stepsCompleted++;

        if (result === 0) {
          lastStatus = "failed";
          detail = "No inspection diagrams found";
          await releaseLease(templateId, runnerToken, { status: "extraction_failed" });
          break;
        }

        if (result === "done") {
          // Pass 1 complete — transition to Pass 2
          lastStatus = "pass1_complete";
          // Don't release lease — continue to Pass 2 in the same invocation
          await prisma.inspectionTemplate.update({
            where: { id: templateId },
            data: { currentSectionIndex: 0 },
          });
          console.log(`[extract] Pass 1 complete for ${current.title}, continuing to Pass 2`);
          continue;
        }

        // More batches to classify
        lastStatus = "pass1_batch_done";
        console.log(`[extract] Pass 1 batch done for ${current.title}, continuing...`);
        continue;
      }

      // ── Pass 2: Extract section pages ─────────────────────────
      if (current.status === "extracting_details" || current.status === "extraction_failed") {
        // Find section needing work
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
          const hasAny = sections.some((s) => s.status === "extracted");
          lastStatus = hasAny ? "review_ready" : "extraction_failed";
          await releaseLease(templateId, runnerToken, { status: lastStatus });
          console.log(`[extract] Complete: ${current.title} → ${lastStatus}`);
          break;
        }

        const pageResult = await extractSectionPage(templateId, nextSection.id, pdfBytes);
        stepsCompleted++;

        if (pageResult === "finalize") {
          const itemCount = await finalizeSectionExtraction(nextSection.id);
          const completedCount = await prisma.inspectionSection.count({
            where: { templateId, status: { in: ["extracted", "failed"] } },
          });
          await prisma.inspectionTemplate.update({
            where: { id: templateId },
            data: { currentSectionIndex: completedCount },
          });
          lastStatus = "section_done";
          detail = `Fig. ${nextSection.figureNumber}: ${itemCount} items`;
          console.log(`[extract] Section done: ${detail}`);
          continue;
        }

        lastStatus = "page_done";
        detail = `Fig. ${nextSection.figureNumber}`;
        continue;
      }

      // Unknown status — bail
      lastStatus = "unknown_status";
      break;
    }

    // Release lease (fenced — only if we still own it)
    if (lastStatus !== "review_ready" && lastStatus !== "extraction_failed" && lastStatus !== "failed") {
      await releaseLease(templateId, runnerToken);
    }

  } catch (error) {
    console.error(`[extract] Error processing ${template.title}:`, error);
    lastStatus = "error";
    detail = error instanceof Error ? error.message : "unknown";
    await releaseLease(templateId, runnerToken).catch(() => {});
  }

  const elapsed = Date.now() - startTime;
  console.log(`[extract] ${template.title}: ${stepsCompleted} steps in ${(elapsed / 1000).toFixed(0)}s → ${lastStatus}`);
  return { templateId, stepsCompleted, lastStatus, detail, elapsedMs: elapsed };
}

/** Release the lease ONLY if we still own it (fenced by runnerToken). */
async function releaseLease(
  templateId: string,
  runnerToken: string,
  extraData: Record<string, unknown> = {},
) {
  await prisma.inspectionTemplate.updateMany({
    where: {
      id: templateId,
      extractionRunnerToken: runnerToken, // Fenced: only release our own lease
    },
    data: {
      extractionRunnerToken: null,
      extractionLeaseExpiresAt: null,
      ...extraData,
    },
  });
}
