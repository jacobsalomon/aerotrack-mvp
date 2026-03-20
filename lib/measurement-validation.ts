// Parse spec range strings from org-form extraction and check pass/fail.
// Used by session detail page (status badges) and org-form PDF renderer.

export interface SpecRange {
  min: number;
  max: number;
  unit: string;
}

// Parse strings like "Spec: 18.742 - 18.758 in" or "12.5 - 13.0 mm"
// Returns null if the string doesn't contain a parseable range
export function parseSpecRange(spec: string): SpecRange | null {
  if (!spec) return null;

  // Remove "Spec:" prefix if present
  const cleaned = spec.replace(/^spec:\s*/i, "").trim();

  // Match patterns like "18.742 - 18.758 in" or "18.742-18.758" or "18.742 to 18.758 in"
  const rangeMatch = cleaned.match(
    /(-?\d+\.?\d*)\s*[-–—to]+\s*(-?\d+\.?\d*)\s*(.*)/i
  );
  if (!rangeMatch) return null;

  const min = parseFloat(rangeMatch[1]);
  const max = parseFloat(rangeMatch[2]);
  const unit = rangeMatch[3]?.trim() || "";

  if (isNaN(min) || isNaN(max)) return null;

  return { min, max, unit };
}

// Check if an actual measurement value falls within spec range
export function checkPassFail(
  actual: number,
  spec: SpecRange
): "PASS" | "FAIL" {
  return actual >= spec.min && actual <= spec.max ? "PASS" : "FAIL";
}

// Try to parse a string as a number (handles commas, whitespace, units)
export function parseActualValue(value: string): number | null {
  if (!value || value === "—" || value === "-") return null;
  // Strip common units and whitespace
  const cleaned = value.replace(/[a-zA-Z°"'%]+$/g, "").replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
