// Layer 3: CMM-Aware AI Matching Engine
// Maps extracted measurements to InspectionTemplate items, checks specs,
// and handles post-session reconciliation.
//
// Core functions:
//   normalizeUnit()                      — canonical unit alias table
//   convertValue()                       — cross-unit conversion (e.g., ft-lbs → N-m)
//   checkAgainstSpec()                   — pass/fail/no_spec with unit normalization
//   assignMeasurementToInspectionItem()  — auto-assign measurement to the correct template item
//   reconcileInspectionSession()         — post-session pass with full template context

import { prisma } from "@/lib/db";
import { getExtractionContext, invalidateExtractionContextCache } from "@/lib/ai/measurement-extraction";
import type { ExtractedMeasurement } from "@/lib/ai/measurement-extraction";

// ═══════════════════════════════════════════════════════════
// US-004: Unit Normalization & Spec Check
// ═══════════════════════════════════════════════════════════

// Canonical unit alias table — case-insensitive normalization
// Maps every known alias to a single canonical form
const UNIT_ALIASES: Record<string, string> = {
  // Torque — inch-pounds
  "lb-in": "in-lbs",
  "in-lb": "in-lbs",
  "in-lbs": "in-lbs",
  "inch-pounds": "in-lbs",
  "inch-pound": "in-lbs",
  "inlbs": "in-lbs",

  // Torque — foot-pounds
  "ft-lbs": "ft-lbs",
  "ft-lb": "ft-lbs",
  "foot-pounds": "ft-lbs",
  "foot-pound": "ft-lbs",
  "ftlbs": "ft-lbs",

  // Torque — newton-meters
  "n-m": "N-m",
  "nm": "N-m",
  "n.m": "N-m",
  "newton-meters": "N-m",
  "newton-meter": "N-m",

  // Length — millimeters
  "mm": "mm",
  "millimeters": "mm",
  "millimeter": "mm",

  // Length — inches
  "inches": "inches",
  "inch": "inches",
  "in": "inches",
  "in.": "inches",

  // Length — mils (thousandths of an inch)
  "mils": "mils",
  "mil": "mils",
  "thou": "mils",

  // Pressure — psi
  "psi": "psi",

  // Pressure — kPa
  "kpa": "kPa",

  // Pressure — bar
  "bar": "bar",

  // Temperature
  "degf": "degF",
  "°f": "degF",
  "fahrenheit": "degF",
  "degc": "degC",
  "°c": "degC",
  "celsius": "degC",

  // Electrical
  "ohms": "ohms",
  "ohm": "ohms",

  // Rotational
  "rpm": "rpm",
};

// Normalize a unit string to its canonical form
export function normalizeUnit(unit: string): string {
  if (!unit) return unit;
  const key = unit.toLowerCase().trim();
  return UNIT_ALIASES[key] ?? unit;
}

// Conversion factors between compatible units
// Each entry: [fromUnit, toUnit, factor] where toValue = fromValue * factor
// For temperature (non-linear), we use special handling
const CONVERSION_TABLE: Array<[string, string, number]> = [
  ["ft-lbs", "N-m", 1.3558],
  ["N-m", "ft-lbs", 1 / 1.3558],
  ["in-lbs", "N-m", 0.1130],
  ["N-m", "in-lbs", 1 / 0.1130],
  ["in-lbs", "ft-lbs", 1 / 12],
  ["ft-lbs", "in-lbs", 12],
  ["inches", "mm", 25.4],
  ["mm", "inches", 1 / 25.4],
  ["mils", "mm", 0.0254],
  ["mm", "mils", 1 / 0.0254],
  ["mils", "inches", 0.001],
  ["inches", "mils", 1000],
  ["psi", "kPa", 6.8948],
  ["kPa", "psi", 1 / 6.8948],
  ["bar", "kPa", 100],
  ["kPa", "bar", 0.01],
  ["bar", "psi", 14.5038],
  ["psi", "bar", 1 / 14.5038],
];

// Convert a value from one unit to another. Returns null if conversion not possible.
export function convertValue(value: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (from === to) return value;

  // Temperature conversions (non-linear)
  if (from === "degF" && to === "degC") return (value - 32) * 5 / 9;
  if (from === "degC" && to === "degF") return value * 9 / 5 + 32;

  // Look up linear conversion factor
  const entry = CONVERSION_TABLE.find(([f, t]) => f === from && t === to);
  if (entry) return value * entry[2];

  return null; // No known conversion path
}

// Check a captured measurement value against an InspectionItem's spec range.
// Always converts the captured value to the spec's unit system before comparing.
// Returns "pass", "fail", or "no_spec" if no spec range is defined.
export function checkAgainstSpec(
  capturedValue: number,
  capturedUnit: string,
  specLow: number | null,
  specHigh: number | null,
  specUnit: string | null
): "pass" | "fail" | "no_spec" {
  // No spec range defined — can't check
  if (specLow == null && specHigh == null) return "no_spec";

  // Normalize both units
  const normalizedCaptured = normalizeUnit(capturedUnit);
  const normalizedSpec = specUnit ? normalizeUnit(specUnit) : normalizedCaptured;

  // Convert captured value to spec's unit system if they differ
  let valueInSpecUnits = capturedValue;
  if (normalizedCaptured !== normalizedSpec) {
    const converted = convertValue(capturedValue, normalizedCaptured, normalizedSpec);
    if (converted == null) {
      // Can't convert — assume spec's unit (PRD: "when the AI extracts without a unit, assume spec's unit")
      valueInSpecUnits = capturedValue;
    } else {
      valueInSpecUnits = converted;
    }
  }

  // One-sided limits
  if (specLow != null && specHigh == null) {
    return valueInSpecUnits >= specLow ? "pass" : "fail";
  }
  if (specLow == null && specHigh != null) {
    return valueInSpecUnits <= specHigh ? "pass" : "fail";
  }

  // Both bounds (inclusive)
  if (valueInSpecUnits >= specLow! && valueInSpecUnits <= specHigh!) {
    return "pass";
  }
  return "fail";
}

// ═══════════════════════════════════════════════════════════
// US-003: Auto-Assignment of Measurements to Template Items
// ═══════════════════════════════════════════════════════════

// Item types that have numeric specs worth matching against (same as in extraction context)
const NUMERIC_ITEM_TYPES = new Set([
  "torque_spec", "dimensional_spec", "dimension_check",
  "clearance", "runout", "endplay", "backlash", "pressure_check",
]);

// Check if two units are compatible (same canonical form or convertible)
function unitsAreCompatible(unitA: string, unitB: string): boolean {
  const a = normalizeUnit(unitA);
  const b = normalizeUnit(unitB);
  if (a === b) return true;
  return convertValue(1, a, b) !== null;
}

// Attempt to auto-assign a measurement to the correct InspectionItem.
// Returns true if assigned, false if left unassigned.
//
// Assignment priority:
//   1. Callout number match (highest confidence)
//   2. Parameter name + measurement type + compatible unit
//   3. Leave unassigned if zero or multiple matches
//
// When exactly one item matches: assign it.
// When multiple items share identical specs: leave UNASSIGNED (prevents false records).
export async function assignMeasurementToInspectionItem(
  measurementId: string,
  sessionId: string,
  extracted?: Partial<ExtractedMeasurement>
): Promise<boolean> {
  // Load measurement
  const measurement = await prisma.measurement.findUnique({
    where: { id: measurementId },
  });
  if (!measurement) return false;

  // Already assigned — idempotent
  if (measurement.inspectionItemId) return true;

  // Load session
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      sessionType: true,
      inspectionTemplateId: true,
      activeInspectionSectionId: true,
    },
  });
  if (!session || session.sessionType !== "inspection" || !session.inspectionTemplateId) return false;

  // Use extracted AI data if available, otherwise fall back to measurement fields
  const calloutNumber = extracted?.calloutNumber ?? null;
  const matchConfidence = extracted?.matchConfidence ?? null;
  const parameterName = extracted?.parameterName ?? measurement.parameterName;
  const measurementType = extracted?.measurementType ?? measurement.measurementType;
  const measuredUnit = extracted?.unit ?? measurement.unit;

  // Load candidate items (numeric types only)
  const templateItems = await prisma.inspectionItem.findMany({
    where: {
      section: { templateId: session.inspectionTemplateId },
      itemType: { in: [...NUMERIC_ITEM_TYPES] },
    },
    include: {
      section: { select: { id: true, title: true } },
    },
  });

  let matchedItem: typeof templateItems[number] | null = null;

  // ── Strategy 1: Match by callout number ──
  if (calloutNumber) {
    // Prefer items in the active section first
    const activeSectionMatches = templateItems.filter(
      (item) =>
        item.itemCallout === calloutNumber &&
        item.section.id === session.activeInspectionSectionId
    );

    if (activeSectionMatches.length === 1) {
      matchedItem = activeSectionMatches[0];
    } else if (activeSectionMatches.length === 0) {
      // Fall back to all sections
      const allMatches = templateItems.filter((item) => item.itemCallout === calloutNumber);
      if (allMatches.length === 1) {
        matchedItem = allMatches[0];
      }
      // Multiple matches with same callout across sections — leave unassigned
    }
    // Multiple matches in active section with same callout — leave unassigned
  }

  // ── Strategy 2: Match by parameter name + type + unit ──
  if (!matchedItem && parameterName) {
    const nameMatches = templateItems.filter((item) => {
      // Fuzzy name match: case-insensitive contains
      const nameMatch =
        item.parameterName.toLowerCase().includes(parameterName.toLowerCase()) ||
        parameterName.toLowerCase().includes(item.parameterName.toLowerCase());
      if (!nameMatch) return false;

      // Check measurement type compatibility (loose match — "torque" matches "torque_spec")
      const typeCompatible =
        !measurementType ||
        (item.itemType?.includes(measurementType) ?? false) ||
        measurementType === "torque" && item.itemType === "torque_spec" ||
        measurementType === "dimension" && (item.itemType === "dimensional_spec" || item.itemType === "dimension_check") ||
        measurementType === "clearance" && item.itemType === "clearance" ||
        measurementType === "pressure" && item.itemType === "pressure_check";
      if (!typeCompatible) return false;

      // Check unit compatibility
      if (measuredUnit && item.specUnit) {
        return unitsAreCompatible(measuredUnit, item.specUnit);
      }
      return true;
    });

    // Active section priority
    const activeSectionMatches = nameMatches.filter(
      (item) => item.section.id === session.activeInspectionSectionId
    );

    const candidates = activeSectionMatches.length > 0 ? activeSectionMatches : nameMatches;

    if (candidates.length === 1) {
      matchedItem = candidates[0];
    }
    // Multiple matches — check if they have identical specs (identical-spec guard)
    // If they do, leave unassigned per Layer 2 FR-5
    // If specs differ, we still can't disambiguate — leave unassigned
  }

  // ── No match found ──
  if (!matchedItem) {
    console.log(
      `[InspectionMatching] No match for measurement=${measurementId} ` +
      `callout=${calloutNumber} param=${parameterName} — leaving unassigned`
    );
    return false;
  }

  // ── Perform the assignment ──
  await performAssignment(
    measurement,
    matchedItem,
    sessionId,
    matchConfidence
  );

  console.log(
    `[InspectionMatching] Assigned measurement=${measurementId} → ` +
    `item=${matchedItem.itemCallout || matchedItem.parameterName} ` +
    `(${checkAgainstSpec(measurement.value, measurement.unit, matchedItem.specValueLow, matchedItem.specValueHigh, matchedItem.specUnit)})`
  );
  return true;
}

// Internal: assign a measurement to an item, update progress, create findings
async function performAssignment(
  measurement: { id: string; value: number; unit: string; captureSessionId: string },
  item: { id: string; specValueLow: number | null; specValueHigh: number | null; specUnit: string | null; parameterName: string; sectionId: string },
  sessionId: string,
  matchConfidence: number | null,
  userId?: string
) {
  // Run spec check with unit normalization
  const specResult = checkAgainstSpec(
    measurement.value,
    measurement.unit,
    item.specValueLow,
    item.specValueHigh,
    item.specUnit
  );

  const toleranceResult = specResult === "pass" ? "in_spec" : specResult === "fail" ? "out_of_spec" : null;

  await prisma.$transaction(async (tx) => {
    // Check for re-measurement: does this item already have an assigned measurement?
    const existingProgress = await tx.inspectionProgress.findUnique({
      where: {
        captureSessionId_inspectionItemId_instanceIndex: {
          captureSessionId: sessionId,
          inspectionItemId: item.id,
          instanceIndex: 0,
        },
      },
      select: { measurementId: true },
    });

    if (existingProgress?.measurementId && existingProgress.measurementId !== measurement.id) {
      // Re-measurement: unlink old measurement, resolve old findings
      await tx.measurement.update({
        where: { id: existingProgress.measurementId },
        data: { inspectionItemId: null },
      });

      // Resolve any existing out-of-spec findings for the old measurement
      await tx.inspectionFinding.updateMany({
        where: {
          captureSessionId: sessionId,
          inspectionItemId: item.id,
          status: "open",
        },
        data: { status: "resolved" },
      });
    }

    // Assign measurement to item
    await tx.measurement.update({
      where: { id: measurement.id },
      data: {
        inspectionItemId: item.id,
        toleranceLow: item.specValueLow,
        toleranceHigh: item.specValueHigh,
        inTolerance: specResult === "pass" ? true : specResult === "fail" ? false : null,
        status: specResult === "fail" ? "out_of_tolerance" : "confirmed",
      },
    });

    // Upsert InspectionProgress for this item
    await tx.inspectionProgress.upsert({
      where: {
        captureSessionId_inspectionItemId_instanceIndex: {
          captureSessionId: sessionId,
          inspectionItemId: item.id,
          instanceIndex: 0,
        },
      },
      create: {
        captureSessionId: sessionId,
        inspectionItemId: item.id,
        status: specResult === "fail" ? "problem" : "done",
        result: toleranceResult,
        measurementId: measurement.id,
        completedAt: new Date(),
      },
      update: {
        status: specResult === "fail" ? "problem" : "done",
        result: toleranceResult,
        measurementId: measurement.id,
        completedAt: new Date(),
      },
    });

    // If out-of-spec, create an InspectionFinding
    if (specResult === "fail") {
      const normalizedUnit = normalizeUnit(measurement.unit);
      const specUnitNorm = item.specUnit ? normalizeUnit(item.specUnit) : normalizedUnit;
      const specRange = item.specValueLow != null && item.specValueHigh != null
        ? `${item.specValueLow}-${item.specValueHigh} ${specUnitNorm}`
        : item.specValueLow != null
          ? `>= ${item.specValueLow} ${specUnitNorm}`
          : `<= ${item.specValueHigh} ${specUnitNorm}`;

      // createdById: use the provided userId, or fall back to session's userId
      const findingCreatorId = userId || (await tx.captureSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      }))?.userId;

      if (findingCreatorId) {
        await tx.inspectionFinding.create({
          data: {
            captureSessionId: sessionId,
            inspectionItemId: item.id,
            inspectionSectionId: item.sectionId,
            createdById: findingCreatorId,
            description: `Out-of-spec: captured ${measurement.value} ${normalizedUnit}, expected ${specRange}`,
            severity: "major",
            status: "open",
          },
        });
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// US-006: Post-Session Reconciliation
// ═══════════════════════════════════════════════════════════

export interface ReconciliationConflict {
  measurementId: string;
  currentItemCallout: string;
  suggestedItemCallout: string;
  reason: string;
  resolved: boolean;
}

export interface ReconciliationSummary {
  version: number;
  matched: number;
  unmatched: number;
  conflicts: ReconciliationConflict[];
  newMeasurements: number;
}

// Run a post-session reconciliation pass.
// Uses the full template (all sections) to re-evaluate unassigned and low-confidence measurements.
// Idempotent: returns existing summary unless force=true.
export async function reconcileInspectionSession(
  sessionId: string,
  options?: { force?: boolean }
): Promise<ReconciliationSummary> {
  // Check if already reconciled (idempotent)
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      reconciliationSummary: true,
      sessionType: true,
      inspectionTemplateId: true,
    },
  });

  if (!session || session.sessionType !== "inspection") {
    return { version: 1, matched: 0, unmatched: 0, conflicts: [], newMeasurements: 0 };
  }

  if (session.reconciliationSummary && !options?.force) {
    return session.reconciliationSummary as unknown as ReconciliationSummary;
  }

  // ── Draining guard: wait for in-flight chunk processing to complete ──
  const maxWaitMs = 30_000; // 30 seconds max wait
  const pollIntervalMs = 2_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const pendingStages = await prisma.sessionProcessingStage.count({
      where: {
        job: { sessionId: sessionId },
        status: { in: ["queued", "in_progress"] },
      },
    });

    if (pendingStages === 0) break;
    console.log(`[Reconciliation] Waiting for ${pendingStages} in-flight stages to complete...`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // ── Load full template context for better matching ──
  // Invalidate cache first so we get fresh full-template context
  invalidateExtractionContextCache(sessionId);
  await getExtractionContext(sessionId, { fullTemplate: true });

  // Load all measurements for this session
  const measurements = await prisma.measurement.findMany({
    where: { captureSessionId: sessionId },
    include: {
      sources: { select: { sourceType: true } },
    },
  });

  // Load all template items for matching
  const templateItems = await prisma.inspectionItem.findMany({
    where: {
      section: { templateId: session.inspectionTemplateId! },
      itemType: { in: [...NUMERIC_ITEM_TYPES] },
    },
    include: {
      section: { select: { id: true, title: true } },
    },
  });

  const conflicts: ReconciliationConflict[] = [];
  let newlyMatched = 0;

  // ── Pass 1: Try to assign unassigned measurements with full template context ──
  const unassigned = measurements.filter((m) => !m.inspectionItemId);
  for (const m of unassigned) {
    const assigned = await assignMeasurementToInspectionItem(m.id, sessionId, {
      parameterName: m.parameterName,
      measurementType: m.measurementType,
      unit: m.unit,
    });
    if (assigned) newlyMatched++;
  }

  // ── Pass 2: Review low-confidence assignments ──
  // We check the matchConfidence stored on the measurement's source excerpt
  // For now, we flag any assignment where matchConfidence < 0.7 by checking
  // if the assigned item's spec range doesn't match the measurement well
  const assigned = measurements.filter((m) => m.inspectionItemId);
  for (const m of assigned) {
    // Find the assigned item
    const assignedItem = templateItems.find((i) => i.id === m.inspectionItemId);
    if (!assignedItem) continue;

    // Quick spec sanity check: if the measurement fails spec and there's
    // a better-fitting item in the full template, flag a conflict
    const currentSpec = checkAgainstSpec(
      m.value, m.unit,
      assignedItem.specValueLow, assignedItem.specValueHigh, assignedItem.specUnit
    );

    if (currentSpec === "fail") {
      // Look for a better-fitting item in the full template
      const betterMatch = templateItems.find((item) => {
        if (item.id === assignedItem.id) return false;
        const result = checkAgainstSpec(
          m.value, m.unit,
          item.specValueLow, item.specValueHigh, item.specUnit
        );
        return result === "pass" && unitsAreCompatible(m.unit, item.specUnit || m.unit);
      });

      if (betterMatch) {
        conflicts.push({
          measurementId: m.id,
          currentItemCallout: assignedItem.itemCallout || assignedItem.parameterName,
          suggestedItemCallout: betterMatch.itemCallout || betterMatch.parameterName,
          reason: `Measurement ${m.value} ${m.unit} fails current spec but passes ${betterMatch.parameterName} spec`,
          resolved: false,
        });
      }
    }
  }

  // ── Build summary ──
  // Reload measurements after reconciliation to get updated assignment counts
  const updatedMeasurements = await prisma.measurement.findMany({
    where: { captureSessionId: sessionId },
    select: { inspectionItemId: true },
  });

  const summary: ReconciliationSummary = {
    version: 1,
    matched: updatedMeasurements.filter((m) => m.inspectionItemId != null).length,
    unmatched: updatedMeasurements.filter((m) => m.inspectionItemId == null).length,
    conflicts,
    newMeasurements: newlyMatched,
  };

  // Store summary on session
  await prisma.captureSession.update({
    where: { id: sessionId },
    data: { reconciliationSummary: JSON.parse(JSON.stringify(summary)) },
  });

  console.log(
    `[Reconciliation] session=${sessionId}: matched=${summary.matched}, ` +
    `unmatched=${summary.unmatched}, conflicts=${conflicts.length}, ` +
    `newlyMatched=${newlyMatched}`
  );

  return summary;
}
