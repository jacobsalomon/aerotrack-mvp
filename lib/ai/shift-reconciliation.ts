// End-of-shift reconciliation — reviews all measurements for consistency
// Checks for gaps, conflicts, spec completeness, and generates a summary.

import { prisma } from "@/lib/db";
import { getSpecProgress } from "@/lib/measurement-ledger";

export interface ReconciliationResult {
  shiftId: string;
  summary: string;
  totalMeasurements: number;
  byStatus: Record<string, number>;
  flaggedItems: Array<{ id: string; parameterName: string; reason: string }>;
  specCompleteness: {
    specName: string;
    totalRequired: number;
    captured: number;
    missing: number;
    missingItems: string[];
  } | null;
  outOfTolerance: Array<{
    id: string;
    parameterName: string;
    value: number;
    unit: string;
    toleranceLow: number | null;
    toleranceHigh: number | null;
  }>;
  recommendations: string[];
}

export async function reconcileShift(shiftId: string): Promise<ReconciliationResult> {
  // Load the shift first (we need startedAt for duration calculation)
  const shift = await prisma.shiftSession.findUnique({ where: { id: shiftId } });
  if (!shift) throw new Error("Shift not found");

  // Mark shift as reconciling
  await prisma.shiftSession.update({
    where: { id: shiftId },
    data: { status: "reconciling" },
  });

  // Get all measurements for this shift
  const measurements = await prisma.measurement.findMany({
    where: { shiftSessionId: shiftId },
    include: { sources: true },
    orderBy: { sequenceInShift: "asc" },
  });

  // Status breakdown
  const byStatus: Record<string, number> = {};
  for (const m of measurements) {
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
  }

  // Flagged items
  const flaggedItems = measurements
    .filter((m) => m.status === "flagged")
    .map((m) => ({
      id: m.id,
      parameterName: m.parameterName,
      reason: m.flagReason || "Unknown reason",
    }));

  // Out of tolerance
  const outOfTolerance = measurements
    .filter((m) => m.inTolerance === false)
    .map((m) => ({
      id: m.id,
      parameterName: m.parameterName,
      value: m.value,
      unit: m.unit,
      toleranceLow: m.toleranceLow,
      toleranceHigh: m.toleranceHigh,
    }));

  // Spec completeness
  let specCompleteness: ReconciliationResult["specCompleteness"] = null;
  const specProgress = await getSpecProgress(shiftId);
  if (specProgress) {
    const missingItems = specProgress.items
      .filter((item) => item.required !== false && !item.captured)
      .map((item) => `${item.parameterName} (${item.measurementType})`);

    specCompleteness = {
      specName: specProgress.specName,
      totalRequired: specProgress.totalRequired,
      captured: specProgress.capturedRequired,
      missing: specProgress.missingRequired,
      missingItems,
    };
  }

  // Build recommendations
  const recommendations: string[] = [];
  if (flaggedItems.length > 0) {
    recommendations.push(`Review ${flaggedItems.length} flagged measurement(s) before closing.`);
  }
  if (outOfTolerance.length > 0) {
    recommendations.push(`${outOfTolerance.length} measurement(s) are out of tolerance -- verify and document disposition.`);
  }
  if (specCompleteness && specCompleteness.missing > 0) {
    recommendations.push(`${specCompleteness.missing} required measurement(s) still missing from the spec.`);
  }
  const singleSource = measurements.filter((m) => m.corroborationLevel === "single");
  if (singleSource.length > 0) {
    recommendations.push(`${singleSource.length} measurement(s) have only a single source -- consider corroborating.`);
  }

  // Build summary
  const summary = [
    `Shift reconciliation: ${measurements.length} measurements recorded.`,
    `${byStatus["confirmed"] || 0} confirmed, ${byStatus["pending"] || 0} pending, ${byStatus["flagged"] || 0} flagged, ${byStatus["out_of_tolerance"] || 0} out of tolerance.`,
    specCompleteness
      ? `Spec "${specCompleteness.specName}": ${specCompleteness.captured}/${specCompleteness.totalRequired} required measurements captured.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const result: ReconciliationResult = {
    shiftId,
    summary,
    totalMeasurements: measurements.length,
    byStatus,
    flaggedItems,
    specCompleteness,
    outOfTolerance,
    recommendations,
  };

  // Save reconciliation and mark shift completed
  // Use the shift we loaded at the start for duration calculation
  const endedAt = new Date();
  const totalDurationMin = Math.round(
    (endedAt.getTime() - shift.startedAt.getTime()) / 60000
  );

  await prisma.shiftSession.update({
    where: { id: shiftId },
    data: {
      reconciliationJson: JSON.stringify(result),
      status: "completed",
      endedAt,
      totalDurationMin,
    },
  });

  return result;
}
