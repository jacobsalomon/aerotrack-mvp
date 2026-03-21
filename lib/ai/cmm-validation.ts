// Structural validation for CMM extraction results.
// LLM self-assessed confidence is unreliable, so we supplement it
// with parsing checks: do the numbers parse? Is the unit recognized?
// Items that fail validation get their confidence capped at 0.5.

// Known unit strings for torque and dimensional specs
const KNOWN_UNITS = new Set([
  // Torque (imperial)
  "LB-IN", "LB-FT", "IN-LB", "FT-LB", "LB IN", "LB FT",
  // Torque (metric) — includes unicode variants (bullet, middot)
  "N-M", "N-m", "N-cm", "Nm", "N·m", "N•m", "N M", "NCM",
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
    const normalized = item.specUnit.toUpperCase().trim().replace(/[·•]/g, "-");
    if (!KNOWN_UNITS.has(normalized)) {
      issues.push(`Unrecognized unit: "${item.specUnit}"`);
      confidence = Math.min(confidence, 0.6);
    }
  }
  if (item.specUnitMetric) {
    const normalized = item.specUnitMetric.toUpperCase().trim().replace(/[·•]/g, "-");
    if (!KNOWN_UNITS.has(normalized)) {
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
