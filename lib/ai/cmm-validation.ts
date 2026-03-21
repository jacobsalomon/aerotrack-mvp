// Structural validation for CMM extraction results.
// LLM self-assessed confidence is unreliable, so we supplement it
// with parsing checks: do the numbers parse? Is the unit recognized?
// Items that fail validation get their confidence capped at 0.5.

// Known unit strings for torque and dimensional specs
const KNOWN_UNITS = new Set([
  // Torque (imperial)
  "LB-IN", "LB-FT", "IN-LB", "FT-LB", "LB IN", "LB FT",
  // Torque (metric) — includes unicode variants (bullet, middot, period)
  "N-M", "N-m", "N-cm", "Nm", "N·m", "N•m", "N.m", "N.M", "N M", "NCM",
  // Dimensional (imperial)
  "INCH", "IN", "INCHES", "IN.", "MILS", "MIL",
  // Dimensional (metric)
  "MM", "CM", "M",
  // Pressure
  "PSI", "KPA", "MPA", "BAR",
  // Temperature
  "°F", "°C", "DEGF", "DEGC", "F", "C",
  // Other
  "RPM", "OHMS", "OHM", "LBS", "KG", "GAL", "ML", "CC",
]);

// Tool identifier patterns (aerospace-specific)
const TOOL_PATTERNS = [
  /^AGE\d+/i,     // Aerospace Ground Equipment
  /^WCS[\s-]?\d+/i,  // Work Control System
  /^DJS[\s-]?\d+/i,
  /^FDS[\s-]?\d+/i,
  /^PES[\s-]?\d+/i,
  /^BLS[\s-]?\d+/i,
  /^AKS[\s-]?\d+/i,
  /^HTS[\s-]?\d+/i,
  /^DAS[\s-]?\d+/i,
];

export interface ExtractedItem {
  itemType: string;
  itemCallout?: string | null;
  partNumber?: string | null;
  parameterName: string;
  specification: string;
  specValueLow?: number | null;
  specValueHigh?: number | null;
  specUnit?: string | null;
  specValueLowMetric?: number | null;
  specValueHighMetric?: number | null;
  specUnitMetric?: string | null;
  toolsRequired?: string[];
  checkReference?: string | null;
  repairReference?: string | null;
  specialAssemblyRef?: string | null;
  configurationApplicability?: string[];
  sequenceGroup?: string | null;
  notes?: string | null;
  confidence: number;
}

export interface ValidationResult {
  item: ExtractedItem;
  adjustedConfidence: number;
  issues: string[];
}

// Validate a single extracted item and adjust its confidence
export function validateItem(item: ExtractedItem): ValidationResult {
  const issues: string[] = [];
  let confidence = item.confidence;

  // Check 1: For specs with numeric ranges, verify they parse correctly
  if (item.specValueLow != null && item.specValueHigh != null) {
    if (isNaN(item.specValueLow) || isNaN(item.specValueHigh)) {
      issues.push("Spec values don't parse as valid numbers");
      confidence = Math.min(confidence, 0.5);
    } else if (item.specValueLow > item.specValueHigh) {
      issues.push("Spec low value is greater than high value");
      confidence = Math.min(confidence, 0.5);
    }
  }

  // Check 2: Validate unit is recognized (normalize unicode bullets/middots to dash)
  if (item.specUnit) {
    const normalized = item.specUnit.toUpperCase().trim().replace(/[·•.]/g, "-");
    if (!KNOWN_UNITS.has(normalized) && !KNOWN_UNITS.has(item.specUnit.trim())) {
      issues.push(`Unrecognized unit: "${item.specUnit}"`);
      confidence = Math.min(confidence, 0.6);
    }
  }
  if (item.specUnitMetric) {
    const normalized = item.specUnitMetric.toUpperCase().trim().replace(/[·•.]/g, "-");
    if (!KNOWN_UNITS.has(normalized) && !KNOWN_UNITS.has(item.specUnitMetric.trim())) {
      issues.push(`Unrecognized metric unit: "${item.specUnitMetric}"`);
      confidence = Math.min(confidence, 0.6);
    }
  }

  // Check 3: For torque specs, both imperial and metric should ideally be present
  if (item.itemType === "torque_spec") {
    if (item.specValueLow != null && item.specValueLowMetric == null) {
      issues.push("Missing metric equivalent for torque spec");
      // Don't cap confidence — some CMMs only show one unit
    }
    if (item.specValueLow == null && item.specValueHigh == null) {
      issues.push("Torque spec has no numeric values");
      confidence = Math.min(confidence, 0.4);
    }
  }

  // Check 4: Validate tool identifiers match known patterns
  if (item.toolsRequired && item.toolsRequired.length > 0) {
    for (const tool of item.toolsRequired) {
      const matchesKnown = TOOL_PATTERNS.some((pattern) => pattern.test(tool));
      if (!matchesKnown && tool.length < 3) {
        issues.push(`Suspicious tool identifier: "${tool}"`);
        confidence = Math.min(confidence, 0.7);
      }
    }
  }

  // Check 5: parameterName should be non-empty and reasonable length
  if (!item.parameterName || item.parameterName.trim().length < 3) {
    issues.push("Parameter name is too short or missing");
    confidence = Math.min(confidence, 0.5);
  }

  // Check 6: specification text should be non-empty
  if (!item.specification || item.specification.trim().length < 2) {
    issues.push("Specification text is empty or too short");
    confidence = Math.min(confidence, 0.4);
  }

  return {
    item: { ...item, confidence },
    adjustedConfidence: confidence,
    issues,
  };
}

// Validate all items from an extraction and return adjusted results
export function validateExtractionResults(items: ExtractedItem[]): {
  validatedItems: ValidationResult[];
  sectionConfidence: number;
  totalIssues: number;
} {
  const validatedItems = items.map(validateItem);

  // Section confidence is the average of all item confidences
  const sectionConfidence =
    validatedItems.length > 0
      ? validatedItems.reduce((sum, v) => sum + v.adjustedConfidence, 0) /
        validatedItems.length
      : 0;

  const totalIssues = validatedItems.reduce(
    (sum, v) => sum + v.issues.length,
    0
  );

  return { validatedItems, sectionConfidence, totalIssues };
}

// ── Consensus Reconciliation ──────────────────────────────────────────

export interface ConsensusResult {
  items: ExtractedItem[];
  agreementRate: number; // 0-1, fraction of items both models agreed on
  disagreements: DisagreementRecord[];
}

export interface DisagreementRecord {
  field: string;
  parameterName: string;
  valueA: string | number | null;
  valueB: string | number | null;
  resolved: "modelA" | "modelB" | "merged" | "flagged";
}

// Normalize a string for fuzzy comparison (lowercase, collapse whitespace, strip punctuation)
function normalizeForComparison(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().trim().replace(/[\s\-_]+/g, " ").replace(/[.,;:!'"()]/g, "");
}

// Check if two parameter names refer to the same item (fuzzy match)
function parameterNamesMatch(a: string, b: string): boolean {
  const na = normalizeForComparison(a);
  const nb = normalizeForComparison(b);
  if (na === nb) return true;
  // Check if one contains the other (handles "Bolt Torque" vs "End Housing Bolt Torque")
  if (na.length > 5 && nb.length > 5) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  return false;
}

// Check if two numeric values are close enough (within 1% or 0.5 absolute)
function numericMatch(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a === b) return true;
  const diff = Math.abs(a - b);
  const maxVal = Math.max(Math.abs(a), Math.abs(b));
  return diff < 0.5 || (maxVal > 0 && diff / maxVal < 0.01);
}

/**
 * Reconcile extractions from two AI models for the same page.
 * Items both models agree on get confidence 1.0.
 * Items from only one model get confidence 0.7.
 * Items where models disagree on values get confidence 0.5.
 */
export function reconcileExtractions(
  itemsA: ExtractedItem[],
  itemsB: ExtractedItem[]
): ConsensusResult {
  const disagreements: DisagreementRecord[] = [];
  const mergedItems: ExtractedItem[] = [];
  const matchedB = new Set<number>(); // Track which B items got matched

  // For each item from model A, try to find a matching item from model B
  for (const a of itemsA) {
    let bestMatch: { index: number; item: ExtractedItem } | null = null;

    for (let j = 0; j < itemsB.length; j++) {
      if (matchedB.has(j)) continue;
      const b = itemsB[j];

      // Match by callout number first (strongest signal)
      const calloutMatch = a.itemCallout && b.itemCallout &&
        normalizeForComparison(a.itemCallout) === normalizeForComparison(b.itemCallout);

      // Match by parameter name (fuzzy)
      const nameMatch = parameterNamesMatch(a.parameterName, b.parameterName);

      // Match by type + callout, or by name
      if (calloutMatch || (nameMatch && a.itemType === b.itemType)) {
        bestMatch = { index: j, item: b };
        break;
      }
    }

    if (!bestMatch) {
      // Only model A found this item — keep it with reduced confidence
      mergedItems.push({ ...a, confidence: 0.7 });
      continue;
    }

    matchedB.add(bestMatch.index);
    const b = bestMatch.item;

    // Both models found the item — compare field by field
    let agreed = true;

    // Compare specification text
    if (normalizeForComparison(a.specification) !== normalizeForComparison(b.specification)) {
      // Check if the numeric values agree even if text differs
      if (!numericMatch(a.specValueLow, b.specValueLow) || !numericMatch(a.specValueHigh, b.specValueHigh)) {
        agreed = false;
        disagreements.push({
          field: "specification",
          parameterName: a.parameterName,
          valueA: a.specification,
          valueB: b.specification,
          resolved: "flagged",
        });
      }
    }

    // Compare numeric values
    if (!numericMatch(a.specValueLow, b.specValueLow)) {
      agreed = false;
      disagreements.push({
        field: "specValueLow",
        parameterName: a.parameterName,
        valueA: a.specValueLow ?? null,
        valueB: b.specValueLow ?? null,
        resolved: "flagged",
      });
    }

    if (!numericMatch(a.specValueHigh, b.specValueHigh)) {
      agreed = false;
      disagreements.push({
        field: "specValueHigh",
        parameterName: a.parameterName,
        valueA: a.specValueHigh ?? null,
        valueB: b.specValueHigh ?? null,
        resolved: "flagged",
      });
    }

    // Merge: use model A's values as base, boost confidence based on agreement
    const mergedItem: ExtractedItem = {
      ...a,
      // Prefer whichever model gave more complete data
      toolsRequired: (a.toolsRequired?.length || 0) >= (b.toolsRequired?.length || 0)
        ? a.toolsRequired : b.toolsRequired,
      checkReference: a.checkReference || b.checkReference,
      repairReference: a.repairReference || b.repairReference,
      specialAssemblyRef: a.specialAssemblyRef || b.specialAssemblyRef,
      notes: a.notes || b.notes,
      confidence: agreed ? 1.0 : 0.5,
    };

    mergedItems.push(mergedItem);
  }

  // Add items only model B found (not matched to any A item)
  for (let j = 0; j < itemsB.length; j++) {
    if (!matchedB.has(j)) {
      mergedItems.push({ ...itemsB[j], confidence: 0.7 });
    }
  }

  // Calculate agreement rate: items where both agreed / total matched pairs
  const totalPairs = matchedB.size;
  const agreedPairs = totalPairs - disagreements.filter(d => d.resolved === "flagged").length;
  const agreementRate = totalPairs > 0 ? agreedPairs / totalPairs : 0;

  return { items: mergedItems, agreementRate, disagreements };
}
