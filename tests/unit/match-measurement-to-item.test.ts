import { describe, expect, it } from "vitest";
import {
  matchMeasurementToItem,
  type CandidateItem,
} from "@/lib/inspect/match-measurement-to-item";

// Helper to create a candidate item with sensible defaults
function makeItem(overrides: Partial<CandidateItem> & { id: string }): CandidateItem {
  return {
    sectionId: "section-1",
    parameterName: "Test Parameter",
    specUnit: null,
    specValueLow: null,
    specValueHigh: null,
    itemCallout: null,
    ...overrides,
  };
}

describe("matchMeasurementToItem", () => {
  it("returns null for empty candidates", () => {
    const result = matchMeasurementToItem(
      { value: 45, unit: "ft-lb" },
      [],
      null,
      new Set()
    );
    expect(result).toBeNull();
  });

  it("matches by unit + value in range", () => {
    const candidates = [
      makeItem({ id: "a", specUnit: "ft-lb", specValueLow: 40, specValueHigh: 50, parameterName: "Bolt Torque" }),
      makeItem({ id: "b", specUnit: "in-lb", specValueLow: 10, specValueHigh: 20, parameterName: "Small Bolt" }),
    ];
    const result = matchMeasurementToItem(
      { value: 45, unit: "ft-lb" },
      candidates,
      null,
      new Set()
    );
    expect(result).not.toBeNull();
    expect(result!.itemId).toBe("a");
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("skips items with mismatched units", () => {
    const candidates = [
      makeItem({ id: "a", specUnit: "in-lb", specValueLow: 40, specValueHigh: 50 }),
    ];
    const result = matchMeasurementToItem(
      { value: 45, unit: "ft-lb" },
      candidates,
      null,
      new Set()
    );
    expect(result).toBeNull();
  });

  it("normalizes unit variants (ft-lbs → ft-lb)", () => {
    const candidates = [
      makeItem({ id: "a", specUnit: "ft-lbs", specValueLow: 40, specValueHigh: 50, parameterName: "Torque" }),
    ];
    const result = matchMeasurementToItem(
      { value: 45, unit: "foot-pounds" },
      candidates,
      null,
      new Set()
    );
    expect(result).not.toBeNull();
    expect(result!.itemId).toBe("a");
  });

  it("prefers items in the active section", () => {
    const candidates = [
      makeItem({ id: "a", sectionId: "sec-1", specUnit: "mm", specValueLow: 0.1, specValueHigh: 0.5 }),
      makeItem({ id: "b", sectionId: "sec-2", specUnit: "mm", specValueLow: 0.1, specValueHigh: 0.5 }),
    ];
    const result = matchMeasurementToItem(
      { value: 0.3, unit: "mm" },
      candidates,
      "sec-2",
      new Set()
    );
    expect(result!.itemId).toBe("b");
  });

  it("prefers pending items over completed ones", () => {
    const candidates = [
      makeItem({ id: "completed", specUnit: "mm", specValueLow: 1, specValueHigh: 5 }),
      makeItem({ id: "pending", specUnit: "mm", specValueLow: 1, specValueHigh: 5 }),
    ];
    const result = matchMeasurementToItem(
      { value: 3, unit: "mm" },
      candidates,
      null,
      new Set(["completed"])
    );
    expect(result!.itemId).toBe("pending");
  });

  it("returns null when below confidence threshold", () => {
    const candidates = [
      makeItem({ id: "a", specUnit: null, specValueLow: null, specValueHigh: null }),
    ];
    const result = matchMeasurementToItem(
      { value: 45, unit: "ft-lb" },
      candidates,
      null,
      new Set(),
      0.5 // high threshold
    );
    expect(result).toBeNull();
  });

  it("matches out-of-tolerance readings to the correct item", () => {
    const candidates = [
      makeItem({ id: "a", specUnit: "ft-lb", specValueLow: 40, specValueHigh: 50, parameterName: "Bolt Torque" }),
      makeItem({ id: "b", specUnit: "ft-lb", specValueLow: 100, specValueHigh: 120, parameterName: "Main Nut" }),
    ];
    // 110 is in range for item b
    const result = matchMeasurementToItem(
      { value: 110, unit: "ft-lb" },
      candidates,
      null,
      new Set()
    );
    expect(result!.itemId).toBe("b");
  });

  it("includes itemCallout in the match result", () => {
    const candidates = [
      makeItem({ id: "a", specUnit: "in-lb", specValueLow: 10, specValueHigh: 20, itemCallout: "290" }),
    ];
    const result = matchMeasurementToItem(
      { value: 15, unit: "in-lb" },
      candidates,
      null,
      new Set()
    );
    expect(result!.itemCallout).toBe("290");
  });
});
