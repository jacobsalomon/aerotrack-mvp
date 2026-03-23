// POST /api/library/[templateId]/extract
// Cron-driven extraction pipeline. Each invocation processes ONE step:
// - If template is pending_extraction → run Pass 1 (classify one batch of pages)
// - If template is extracting_details → run Pass 2 on one page of one section
// - When all sections are done → mark template as review_ready
//
// The cron job (/api/library/retry-stuck) calls this every minute.
// No self-calling, no after(), no fire-and-forget.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { runPass1Batch } from "@/lib/ai/cmm-extraction-pass1";
import { extractSectionPage, finalizeSectionExtraction } from "@/lib/ai/cmm-extraction-pass2";

// Pro plan allows up to 300s per serverless function invocation
export const maxDuration = 300;

const LEASE_DURATION_MS = 15 * 60 * 1000; // 15-minute lease (generous buffer over maxDuration)

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  // This endpoint is excluded from session middleware because it's called
  // server-to-server (fire-and-forget). Verify a shared secret instead.
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const authHeader = _request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId } = await params;
  console.log(`[Extraction] Invoked for template ${templateId}`);

  try {
    // Load template
    const template = await prisma.inspectionTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Skip if already done or failed
    if (
      template.status === "active" ||
      template.status === "review_ready" ||
      template.status === "archived"
    ) {
      return NextResponse.json({ status: template.status, message: "Already complete" });
    }

    // Try to acquire lease (prevent duplicate processing)
    const runnerToken = randomUUID();
    const now = new Date();

    const leaseResult = await prisma.inspectionTemplate.updateMany({
      where: {
        id: templateId,
        OR: [
          { extractionRunnerToken: null },
          { extractionLeaseExpiresAt: { lt: now } }, // Expired lease
        ],
      },
      data: {
        extractionRunnerToken: runnerToken,
        extractionLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
    });

    if (leaseResult.count === 0) {
      // Another worker has the lease
      return NextResponse.json({
        status: "locked",
        message: "Another extraction worker is processing this template",
      });
    }

    // Process based on current status
    if (
      template.status === "pending_extraction" ||
      template.status === "extracting_index"
    ) {
      // Run Pass 1 — classify pages one at a time for maximum accuracy.
      // Large PDFs are split across multiple invocations via self-calling.
      console.log(`[Extraction] Starting/continuing Pass 1 for template ${templateId}`);

      await prisma.inspectionTemplate.update({
        where: { id: templateId },
        data: { status: "extracting_index" },
      });

      const result = await runPass1Batch(templateId);

      if (result === 0) {
        // No sections found — likely not a valid CMM
        await prisma.inspectionTemplate.update({
          where: { id: templateId },
          data: {
            status: "extraction_failed",
            extractionRunnerToken: null,
            extractionLeaseExpiresAt: null,
          },
        });
        return NextResponse.json({
          status: "failed",
          message: "No inspection diagrams found in the PDF",
        });
      }

      // Release lease
      await prisma.inspectionTemplate.update({
        where: { id: templateId },
        data: {
          extractionRunnerToken: null,
          extractionLeaseExpiresAt: null,
          ...(result === "done" ? { currentSectionIndex: 0 } : {}),
        },
      });

      // Cron will pick this up next minute for the next step

      return NextResponse.json({
        status: result === "continue" ? "indexing_batch_complete" : "index_complete",
      });
    }

    if (
      template.status === "extracting_details" ||
      template.status === "extraction_failed"
    ) {
      // Find a section that needs work:
      // 1. Resume an "extracting" section (has saved page progress from prior invocation)
      // 2. Start a new "pending" section
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
        // All sections processed — check if any succeeded
        const sections = await prisma.inspectionSection.findMany({
          where: { templateId },
          select: { status: true },
        });

        const hasAnyExtracted = sections.some((s) => s.status === "extracted");

        await prisma.inspectionTemplate.update({
          where: { id: templateId },
          data: {
            status: hasAnyExtracted ? "review_ready" : "extraction_failed",
            extractionRunnerToken: null,
            extractionLeaseExpiresAt: null,
          },
        });

        console.log(
          `[Extraction] Complete for template ${templateId}: ${
            hasAnyExtracted ? "review_ready" : "extraction_failed"
          }`
        );

        return NextResponse.json({
          status: hasAnyExtracted ? "review_ready" : "extraction_failed",
          sections: sections.length,
        });
      }

      // Process ONE PAGE of this section, then self-call for the next.
      // Each page takes 35-75s with OCR — processing one at a time keeps
      // each invocation well under the 300s serverless limit.
      // extractSectionPage persists progress after each page, so if we
      // time out or crash, the next invocation resumes from where we left off.
      console.log(
        `[Extraction] Processing page of Fig. ${nextSection.figureNumber} for template ${templateId}`
      );

      const pageResult = await extractSectionPage(templateId, nextSection.id);

      if (pageResult === "finalize") {
        // All pages done — finalize this section (merge, dedup, validate)
        const itemCount = await finalizeSectionExtraction(nextSection.id);

        const completedCount = await prisma.inspectionSection.count({
          where: {
            templateId,
            status: { in: ["extracted", "failed"] },
          },
        });

        await prisma.inspectionTemplate.update({
          where: { id: templateId },
          data: {
            currentSectionIndex: completedCount,
            extractionRunnerToken: null,
            extractionLeaseExpiresAt: null,
          },
        });

        // Cron will pick up the next section

        return NextResponse.json({
          status: "section_complete",
          figureNumber: nextSection.figureNumber,
          itemsExtracted: itemCount,
          progress: completedCount,
        });
      }

      // More pages remain — release lease and self-call for next page
      // Read updated progress for diagnostic info
      const updatedSection = await prisma.inspectionSection.findUnique({
        where: { id: nextSection.id },
        select: { pageNumbers: true, pass2Progress: true },
      });
      const p2 = updatedSection?.pass2Progress as { nextPageOffset: number; pageResults: Array<{ ocrResult?: { source: string; fullText: string; tables: unknown[]; processingTimeMs: number } }> } | null;
      const lastPage = p2?.pageResults?.[p2.pageResults.length - 1];

      await prisma.inspectionTemplate.update({
        where: { id: templateId },
        data: {
          extractionRunnerToken: null,
          extractionLeaseExpiresAt: null,
        },
      });

      // Cron will pick up the next page

      return NextResponse.json({
        status: "page_complete",
        figureNumber: nextSection.figureNumber,
        pageProgress: `${p2?.nextPageOffset ?? "?"}/${updatedSection?.pageNumbers.length ?? "?"}`,
        ocr: lastPage?.ocrResult ? {
          source: lastPage.ocrResult.source,
          chars: lastPage.ocrResult.fullText.length,
          tables: lastPage.ocrResult.tables.length,
          timeMs: lastPage.ocrResult.processingTimeMs,
        } : null,
      });
    }

    // Unknown status — release lease
    await prisma.inspectionTemplate.update({
      where: { id: templateId },
      data: {
        extractionRunnerToken: null,
        extractionLeaseExpiresAt: null,
      },
    });

    return NextResponse.json({ status: template.status });
  } catch (error) {
    console.error(`[Extraction] Error for template ${templateId}:`, error);

    // Release lease on error
    await prisma.inspectionTemplate
      .update({
        where: { id: templateId },
        data: {
          extractionRunnerToken: null,
          extractionLeaseExpiresAt: null,
        },
      })
      .catch(() => {}); // Don't fail if this update fails

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    );
  }
}

