// Unit tests for PDF renderers (US-003, US-004, US-005)
// Tests all three FAA form renderers: 8130-3, 337, 8010-4
// Verifies valid PDF output, edge cases, and graceful handling of missing data

import { describe, it, expect } from "vitest";
import { render8130Pdf, render337Pdf, render8010Pdf } from "@/lib/pdf-renderers";

// Helper: check PDF header bytes (%PDF-)
function isPdfValid(bytes: Uint8Array): boolean {
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  return header === "%PDF-";
}

// === Complete test data fixtures ===

const complete8130Data: Record<string, string> = {
  block1: "FAA",
  block2: "Authorized Release Certificate",
  block3: "FTN-2026-00123",
  block4: "Precision Aero MRO\n123 Aviation Way\nDallas, TX 75201",
  block5: "WO-2026-0456",
  block6a: "High Pressure Compressor Module",
  block6b: "881700-1089",
  block6c: "SN-2024-11432",
  block6d: "1",
  block6e: "Overhauled",
  block7: "WORK PERFORMED\nComplete overhaul per CMM 72-00-00.\nAll wear limits within specification.\nNew bearings installed per SB-2024-003.",
  block8: "Condition for safe operation",
  block9: "14 CFR Part 145",
  block10: "FAR § 43.9",
  block11: "PRSR-2847291",
  block12: "2026-02-20",
  block13: "Mike Chen",
  block14: "I certify that the work described above has been accomplished in accordance with applicable regulations.",
};

const complete337Data: Record<string, unknown> = {
  aircraft: { registration: "N12345", serialNumber: "AC-9876", make: "Boeing", model: "737-800" },
  owner: { name: "Delta Air Lines", address: "1030 Delta Blvd\nAtlanta, GA 30354" },
  repairType: "Repair",
  unit: "APPLIANCE",
  appliance: { make: "GE Aviation", model: "881700-1089", serialNumber: "SN-2024-11432", type: "Turbine Engine" },
  conformity: { agency: "Precision Aero MRO", agencyKind: "Certificated Repair Station", certificateNumber: "PRSR-2847291", signedBy: "Mike Chen", date: "2026-02-20" },
  approval: { status: "Approved", type: "Repair Station", certificate: "PRSR-2847291", signedBy: "Mike Chen", date: "2026-02-20" },
  workDescription: "Complete overhaul of HPC module per CMM 72-00-00.\nAll inspection criteria met.\nNew bearings installed.",
};

const complete8010Data: Record<string, unknown> = {
  aircraft: { registration: "N12345", manufacturer: "Boeing", model: "737-800", serialNumber: "AC-9876" },
  defectPart: { name: "Fuel Control Unit", partNumber: "881700-1089", serialNumber: "SN-2024-11432", location: "Engine #1 accessory gearbox" },
  componentAssembly: { name: "HPC Module", manufacturer: "GE Aviation", partNumber: "881700-1089", serialNumber: "SN-2024-11432" },
  metrics: { partTotalTime: "12,450 hrs", partTSO: "3,200 hrs", partCondition: "Unserviceable" },
  dateSubmitted: "2026-02-20",
  comments: "FINDINGS\nBearing spalling detected on inner race.\nDimensional check within limits but visual inspection under 10x magnification revealed early-stage degradation.",
  submittedBy: { type: "Repair Station", designation: "PRSR-2847291", telephone: "214-555-0199" },
};


// ══════════════════════════════════════════════════════════════
// 8130-3 Tests (US-003)
// ══════════════════════════════════════════════════════════════
describe("render8130Pdf", () => {
  it("produces valid PDF from complete data", async () => {
    const bytes = await render8130Pdf(complete8130Data);
    expect(isPdfValid(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1024);
  });

  it("handles empty content without crashing", async () => {
    const bytes = await render8130Pdf({});
    expect(isPdfValid(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1024);
  });

  it("handles multi-line block7 remarks", async () => {
    const data = { ...complete8130Data, block7: Array(20).fill("Inspection step completed successfully per CMM specification.").join("\n") };
    const bytes = await render8130Pdf(data);
    expect(isPdfValid(bytes)).toBe(true);
  });

  it("produces multi-page PDF for very long block7", async () => {
    // 60 lines of text should overflow one page
    const longBlock7 = Array(60).fill("Detailed inspection finding: component wear within acceptable limits per CMM 72-00-00 Table 4-1 specification range. Measurement recorded and logged.").join("\n");
    const data = { ...complete8130Data, block7: longBlock7 };
    const bytes = await render8130Pdf(data);
    expect(isPdfValid(bytes)).toBe(true);
    // Multi-page PDFs are significantly larger
    const singlePageBytes = await render8130Pdf(complete8130Data);
    expect(bytes.length).toBeGreaterThan(singlePageBytes.length);
  });

  it("includes hash in footer when provided", async () => {
    const withHash = await render8130Pdf(complete8130Data, "abc123def456");
    const withoutHash = await render8130Pdf(complete8130Data);
    // PDF with hash should be slightly larger (contains extra text)
    expect(withHash.length).toBeGreaterThan(withoutHash.length);
  });

  it("handles null hash gracefully", async () => {
    const bytes = await render8130Pdf(complete8130Data, null);
    expect(isPdfValid(bytes)).toBe(true);
  });
});


// ══════════════════════════════════════════════════════════════
// Form 337 Tests (US-004)
// ══════════════════════════════════════════════════════════════
describe("render337Pdf", () => {
  it("produces valid PDF from complete data", async () => {
    const bytes = await render337Pdf(complete337Data);
    expect(isPdfValid(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1024);
  });

  it("handles empty content without crashing", async () => {
    const bytes = await render337Pdf({});
    expect(isPdfValid(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1024);
  });

  it("handles missing sub-objects gracefully", async () => {
    // All sub-objects missing — should use defaults and dashes
    const bytes = await render337Pdf({ repairType: "Alteration" });
    expect(isPdfValid(bytes)).toBe(true);
  });

  it("handles long workDescription text", async () => {
    const longWork = Array(30).fill("Repair step: component inspected and tested per specification.").join("\n");
    const data = { ...complete337Data, workDescription: longWork };
    const bytes = await render337Pdf(data);
    expect(isPdfValid(bytes)).toBe(true);
  });

  it("includes hash in footer when provided", async () => {
    const withHash = await render337Pdf(complete337Data, "sha256-test-hash");
    const withoutHash = await render337Pdf(complete337Data);
    expect(withHash.length).toBeGreaterThan(withoutHash.length);
  });

  it("handles multi-line owner address", async () => {
    const data = {
      ...complete337Data,
      owner: { name: "Test Corp", address: "Line 1\nLine 2\nLine 3\nLine 4" },
    };
    const bytes = await render337Pdf(data);
    expect(isPdfValid(bytes)).toBe(true);
  });
});


// ══════════════════════════════════════════════════════════════
// Form 8010-4 Tests (US-005)
// ══════════════════════════════════════════════════════════════
describe("render8010Pdf", () => {
  it("produces valid PDF from complete data", async () => {
    const bytes = await render8010Pdf(complete8010Data);
    expect(isPdfValid(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1024);
  });

  it("handles empty content without crashing", async () => {
    const bytes = await render8010Pdf({});
    expect(isPdfValid(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1024);
  });

  it("handles missing sub-objects gracefully", async () => {
    const bytes = await render8010Pdf({ dateSubmitted: "2026-01-15" });
    expect(isPdfValid(bytes)).toBe(true);
  });

  it("handles long comments text", async () => {
    const longComments = Array(30).fill("Finding: wear pattern observed consistent with normal operational stress. No action required per CMM limits.").join("\n");
    const data = { ...complete8010Data, comments: longComments };
    const bytes = await render8010Pdf(data);
    expect(isPdfValid(bytes)).toBe(true);
  });

  it("includes hash in footer when provided", async () => {
    const withHash = await render8010Pdf(complete8010Data, "sha256-defect-hash");
    const withoutHash = await render8010Pdf(complete8010Data);
    expect(withHash.length).toBeGreaterThan(withoutHash.length);
  });

  it("handles all-caps heading detection in comments", async () => {
    const data = {
      ...complete8010Data,
      comments: "CRITICAL FINDING\nBearing spalling detected.\nACTION TAKEN\nBearing replaced.",
    };
    const bytes = await render8010Pdf(data);
    expect(isPdfValid(bytes)).toBe(true);
  });
});
