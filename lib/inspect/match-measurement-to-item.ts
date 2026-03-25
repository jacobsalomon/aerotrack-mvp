// Match an extracted measurement to the best checklist item in the current session.
// Pure function — no side effects, fully testable.
//
// Matching logic ranks candidates by:
//   1. Items in the currently active section score higher
//   2. Items whose spec unit matches the extracted unit
//   3. Items that are still pending (not yet completed)
//   4. Items whose spec range contains the extracted value

export interface ExtractedMeasurement {
  value: number;
  unit: string;
}

export interface CandidateItem {
  id: string;
  sectionId: string;
  parameterName: string;
  specUnit: string | null;
  specValueLow: number | null;
  specValueHigh: number | null;
  itemCallout: string | null;
}

export interface MatchResult {
  itemId: string;
  sectionId: string;
  parameterName: string;
  itemCallout: string | null;
  confidence: number; // 0-1
}

// Normalize unit strings for comparison ("ft-lbs" → "ft-lb", "in-lbs" → "in-lb", etc.)
function normalizeUnit(unit: string): string {
  return unit
    .toLowerCase()
    .trim()
    .replace(/\.$/, "")        // trailing period
    .replace(/lbs/g, "lb")     // "ft-lbs" → "ft-lb"
    .replace(/inches/g, "in")
    .replace(/inch/g, "in")
    .replace(/pounds/g, "lb")
    .replace(/foot/g, "ft")
    .replace(/feet/g, "ft")
    .replace(/millimeters/g, "mm")
    .replace(/centimeters/g, "cm")
    .replace(/\s+/g, "")       // collapse whitespace
    .replace(/-/g, "");         // "ft-lb" → "ftlb" for fuzzy matching
}

/**
 * Find the best matching checklist item for an extracted measurement.
 *
 * @param measurement - The extracted value + unit from audio or glasses
 * @param candidates - All items in the session (with their section IDs)
 * @param activeSectionId - Which section the inspector is currently viewing
 * @param completedItemIds - Set of item IDs already completed (lower priority)
 * @param confidenceThreshold - Minimum confidence to return a match (default 0.3)
 * @returns The best match, or null if no confident match found
 */
export function matchMeasurementToItem(
  measurement: ExtractedMeasurement,
  candidates: CandidateItem[],
  activeSectionId: string | null,
  completedItemIds: Set<string>,
  confidenceThreshold = 0.3
): MatchResult | null {
  if (candidates.length === 0) return null;

  const normalizedUnit = normalizeUnit(measurement.unit);
  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const item of candidates) {
    let score = 0;

    // Unit match — strongest signal (0 or 0.4)
    if (item.specUnit) {
      const itemUnit = normalizeUnit(item.specUnit);
      if (itemUnit === normalizedUnit) {
        score += 0.4;
      } else {
        // Units don't match — skip this item entirely
        continue;
      }
    } else {
      // Item has no unit spec — weak candidate
      score += 0.05;
    }

    // Value in spec range — strong signal (0 or 0.3)
    if (item.specValueLow != null || item.specValueHigh != null) {
      const low = item.specValueLow ?? -Infinity;
      const high = item.specValueHigh ?? Infinity;
      if (measurement.value >= low && measurement.value <= high) {
        score += 0.3;
      } else {
        // Value is out of range — still a candidate but weaker
        // Could be an out-of-tolerance reading for this item
        score += 0.05;
      }
    }

    // Active section bonus (0 or 0.2)
    if (activeSectionId && item.sectionId === activeSectionId) {
      score += 0.2;
    }

    // Pending item bonus (0 or 0.1) — prefer items that haven't been completed
    if (!completedItemIds.has(item.id)) {
      score += 0.1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        itemId: item.id,
        sectionId: item.sectionId,
        parameterName: item.parameterName,
        itemCallout: item.itemCallout,
        confidence: Math.min(score, 1),
      };
    }
  }

  if (!bestMatch || bestMatch.confidence < confidenceThreshold) {
    return null;
  }

  return bestMatch;
}
