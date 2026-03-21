// POST /api/library/[templateId]/extract
// Self-calling extraction pipeline. Each invocation processes ONE step:
// - If template is pending_extraction → run Pass 1 (index pages)
// - If template is extracting_details → run Pass 2 on the next pending section
// - When all sections are done → mark template as review_ready
//
// After each step, the route calls itself to process the next step.
// This keeps each serverless invocation under 60 seconds.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { runPass1 } from "@/lib/ai/cmm-extraction-pass1";
import { extractSection } from "@/lib/ai/cmm-extraction-pass2";

const LEASE_DURATION_MS = 2 * 60 * 1000; // 2-minute lease

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;

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
      // Run Pass 1 — classify pages and create sections
      console.log(`[Extraction] Starting Pass 1 for template ${templateId}`);

      await prisma.inspectionTemplate.update({
        where: { id: templateId },
        data: { status: "extracting_index" },
      });

      const sectionCount = await runPass1(templateId);

      if (sectionCount === 0) {
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

      // Release lease and trigger next step
      await prisma.inspectionTemplate.update({
        where: { id: templateId },
        data: {
          extractionRunnerToken: null,
          extractionLeaseExpiresAt: null,
          currentSectionIndex: 0,
        },
      });

      // Self-call to start Pass 2
      triggerNextStep(templateId);

      return NextResponse.json({
        status: "index_complete",
        sectionsFound: sectionCount,
      });
    }

    if (
      template.status === "extracting_details" ||
      template.status === "extraction_failed"
    ) {
      // Run Pass 2 on the next pending section
      const nextSection = await prisma.inspectionSection.findFirst({
        where: {
          templateId,
          status: "pending",
        },
        orderBy: { sortOrder: "asc" },
      });

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

      // Process this section
      console.log(
        `[Extraction] Processing Fig. ${nextSection.figureNumber} for template ${templateId}`
      );

      const itemCount = await extractSection(templateId, nextSection.id);

      // Update progress counter
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

      // Self-call to process the next section
      triggerNextStep(templateId);

      return NextResponse.json({
        status: "section_complete",
        figureNumber: nextSection.figureNumber,
        itemsExtracted: itemCount,
        progress: completedCount,
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

// Fire-and-forget self-call to process the next step
function triggerNextStep(templateId: string) {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  fetch(`${baseUrl}${basePath}/api/library/${templateId}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch((err) => {
    console.error(`[Extraction] Failed to trigger next step:`, err);
  });
}
