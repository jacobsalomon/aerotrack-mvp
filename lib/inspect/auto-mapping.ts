// Auto-mapping pipeline for inspection sessions
// Runs after measurement extraction to map AI-captured measurements to template items
// Rules:
// 1. If callout number matches → deterministic match
// 2. If type + unit + value in range → single match = auto-assign, multiple = unassigned
// 3. NEVER silently assign ambiguous matches

import { prisma } from "@/lib/db";
import { checkInspectionTolerance } from "./inspection-helpers";

interface ExtractedMeasurement {
  measurementId: string;
  value: number;
  unit: string;
  parameterName: string;
  measurementType: string;
  calloutNumber?: string; // If the tech said "item 290" this will be "290"
}

interface MappingResult {
  measurementId: string;
  inspectionItemId: string | null;
  status: "mapped" | "unassigned";
  result: string | null; // in_spec, out_of_spec
  reason: string;
}

export async function autoMapMeasurement(
  sessionId: string,
  measurement: ExtractedMeasurement
): Promise<MappingResult> {
  // Load the active section's pending items
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      activeInspectionSectionId: true,
      configurationVariant: true,
    },
  });

  if (!session?.activeInspectionSectionId) {
    return { measurementId: measurement.measurementId, inspectionItemId: null, status: "unassigned", result: null, reason: "No active section" };
  }

  // Get pending items in the active section
  const pendingProgress = await prisma.inspectionProgress.findMany({
    where: {
      captureSessionId: sessionId,
      status: "pending",
      inspectionItem: {
        sectionId: session.activeInspectionSectionId,
      },
    },
    include: {
      inspectionItem: true,
    },
  });

  // Deduplicate items — multi-instance items have N pending progress records for the same item
  const seenItemIds = new Set<string>();
  const pendingItems = pendingProgress
    .map((p) => p.inspectionItem)
    .filter((item) => {
      if (seenItemIds.has(item.id)) return false;
      seenItemIds.add(item.id);
      return true;
    });

  // Build a map of itemId → first pending instanceIndex (for assignment)
  const firstPendingInstance = new Map<string, number>();
  for (const p of pendingProgress) {
    if (!firstPendingInstance.has(p.inspectionItemId)) {
      firstPendingInstance.set(p.inspectionItemId, p.instanceIndex);
    }
  }

  // Filter by config variant
  const applicableItems = pendingItems.filter((item) => {
    if (!session.configurationVariant) return true;
    if (item.configurationApplicability.length === 0) return true;
    return item.configurationApplicability.includes(session.configurationVariant!);
  });

  // Strategy 1: Match by callout number (deterministic)
  if (measurement.calloutNumber) {
    const calloutMatch = applicableItems.find(
      (item) => item.itemCallout === measurement.calloutNumber
    );
    if (calloutMatch) {
      const instIdx = firstPendingInstance.get(calloutMatch.id) ?? 0;
      return await assignMeasurement(sessionId, measurement, calloutMatch, instIdx, "callout match");
    }
  }

  // Strategy 2: Match by type + unit + value in spec range
  const candidates = applicableItems.filter((item) => {
    // Must have numeric specs to match against
    if (item.specValueLow == null || item.specValueHigh == null) return false;
    // Unit must be compatible
    if (item.specUnit && !isUnitCompatible(measurement.unit, item.specUnit)) return false;
    // Value must be plausible (within 2x the spec range)
    const range = item.specValueHigh - item.specValueLow;
    const margin = Math.max(range, 1); // at least 1 unit margin
    if (measurement.value < item.specValueLow - margin) return false;
    if (measurement.value > item.specValueHigh + margin) return false;
    return true;
  });

  if (candidates.length === 1) {
    const instIdx = firstPendingInstance.get(candidates[0].id) ?? 0;
    return await assignMeasurement(sessionId, measurement, candidates[0], instIdx, "single spec match");
  }

  if (candidates.length > 1) {
    // Multiple matches — NEVER silently pick one
    return {
      measurementId: measurement.measurementId,
      inspectionItemId: null,
      status: "unassigned",
      result: null,
      reason: `${candidates.length} items match — ambiguous (identical specs)`,
    };
  }

  return {
    measurementId: measurement.measurementId,
    inspectionItemId: null,
    status: "unassigned",
    result: null,
    reason: "No matching items found",
  };
}

// Assign a measurement to an item instance and update progress
async function assignMeasurement(
  sessionId: string,
  measurement: ExtractedMeasurement,
  item: { id: string; specValueLow: number | null; specValueHigh: number | null },
  instanceIndex: number,
  reason: string
): Promise<MappingResult> {
  const toleranceResult = checkInspectionTolerance(measurement.value, item.specValueLow, item.specValueHigh);
  const progressStatus = toleranceResult === "out_of_spec" ? "problem" : "done";

  await prisma.$transaction(async (tx) => {
    // Link measurement to item
    await tx.measurement.update({
      where: { id: measurement.measurementId },
      data: {
        inspectionItemId: item.id,
        instanceIndex,
        toleranceLow: item.specValueLow,
        toleranceHigh: item.specValueHigh,
        inTolerance: toleranceResult === "in_spec" ? true : toleranceResult === "out_of_spec" ? false : null,
        status: toleranceResult === "out_of_spec" ? "out_of_tolerance" : "confirmed",
      },
    });

    // Update progress for the specific instance
    await tx.inspectionProgress.upsert({
      where: {
        captureSessionId_inspectionItemId_instanceIndex: {
          captureSessionId: sessionId,
          inspectionItemId: item.id,
          instanceIndex,
        },
      },
      create: {
        captureSessionId: sessionId,
        inspectionItemId: item.id,
        instanceIndex,
        status: progressStatus,
        result: toleranceResult || "in_spec",
        measurementId: measurement.measurementId,
        completedAt: new Date(),
      },
      update: {
        status: progressStatus,
        result: toleranceResult || "in_spec",
        measurementId: measurement.measurementId,
        completedAt: new Date(),
      },
    });
  });

  return {
    measurementId: measurement.measurementId,
    inspectionItemId: item.id,
    status: "mapped",
    result: toleranceResult,
    reason,
  };
}

// Simple unit compatibility check
function isUnitCompatible(extractedUnit: string, specUnit: string): boolean {
  const normalize = (u: string) => u.toLowerCase().replace(/[\s-_]/g, "").replace(/lbs?/g, "lb");
  return normalize(extractedUnit) === normalize(specUnit);
}
