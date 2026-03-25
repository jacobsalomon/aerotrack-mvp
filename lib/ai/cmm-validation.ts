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
  reviewReason?: string | null; // Set during extraction — explains why confidence is low
  instanceCount?: number | null; // How many instances of this item (e.g., 15 springs)
  instanceLabels?: string[]; // Optional labels for each instance (e.g., ["Spring 1", "Spring 2"])
}

export interface ValidationResult {
  item: ExtractedItem;
  adjustedConfidence: number;
  issues: string[];
  reviewReason: string | null;
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

  // Build a review reason from validation issues (if confidence was reduced)
  let reviewReason: string | null = item.reviewReason || null;
  if (issues.length > 0 && confidence < 0.7 && !reviewReason) {
    reviewReason = issues[0]; // Use the first validation issue as the reason
  }

  return {
    item: { ...item, confidence, reviewReason },
    adjustedConfidence: confidence,
    issues,
    reviewReason,
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

// Determine confidence for an unmatched item (found by only one model).
// If it passes structural validation cleanly, it gets 0.85 (single-model accuracy is 99%+).
// If it has validation issues, it stays at 0.7.
function unmatchedConfidence(item: ExtractedItem): number {
  const { issues } = validateItem(item);
  return issues.length === 0 ? 0.85 : 0.7;
}

/**
 * Reconcile extractions from two AI models for the same page.
 * Items both models agree on get confidence 1.0.
 * Unmatched items get 0.85 (if structurally valid) or 0.7.
 * Items where models disagree on values get confidence 0.5.
 */
export function reconcileExtractions(
  itemsA: ExtractedItem[],
  itemsB: ExtractedItem[]
): ConsensusResult {
  const disagreements: DisagreementRecord[] = [];
  const mergedItems: ExtractedItem[] = [];
  const matchedB = new Set<number>(); // Track which B items got matched

  // Try to match item A against all unmatched B items using 3 strategies
  function findMatch(a: ExtractedItem): { index: number; item: ExtractedItem } | null {
    for (let j = 0; j < itemsB.length; j++) {
      if (matchedB.has(j)) continue;
      const b = itemsB[j];

      // Strategy 1: Match by callout number (strongest signal)
      if (a.itemCallout && b.itemCallout &&
          normalizeForComparison(a.itemCallout) === normalizeForComparison(b.itemCallout)) {
        return { index: j, item: b };
      }

      // Strategy 2: Match by fuzzy parameter name + same type
      if (a.itemType === b.itemType && parameterNamesMatch(a.parameterName, b.parameterName)) {
        return { index: j, item: b };
      }

      // Strategy 3: Match by spec values + same type (catches different names, same numbers)
      if (a.itemType === b.itemType &&
          a.specValueLow != null && b.specValueLow != null &&
          numericMatch(a.specValueLow, b.specValueLow) &&
          numericMatch(a.specValueHigh, b.specValueHigh)) {
        return { index: j, item: b };
      }
    }
    return null;
  }

  // For each item from model A, try to find a matching item from model B
  for (const a of itemsA) {
    const match = findMatch(a);

    if (!match) {
      // Only model A found this item — confidence based on structural validity
      const conf = unmatchedConfidence(a);
      mergedItems.push({
        ...a,
        confidence: conf,
        reviewReason: conf < 0.7 ? "Only one AI model extracted this item and it has validation issues" : null,
      });
      continue;
    }

    matchedB.add(match.index);
    const b = match.item;

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
      reviewReason: agreed ? null : "Both AI models found this item but disagreed on the values",
    };

    mergedItems.push(mergedItem);
  }

  // Add items only model B found (not matched to any A item)
  for (let j = 0; j < itemsB.length; j++) {
    if (!matchedB.has(j)) {
      const conf = unmatchedConfidence(itemsB[j]);
      mergedItems.push({
        ...itemsB[j],
        confidence: conf,
        reviewReason: conf < 0.7 ? "Only one AI model extracted this item and it has validation issues" : null,
      });
    }
  }

  // Calculate agreement rate: count disagreeing ITEMS, not individual fields
  const totalPairs = matchedB.size;
  const disagreedItems = new Set(
    disagreements.filter(d => d.resolved === "flagged").map(d => d.parameterName)
  );
  const agreedPairs = totalPairs - disagreedItems.size;
  const agreementRate = totalPairs > 0 ? agreedPairs / totalPairs : 0;

  return { items: mergedItems, agreementRate, disagreements };
}

// ── Cross-Page Deduplication ──────────────────────────────────────────

/**
 * Remove duplicate items that appear on multiple pages of the same section.
 * Keeps the item with higher confidence; merges notes and tools from both.
 */
export function deduplicateItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Map<string, ExtractedItem>();
  let dedupCount = 0;

  for (const item of items) {
    // Build a dedup key — callout+type for items with callouts, name+spec for others
    const key = item.itemCallout
      ? `${normalizeForComparison(item.itemCallout)}|${item.itemType}`
      : `${normalizeForComparison(item.parameterName)}|${normalizeForComparison(item.specification)}`;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
      continue;
    }

    dedupCount++;

    // Merge: keep the higher-confidence item, but absorb data from the other
    const keeper = item.confidence >= existing.confidence ? item : existing;
    const donor = item.confidence >= existing.confidence ? existing : item;

    const merged: ExtractedItem = {
      ...keeper,
      // Merge supplementary fields from both
      toolsRequired: (keeper.toolsRequired?.length || 0) >= (donor.toolsRequired?.length || 0)
        ? keeper.toolsRequired : donor.toolsRequired,
      checkReference: keeper.checkReference || donor.checkReference,
      repairReference: keeper.repairReference || donor.repairReference,
      specialAssemblyRef: keeper.specialAssemblyRef || donor.specialAssemblyRef,
      notes: keeper.notes || donor.notes,
    };

    seen.set(key, merged);
  }

  if (dedupCount > 0) {
    console.log(`[Dedup] Removed ${dedupCount} duplicate items across pages`);
  }

  return Array.from(seen.values());
}
