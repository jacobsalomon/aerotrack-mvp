// CMM extraction orchestration — template discovery and step execution.
// Used by the manual extraction trigger API and legacy callers.
// The cron endpoint now calls extraction-runner.ts directly for parallel processing.

import { prisma } from "@/lib/db";

export const EXTRACTION_STEP_MAX_DURATION_MS = 5 * 60 * 1000;
export const EXTRACTION_STALE_THRESHOLD_MS = 3 * 60 * 1000;

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

export async function findTemplatesReadyForExtraction(options: {
  limit?: number;
  templateId?: string;
} = {}) {
  return prisma.inspectionTemplate.findMany({
    where: {
      ...(options.templateId ? { id: options.templateId } : {}),
      status: { in: [...POLLABLE_TEMPLATE_STATUSES] },
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

/**
 * Run a single extraction step for a template.
 * This is the legacy single-step function used by the manual trigger API.
 * For parallel processing, the cron endpoint uses extraction-runner.ts directly.
 */
export async function runTemplateExtractionStep(
  templateId: string
): Promise<ExtractionStepResult> {
  const { processTemplate } = await import("@/lib/extraction-runner");

  const existingTemplate = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, status: true },
  });

  if (!existingTemplate) {
    return { templateId, status: "not_found", message: "Template not found" };
  }

  if (TERMINAL_TEMPLATE_STATUSES.has(existingTemplate.status)) {
    return {
      templateId,
      status: "already_complete",
      templateStatus: existingTemplate.status,
      message: "Already complete",
    };
  }

  // Delegate to the unified runner
  const result = await processTemplate(templateId);

  return {
    templateId,
    status: result.lastStatus,
    message: result.detail,
    templateStatus: result.lastStatus,
  };
}
