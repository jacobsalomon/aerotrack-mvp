// Core extraction logic — called directly by the cron job.
// No HTTP, no fetch between serverless functions, no after().
//
// Architecture: two modes of operation
//   Pass 1 (page classification): Template-level lease, sequential batches
//   Pass 2 (section extraction):  Section-level leases, parallel workers
//
// Each cron tick claims ONE section and processes all its pages within
// the soft deadline. Multiple cron ticks run concurrently, each working
// on a different section of the same template.

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

// Max retries on AI rate limits before releasing the section lease
const MAX_RATE_LIMIT_RETRIES = 3;

// Sections stuck in "extracting" with an expired lease are reclaimable
const STALE_THRESHOLD_MS = 3 * 60 * 1000;

export interface ExtractionResult {
  templateId: string;
  sectionId?: string;
  stepsCompleted: number;
  lastStatus: string;
  detail?: string;
  elapsedMs: number;
}

/**
 * Process Pass 1 (page classification) for a template.
 * Uses template-level leasing — only one worker runs Pass 1 at a time.
 */
export async function processPass1(templateId: string): Promise<ExtractionResult> {
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

  // Acquire template-level lease for Pass 1
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

  // Download PDF once
  let pdfBytes: Buffer | undefined;
  try {
    const res = await fetch(template.sourceFileUrl);
    if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
    pdfBytes = Buffer.from(await res.arrayBuffer());
    console.log(`[extract] Downloaded PDF (${(pdfBytes.length / 1024 / 1024).toFixed(1)} MB) for ${template.title}`);
  } catch (err) {
    console.error(`[extract] PDF download failed for ${template.title}:`, err);
    await releaseTemplateLease(templateId, runnerToken);
    return { templateId, stepsCompleted: 0, lastStatus: "pdf_download_failed", elapsedMs: Date.now() - startTime };
  }

  try {
    // Loop through Pass 1 batches until done or soft deadline
    while (Date.now() - startTime < SOFT_DEADLINE_MS) {
      await prisma.inspectionTemplate.update({
        where: { id: templateId },
        data: { status: "extracting_index" },
      });

      const result = await runPass1Batch(templateId, pdfBytes);
      stepsCompleted++;

      if (result === 0) {
        lastStatus = "failed";
        detail = "No inspection diagrams found";
        await releaseTemplateLease(templateId, runnerToken, { status: "extraction_failed" });
        break;
      }

      if (result === "done") {
        // Pass 1 complete — transition to extracting_details for parallel Pass 2
        lastStatus = "pass1_complete";
        await releaseTemplateLease(templateId, runnerToken, {
          status: "extracting_details",
          currentSectionIndex: 0,
        });
        console.log(`[extract] Pass 1 complete for ${template.title} — sections ready for parallel extraction`);
        break;
      }

      // More batches to classify
      lastStatus = "pass1_batch_done";
      console.log(`[extract] Pass 1 batch done for ${template.title}, continuing...`);
      continue;
    }

    // Release lease if we hit the soft deadline without finishing
    if (lastStatus !== "pass1_complete" && lastStatus !== "failed") {
      await releaseTemplateLease(templateId, runnerToken);
    }
  } catch (error) {
    console.error(`[extract] Pass 1 error for ${template.title}:`, error);
    lastStatus = "error";
    detail = error instanceof Error ? error.message : "unknown";
    await releaseTemplateLease(templateId, runnerToken).catch(() => {});
  }

  const elapsed = Date.now() - startTime;
  console.log(`[extract] Pass 1: ${template.title}: ${stepsCompleted} steps in ${(elapsed / 1000).toFixed(0)}s → ${lastStatus}`);
  return { templateId, stepsCompleted, lastStatus, detail, elapsedMs: elapsed };
}

/**
 * Claim and process one section of a template.
 * Uses section-level leasing — multiple workers can run in parallel.
 * Each worker processes all pages of its claimed section within the soft deadline.
 */
export async function processSection(templateId: string): Promise<ExtractionResult> {
  const startTime = Date.now();
  let stepsCompleted = 0;
  let lastStatus = "started";
  let detail: string | undefined;
  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, title: true, sourceFileUrl: true, status: true },
  });

  if (!template) {
    return { templateId, stepsCompleted: 0, lastStatus: "not_found", elapsedMs: 0 };
  }

  // Revive stale sections first (any worker can do this)
  await reviveStaleSections(templateId);

  // Claim a section with a fenced lease
  const runnerToken = randomUUID();
  const now = new Date();
  const claimedSection = await claimNextSection(templateId, runnerToken, now);

  if (!claimedSection) {
    // No sections available — check if template is complete
    await checkTemplateCompletion(templateId, template.title);
    return { templateId, stepsCompleted: 0, lastStatus: "no_sections_available", elapsedMs: 0 };
  }

  const claimedSectionId = claimedSection.id;
  console.log(`[extract] Worker claimed Fig. ${claimedSection.figureNumber} (${claimedSection.pageNumbers.length} pages) for ${template.title}`);

  // Download PDF
  let pdfBytes: Buffer;
  try {
    const res = await fetch(template.sourceFileUrl);
    if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
    pdfBytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error(`[extract] PDF download failed:`, err);
    await releaseSectionLease(claimedSectionId, runnerToken);
    return { templateId, sectionId: claimedSectionId, stepsCompleted: 0, lastStatus: "pdf_download_failed", elapsedMs: Date.now() - startTime };
  }

  try {
    // Process all pages of this section within the soft deadline
    let rateLimitRetries = 0;

    while (Date.now() - startTime < SOFT_DEADLINE_MS) {
      try {
        const pageResult = await extractSectionPage(templateId, claimedSectionId, pdfBytes);
        stepsCompleted++;
        rateLimitRetries = 0; // Reset on success

        if (pageResult === "finalize") {
          // All pages done — finalize this section
          const itemCount = await finalizeSectionExtraction(claimedSectionId);
          lastStatus = "section_done";
          detail = `Fig. ${claimedSection.figureNumber}: ${itemCount} items`;
          console.log(`[extract] Section done: ${detail}`);

          // Release section lease
          await releaseSectionLease(claimedSectionId, runnerToken);

          // Update template progress and check if all sections are complete
          await updateTemplateProgress(templateId);
          await checkTemplateCompletion(templateId, template.title);
          break;
        }

        // More pages to go — continue within this invocation
        lastStatus = "page_done";
        detail = `Fig. ${claimedSection.figureNumber}`;
        continue;

      } catch (error) {
        // Check if this is a rate limit error
        if (isRateLimitError(error)) {
          rateLimitRetries++;
          console.warn(`[extract] Rate limit hit (attempt ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}) for Fig. ${claimedSection.figureNumber}`);

          if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
            // Give up — release lease so another worker can try later
            lastStatus = "rate_limited";
            detail = `Fig. ${claimedSection.figureNumber}: released after ${MAX_RATE_LIMIT_RETRIES} rate limit retries`;
            console.warn(`[extract] ${detail}`);
            break;
          }

          // Exponential backoff: 1s, 2s, 4s
          const backoffMs = 1000 * Math.pow(2, rateLimitRetries - 1);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        // Non-rate-limit error — let extractSectionPage's internal retry handle it
        // The error already logged by pass2, just re-throw to exit the loop
        throw error;
      }
    }

    // Release section lease if we hit the soft deadline or rate limit
    if (lastStatus !== "section_done") {
      await releaseSectionLease(claimedSectionId, runnerToken);
      if (lastStatus === "page_done") {
        lastStatus = "soft_deadline";
        detail = `Fig. ${claimedSection.figureNumber}: will resume on next tick`;
      }
    }
  } catch (error) {
    console.error(`[extract] Error processing Fig. ${claimedSection.figureNumber}:`, error);
    lastStatus = "error";
    detail = error instanceof Error ? error.message : "unknown";
    await releaseSectionLease(claimedSectionId, runnerToken).catch(() => {});
  }

  const elapsed = Date.now() - startTime;
  console.log(`[extract] ${template.title} Fig. ${claimedSection.figureNumber}: ${stepsCompleted} pages in ${(elapsed / 1000).toFixed(0)}s → ${lastStatus}`);
  return { templateId, sectionId: claimedSectionId, stepsCompleted, lastStatus, detail, elapsedMs: elapsed };
}

// ── Section claiming ──────────────────────────────────────────────────

/**
 * Atomically claim the next available section using a fenced lease.
 * Priority: in-progress ("extracting" with expired lease) > pending.
 */
async function claimNextSection(
  templateId: string,
  runnerToken: string,
  now: Date,
): Promise<{ id: string; figureNumber: string; pageNumbers: number[] } | null> {
  // Find candidates: sections that are claimable
  const candidates = await prisma.inspectionSection.findMany({
    where: {
      templateId,
      status: { in: ["extracting", "pending"] },
      OR: [
        { extractionRunnerToken: null },
        { extractionLeaseExpiresAt: { lt: now } },
      ],
    },
    orderBy: [
      // Prefer resuming in-progress sections over starting new ones
      { status: "asc" }, // "extracting" < "pending" alphabetically
      { sortOrder: "asc" },
    ],
    select: { id: true, figureNumber: true, pageNumbers: true, status: true },
    take: 5, // Check a few in case of race conditions
  });

  // Try to claim each candidate atomically
  for (const candidate of candidates) {
    const leaseResult = await prisma.inspectionSection.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { extractionRunnerToken: null },
          { extractionLeaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        extractionRunnerToken: runnerToken,
        extractionLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
        status: "extracting",
      },
    });

    if (leaseResult.count > 0) {
      return { id: candidate.id, figureNumber: candidate.figureNumber, pageNumbers: candidate.pageNumbers };
    }
    // Another worker claimed it first — try next candidate
  }

  return null;
}

// ── Stale section recovery ────────────────────────────────────────────

/**
 * Revive sections stuck in "extracting" with expired leases.
 * If all pages are done, finalize. Otherwise clear the lease so it's claimable.
 */
async function reviveStaleSections(templateId: string) {
  const staleBefore = new Date(Date.now() - STALE_THRESHOLD_MS);

  const staleSections = await prisma.inspectionSection.findMany({
    where: {
      templateId,
      status: "extracting",
      extractionLeaseExpiresAt: { lt: staleBefore },
    },
    select: { id: true, figureNumber: true, pageNumbers: true, pass2Progress: true },
  });

  for (const section of staleSections) {
    const progress = section.pass2Progress as { nextPageOffset: number } | null;
    const allPagesDone = progress && progress.nextPageOffset >= section.pageNumbers.length;

    if (allPagesDone) {
      console.log(`[extract] Stale section Fig. ${section.figureNumber} has all pages done — finalizing`);
      try {
        await finalizeSectionExtraction(section.id);
      } catch (err) {
        console.error(`[extract] Failed to finalize stale section ${section.id}:`, err);
        await prisma.inspectionSection.update({
          where: { id: section.id },
          data: { status: "failed", extractionRunnerToken: null, extractionLeaseExpiresAt: null },
        });
      }
    } else {
      // Clear lease so another worker can claim it — progress is preserved
      await prisma.inspectionSection.update({
        where: { id: section.id },
        data: {
          extractionRunnerToken: null,
          extractionLeaseExpiresAt: null,
          // Keep status as "extracting" — claimNextSection handles both statuses
        },
      });
      console.warn(`[extract] Revived stale section Fig. ${section.figureNumber} (progress preserved)`);
    }
  }
}

// ── Template completion ───────────────────────────────────────────────

/** Update template progress metadata (sections completed / total). */
async function updateTemplateProgress(templateId: string) {
  const sections = await prisma.inspectionSection.findMany({
    where: { templateId },
    select: { status: true },
  });

  const completed = sections.filter(s => s.status === "extracted" || s.status === "failed").length;
  const total = sections.length;

  // Merge progress into existing extraction metadata
  const existing = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    select: { extractionMetadata: true },
  });
  const existingMeta = (existing?.extractionMetadata ?? {}) as Record<string, unknown>;

  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      currentSectionIndex: completed,
      extractionMetadata: {
        ...existingMeta,
        sectionsCompleted: completed,
        sectionsTotal: total,
      },
    },
  });
}

/**
 * Check if all sections are terminal. If so, transition the template
 * to review_ready or extraction_failed.
 */
async function checkTemplateCompletion(templateId: string, title: string) {
  const sections = await prisma.inspectionSection.findMany({
    where: { templateId },
    select: { status: true },
  });

  // If any section is still pending or extracting, template isn't done
  const hasRemaining = sections.some(s => s.status === "pending" || s.status === "extracting");
  if (hasRemaining) return;

  const hasExtracted = sections.some(s => s.status === "extracted");
  const newStatus = hasExtracted ? "review_ready" : "extraction_failed";

  // Atomic transition — only if still in extracting_details
  const updated = await prisma.inspectionTemplate.updateMany({
    where: {
      id: templateId,
      status: "extracting_details",
    },
    data: {
      status: newStatus,
      extractionRunnerToken: null,
      extractionLeaseExpiresAt: null,
    },
  });

  if (updated.count > 0) {
    console.log(`[extract] Template complete: ${title} → ${newStatus} (${sections.length} sections)`);
  }
}

// ── Lease helpers ─────────────────────────────────────────────────────

/** Release template-level lease (Pass 1 only). Fenced by runnerToken. */
async function releaseTemplateLease(
  templateId: string,
  runnerToken: string,
  extraData: Record<string, unknown> = {},
) {
  await prisma.inspectionTemplate.updateMany({
    where: {
      id: templateId,
      extractionRunnerToken: runnerToken,
    },
    data: {
      extractionRunnerToken: null,
      extractionLeaseExpiresAt: null,
      ...extraData,
    },
  });
}

/** Release section-level lease (Pass 2). Fenced by runnerToken. */
async function releaseSectionLease(
  sectionId: string,
  runnerToken: string,
) {
  await prisma.inspectionSection.updateMany({
    where: {
      id: sectionId,
      extractionRunnerToken: runnerToken,
    },
    data: {
      extractionRunnerToken: null,
      extractionLeaseExpiresAt: null,
    },
  });
}

/** Check if an error is a rate limit (429) from AI providers. */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
      return true;
    }
    // Check for nested status codes (common in AI SDK errors)
    const anyErr = error as unknown as Record<string, unknown>;
    if (anyErr.status === 429 || anyErr.statusCode === 429) {
      return true;
    }
  }
  return false;
}

// ── Legacy export for backward compatibility ──────────────────────────

/**
 * @deprecated Use processPass1() or processSection() directly.
 * Kept for any callers that still reference processTemplate.
 */
export async function processTemplate(templateId: string): Promise<ExtractionResult> {
  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    select: { status: true },
  });

  if (!template) {
    return { templateId, stepsCompleted: 0, lastStatus: "not_found", elapsedMs: 0 };
  }

  // Route to the appropriate handler
  if (template.status === "pending_extraction" || template.status === "extracting_index") {
    return processPass1(templateId);
  }

  return processSection(templateId);
}
