// Measurement ledger — the core business logic for recording measurements
// Handles creating measurements, tolerance checking, spec-matching,
// and cross-referencing between audio and video sources.

import { prisma } from "@/lib/db";

// Spec item shape (stored as JSON in MeasurementSpec.specItemsJson)
export interface SpecItem {
  parameterName: string;
  measurementType: string;
  unit: string;
  nominalValue?: number;
  toleranceLow?: number;
  toleranceHigh?: number;
  required?: boolean;
  procedureStep?: string;
  count?: number; // How many readings needed (e.g., 12 blade positions)
}

// Create a measurement and its initial source, with tolerance checking
// and automatic spec-matching if the shift has a spec.
export async function recordMeasurement({
  shiftSessionId,
  componentId,
  measurementType,
  parameterName,
  value,
  unit,
  source,
  procedureStep,
  taskCardRef,
  allowedShiftStatuses,
}: {
  shiftSessionId: string;
  componentId?: string;
  measurementType: string;
  parameterName: string;
  value: number;
  unit: string;
  source: {
    sourceType: string; // audio_callout, video_frame, photo_gauge, manual_entry
    confidence: number;
    rawExcerpt?: string;
    timestamp?: number;
    captureEvidenceId?: string;
  };
  procedureStep?: string;
  taskCardRef?: string;
  allowedShiftStatuses?: string[];
}) {
  // Load the shift to check for a linked spec
  const shift = await prisma.shiftSession.findUnique({
    where: { id: shiftSessionId },
    include: { measurementSpec: true },
  });

  if (!shift) throw new Error("Shift not found");
  const permittedStatuses = new Set(allowedShiftStatuses ?? ["active"]);
  if (!permittedStatuses.has(shift.status)) {
    throw new Error("Shift is not active");
  }

  // Try to match against spec if one exists
  let specItemIndex: number | null = null;
  let nominalValue: number | null = null;
  let toleranceLow: number | null = null;
  let toleranceHigh: number | null = null;

  if (shift.measurementSpec) {
    const specItems: SpecItem[] = JSON.parse(shift.measurementSpec.specItemsJson);
    const matchResult = await matchToSpec(
      specItems,
      shiftSessionId,
      parameterName,
      measurementType
    );
    if (matchResult) {
      specItemIndex = matchResult.index;
      nominalValue = matchResult.item.nominalValue ?? null;
      toleranceLow = matchResult.item.toleranceLow ?? null;
      toleranceHigh = matchResult.item.toleranceHigh ?? null;
    }
  }

  // Compute tolerance status
  const inTolerance = checkTolerance(value, toleranceLow, toleranceHigh);
  const measurementTimestamp =
    typeof source.timestamp === "number" && Number.isFinite(source.timestamp)
      ? new Date(source.timestamp * 1000)
      : new Date();

  // Try to cross-reference with existing measurements in this shift
  const crossRef = await crossReference(
    shiftSessionId,
    parameterName,
    measurementType,
    value,
    source.timestamp
  );

  if (crossRef) {
    // Add this as a new source to the existing measurement
    await prisma.measurementSource.create({
      data: {
        measurementId: crossRef.id,
        sourceType: source.sourceType,
        value,
        unit,
        confidence: source.confidence,
        rawExcerpt: source.rawExcerpt || null,
        timestamp: source.timestamp ?? null,
        captureEvidenceId: source.captureEvidenceId || null,
      },
    });

    // Update the measurement's corroboration level
    const valuesAgree = Math.abs(crossRef.value - value) / Math.max(Math.abs(crossRef.value), 0.001) < 0.05;

    return prisma.measurement.update({
      where: { id: crossRef.id },
      data: {
        confidence: Math.min(crossRef.confidence + 0.1, 1.0),
        corroborationLevel: valuesAgree ? "corroborated" : "conflicting",
        status: valuesAgree
          ? (inTolerance === false ? "out_of_tolerance" : crossRef.status)
          : "flagged",
        flagReason: valuesAgree ? crossRef.flagReason : `Source mismatch: existing=${crossRef.value}, new=${value}`,
      },
      include: { sources: true },
    });
  }

  // No existing match — create a new measurement + its first source
  // Get next sequence number
  const lastMeasurement = await prisma.measurement.findFirst({
    where: { shiftSessionId },
    orderBy: { sequenceInShift: "desc" },
    select: { sequenceInShift: true },
  });
  const nextSequence = (lastMeasurement?.sequenceInShift ?? 0) + 1;

  const measurement = await prisma.measurement.create({
    data: {
      shiftSessionId,
      componentId: componentId || null,
      specItemIndex,
      measurementType,
      parameterName,
      value,
      unit,
      nominalValue,
      toleranceLow,
      toleranceHigh,
      inTolerance,
      confidence: source.confidence,
      corroborationLevel: "single",
      status: inTolerance === false ? "out_of_tolerance" : "pending",
      procedureStep: procedureStep || null,
      taskCardRef: taskCardRef || null,
      sequenceInShift: nextSequence,
      measuredAt: measurementTimestamp,
      sources: {
        create: {
          sourceType: source.sourceType,
          value,
          unit,
          confidence: source.confidence,
          rawExcerpt: source.rawExcerpt || null,
          timestamp: source.timestamp ?? null,
          captureEvidenceId: source.captureEvidenceId || null,
        },
      },
    },
    include: { sources: true },
  });

  return measurement;
}

// Check if a value is within tolerance
function checkTolerance(
  value: number,
  low: number | null,
  high: number | null
): boolean | null {
  if (low === null && high === null) return null; // No tolerance defined
  if (low !== null && value < low) return false;
  if (high !== null && value > high) return false;
  return true;
}

// Try to find an existing measurement in this shift that matches
// Same parameter name + type, within +/- 5 minutes of the source timestamp.
async function crossReference(
  shiftSessionId: string,
  parameterName: string,
  measurementType: string,
  _value: number,
  timestamp?: number
): Promise<{
  id: string;
  value: number;
  confidence: number;
  status: string;
  flagReason: string | null;
} | null> {
  const measurementTime =
    typeof timestamp === "number" && Number.isFinite(timestamp)
      ? new Date(timestamp * 1000)
      : new Date();
  const fiveMinutesMs = 5 * 60 * 1000;

  const candidates = await prisma.measurement.findMany({
    where: {
      shiftSessionId,
      parameterName: { equals: parameterName },
      measurementType: { equals: measurementType },
      measuredAt: {
        gte: new Date(measurementTime.getTime() - fiveMinutesMs),
        lte: new Date(measurementTime.getTime() + fiveMinutesMs),
      },
      corroborationLevel: "single", // Only cross-ref with un-corroborated ones
    },
    select: {
      id: true,
      value: true,
      confidence: true,
      status: true,
      flagReason: true,
      measuredAt: true,
    },
  });

  if (candidates.length === 0) {
    return null;
  }

  let closest = candidates[0];
  for (const candidate of candidates.slice(1)) {
    const closestDistance = Math.abs(closest.measuredAt.getTime() - measurementTime.getTime());
    const candidateDistance = Math.abs(candidate.measuredAt.getTime() - measurementTime.getTime());
    if (candidateDistance < closestDistance) {
      closest = candidate;
    }
  }

  return closest;
}

// Auto-match a measurement to the closest unmatched spec item
async function matchToSpec(
  specItems: SpecItem[],
  shiftSessionId: string,
  parameterName: string,
  measurementType: string
): Promise<{ index: number; item: SpecItem } | null> {
  // Get existing measurements that are already matched to spec items
  const matched = await prisma.measurement.findMany({
    where: { shiftSessionId, specItemIndex: { not: null } },
    select: { specItemIndex: true },
  });
  const matchedIndices = new Set(matched.map((m) => m.specItemIndex));

  // Find the best matching unmatched spec item
  for (let i = 0; i < specItems.length; i++) {
    if (matchedIndices.has(i)) continue;

    const item = specItems[i];
    // Match on measurement type and similar parameter name
    if (
      item.measurementType === measurementType &&
      item.parameterName.toLowerCase().includes(parameterName.toLowerCase().split(" ")[0])
    ) {
      return { index: i, item };
    }
  }

  // Fallback: match on measurement type alone
  for (let i = 0; i < specItems.length; i++) {
    if (matchedIndices.has(i)) continue;
    if (specItems[i].measurementType === measurementType) {
      return { index: i, item: specItems[i] };
    }
  }

  return null;
}

// Get spec progress — how many measurements have been captured vs expected
export async function getSpecProgress(shiftSessionId: string) {
  const shift = await prisma.shiftSession.findUnique({
    where: { id: shiftSessionId },
    include: { measurementSpec: true },
  });

  if (!shift?.measurementSpec) return null;

  const specItems: SpecItem[] = JSON.parse(shift.measurementSpec.specItemsJson);
  const measurements = await prisma.measurement.findMany({
    where: { shiftSessionId, specItemIndex: { not: null } },
    select: { specItemIndex: true, status: true, inTolerance: true },
  });

  const captured = new Set(measurements.map((m) => m.specItemIndex));
  const totalRequired = specItems.filter((s) => s.required !== false).length;
  const capturedRequired = specItems.filter(
    (s, i) => s.required !== false && captured.has(i)
  ).length;

  return {
    specName: shift.measurementSpec.name,
    totalItems: specItems.length,
    totalRequired,
    capturedTotal: captured.size,
    capturedRequired,
    missingRequired: totalRequired - capturedRequired,
    items: specItems.map((item, i) => ({
      ...item,
      index: i,
      captured: captured.has(i),
      measurement: measurements.find((m) => m.specItemIndex === i) || null,
    })),
  };
}
