// Measurement ledger — the core business logic for recording measurements
// Handles creating measurements, tolerance checking, spec-matching,
// and cross-referencing between audio and video sources.

import { prisma } from "@/lib/db";
import { assignMeasurementToInspectionItem } from "@/lib/inspection-matching";
import type { ExtractedMeasurement } from "@/lib/ai/measurement-extraction";

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

// Create a measurement and its initial source, with tolerance checking.
// For inspection sessions, automatically attempts to assign the measurement
// to a template item after recording (non-blocking).
export async function recordMeasurement({
  sessionId,
  componentId,
  measurementType,
  parameterName,
  value,
  unit,
  source,
  procedureStep,
  taskCardRef,
  extracted,
}: {
  sessionId: string;
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
  // Layer 3: pass-through AI extraction data for auto-assignment
  extracted?: Partial<ExtractedMeasurement>;
}) {
  // Verify session exists
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) throw new Error("Session not found");
  // Allow recording measurements during capture AND inspection sessions
  const allowedStatuses = ["capturing", "inspecting", "reviewing"];
  if (!allowedStatuses.includes(session.status)) {
    throw new Error("Session is not actively capturing or inspecting");
  }

  // Compute tolerance status (no spec matching for now — can be added later)
  const inTolerance = checkTolerance(value, null, null);

  // Check if the parameter name is generic/unnamed — flag for manual labeling
  const isGenericName = /unknown|unspecified|parameter/i.test(parameterName);
  const measurementTimestamp =
    typeof source.timestamp === "number" && Number.isFinite(source.timestamp)
      ? new Date(source.timestamp * 1000)
      : new Date();

  // Try to cross-reference with existing measurements in this session
  const crossRef = await crossReference(
    sessionId,
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
    const absoluteDiff = Math.abs(crossRef.value - value);
    const relativeDiff = Math.abs(crossRef.value) > 0.01
      ? absoluteDiff / Math.abs(crossRef.value)
      : 0;
    const valuesAgree = absoluteDiff < 0.005 || relativeDiff < 0.05;

    const updatedMeasurement = await prisma.measurement.update({
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

    // Layer 3: Auto-assign to inspection item (non-blocking, fire-and-forget)
    if (session.sessionType === "inspection") {
      assignMeasurementToInspectionItem(crossRef.id, sessionId, extracted).catch((err) => {
        console.error(`[InspectionMatching] Auto-assign failed for corroborated measurement=${crossRef.id}:`, err);
      });
    }

    return updatedMeasurement;
  }

  // No existing match — create a new measurement + its first source
  const measurement = await prisma.$transaction(async (tx) => {
    const lastMeasurement = await tx.measurement.findFirst({
      where: { captureSessionId: sessionId },
      orderBy: { sequenceInShift: "desc" },
      select: { sequenceInShift: true },
    });
    const nextSequence = (lastMeasurement?.sequenceInShift ?? 0) + 1;

    return tx.measurement.create({
      data: {
        captureSessionId: sessionId,
        componentId: componentId || null,
        measurementType,
        parameterName,
        value,
        unit,
        inTolerance,
        confidence: source.confidence,
        corroborationLevel: "single",
        status: isGenericName ? "flagged" : (inTolerance === false ? "out_of_tolerance" : "pending"),
        flagReason: isGenericName ? "Needs label — the AI couldn't determine what this measurement refers to" : null,
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
  });

  // Layer 3: Auto-assign to inspection item (non-blocking, fire-and-forget)
  // Runs after measurement is stored — canonical write path: store first, then assign
  if (session.sessionType === "inspection") {
    assignMeasurementToInspectionItem(measurement.id, sessionId, extracted).catch((err) => {
      console.error(`[InspectionMatching] Auto-assign failed for measurement=${measurement.id}:`, err);
    });
  }

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

// Try to find an existing measurement in this session that matches.
// For regular sessions: matches by parameterName + measurementType.
// For inspection sessions: also matches by inspectionItemId (cross-modal corroboration).
// Time window: +/- 5 minutes of the source timestamp.
async function crossReference(
  sessionId: string,
  parameterName: string,
  measurementType: string,
  _value: number,
  timestamp?: number,
  inspectionItemId?: string | null
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

  // Layer 3: For inspection sessions, also try matching by inspectionItemId
  // (audio says "Engine mount bolt torque" while video says "Torque wrench display reading"
  //  — different parameterNames, same inspectionItemId)
  if (inspectionItemId) {
    const itemMatch = await prisma.measurement.findFirst({
      where: {
        captureSessionId: sessionId,
        inspectionItemId,
        measuredAt: {
          gte: new Date(measurementTime.getTime() - fiveMinutesMs),
          lte: new Date(measurementTime.getTime() + fiveMinutesMs),
        },
        corroborationLevel: "single",
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
    if (itemMatch) return itemMatch;
  }

  // Standard cross-reference by parameterName + measurementType
  const candidates = await prisma.measurement.findMany({
    where: {
      captureSessionId: sessionId,
      parameterName: { equals: parameterName },
      measurementType: { equals: measurementType },
      measuredAt: {
        gte: new Date(measurementTime.getTime() - fiveMinutesMs),
        lte: new Date(measurementTime.getTime() + fiveMinutesMs),
      },
      corroborationLevel: "single",
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
