// Shared helpers for the CMM-guided inspection workflow (Layer 2)
// Tolerance checking, progress aggregation, read-only guards

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// ── Read-only guard ──────────────────────────────────
// Checks if a signed-off session is being modified. Returns a 403 response or null.
export function guardSignedOff(session: { signedOffAt: Date | null }) {
  if (session.signedOffAt) {
    return NextResponse.json(
      { success: false, error: "This inspection has been signed off and is read-only" },
      { status: 403 }
    );
  }
  return null;
}

// ── Tolerance checking ───────────────────────────────
// Returns "in_spec", "out_of_spec", or null if no spec to check against
export function checkInspectionTolerance(
  value: number,
  specLow: number | null,
  specHigh: number | null
): "in_spec" | "out_of_spec" | null {
  if (specLow == null && specHigh == null) return null;
  if (specLow != null && value < specLow) return "out_of_spec";
  if (specHigh != null && value > specHigh) return "out_of_spec";
  return "in_spec";
}

// ── Progress aggregation ─────────────────────────────
// Computes completion stats for a session
export async function getInspectionProgressSummary(captureSessionId: string) {
  const progress = await prisma.inspectionProgress.findMany({
    where: { captureSessionId },
    select: { status: true, result: true },
  });

  const total = progress.length;
  const done = progress.filter((p) => p.status === "done").length;
  const problem = progress.filter((p) => p.status === "problem").length;
  const skipped = progress.filter((p) => p.status === "skipped").length;
  const pending = progress.filter((p) => p.status === "pending").length;

  const findings = await prisma.inspectionFinding.count({
    where: { captureSessionId },
  });

  return { total, done, problem, skipped, pending, findings };
}

// ── Section-level progress ───────────────────────────
// Computes progress per section for the section tabs
export async function getSectionProgress(
  captureSessionId: string,
  templateId: string
) {
  const sections = await prisma.inspectionSection.findMany({
    where: { templateId },
    select: {
      id: true,
      title: true,
      figureNumber: true,
      sortOrder: true,
      referenceImageUrls: true,
      itemCount: true,
      items: {
        select: { id: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const progress = await prisma.inspectionProgress.findMany({
    where: { captureSessionId },
    select: {
      inspectionItemId: true,
      status: true,
    },
  });

  const findingCounts = await prisma.inspectionFinding.groupBy({
    by: ["inspectionSectionId"],
    where: { captureSessionId },
    _count: true,
  });
  const findingMap = Object.fromEntries(
    findingCounts.map((f) => [f.inspectionSectionId, f._count])
  );

  // Group all progress records by itemId (multi-instance items have N records per item)
  const progressByItem = new Map<string, { status: string }[]>();
  for (const p of progress) {
    const existing = progressByItem.get(p.inspectionItemId) || [];
    existing.push(p);
    progressByItem.set(p.inspectionItemId, existing);
  }

  return sections.map((section) => {
    const itemIds = section.items.map((i) => i.id);
    // Count all progress records (instances) for items in this section
    const sectionProgress = itemIds.flatMap((id) => progressByItem.get(id) || []);
    const done = sectionProgress.filter((p) => p.status === "done").length;
    const problem = sectionProgress.filter((p) => p.status === "problem").length;
    const skipped = sectionProgress.filter((p) => p.status === "skipped").length;
    const total = sectionProgress.length;
    const findings = findingMap[section.id] ?? 0;

    // Section status: gray (not started), blue (in progress), green (complete), red (has problems)
    let sectionStatus: "not_started" | "in_progress" | "complete" | "has_problems" = "not_started";
    if (problem > 0 || findings > 0) sectionStatus = "has_problems";
    else if (done + skipped >= total && total > 0) sectionStatus = "complete";
    else if (done > 0 || skipped > 0) sectionStatus = "in_progress";

    return {
      id: section.id,
      title: section.title,
      figureNumber: section.figureNumber,
      sortOrder: section.sortOrder,
      referenceImageUrls: section.referenceImageUrls,
      total,
      done,
      problem,
      skipped,
      findings,
      sectionStatus,
    };
  });
}

// ── Load session with org check ──────────────────────
// Common pattern: load session and verify org ownership
export async function loadInspectionSession(
  sessionId: string,
  organizationId: string
) {
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    include: {
      inspectionTemplate: {
        include: {
          sections: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
      user: {
        select: { id: true, name: true, firstName: true, lastName: true, badgeNumber: true },
      },
    },
  });

  if (!session || session.organizationId !== organizationId) {
    return null;
  }

  if (session.sessionType !== "inspection") {
    return null;
  }

  return session;
}
