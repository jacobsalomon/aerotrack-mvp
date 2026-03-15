// ══════════════════════════════════════════════════════════════════════
// EASA FORM 1 — Authorized Release Certificate (European)
//
// European equivalent of FAA 8130-3. Rendered in the reviewer cockpit
// when an AI-generated EASA Form 1 is being reviewed. Also available
// as a preview in the glasses demo for EASA-regulated scenarios.
//
// Uses the same FormCell/FormRow helpers and formRowIn animation
// as the other form previews.
// ══════════════════════════════════════════════════════════════════════

"use client";

import { FormCell, FormRow } from "./form-helpers";

// Data shape matches the block layout of EASA Form 1.
// Each block corresponds to a numbered section on the official form.
export interface EASAForm1Data {
  block1: string;   // Approving competent authority (e.g., "EASA")
  block3: string;   // Form tracking number
  block4: string;   // Organization name and address
  block5: string;   // Work order / contract / invoice
  block6a: string;  // Item description
  block6b: string;  // Part number
  block6c: string;  // Serial number
  block6d: string;  // Quantity
  block7: string;   // Remarks (narrative)
  block8?: string;  // Part 21 production release
  block9?: string;  // Part 145 maintenance release
  block10?: string; // Other regulation
  block11: string;  // Approval / authorization number
  block12: string;  // Date
  block13: string;  // Authorized signature
  block14: string;  // Certifying statement
}

interface EASAForm1PreviewProps {
  data?: EASAForm1Data;
  // When true, plays the staggered reveal animation
  animate?: boolean;
  // Called when animation finishes
  onAnimationComplete?: () => void;
}

// Default demo data for the HPC-7 scenario (EASA variant)
const DEMO_DATA: EASAForm1Data = {
  block1: "EASA",
  block3: "EASA-ARC-2025-0347",
  block4: "AeroVision Certified MRO\n123 Maintenance Way, Frankfurt, DE 60311",
  block5: "WO-2025-0089",
  block6a: "HPC-7 Hydraulic Pump — Complete Overhaul",
  block6b: "881700-1089",
  block6c: "SN-2024-11432",
  block6d: "1",
  block7: "Complete overhaul performed per CMM 881700-OH Rev. 12. All measurements within tolerance per EASA Part 145 requirements. Inlet port seal replaced. 23 torque values verified. Visual and dimensional inspections complete. Component tested to specification — no anomalies detected.",
  block9: "Part 145 maintenance release — overhaul per CMM 881700-OH",
  block11: "EASA.145.1234",
  block12: new Date().toISOString().slice(0, 10),
  block13: "[PENDING SIGNATURE]",
  block14: "Certifies that the work identified in this document and described in the remarks was carried out in accordance with Part 145 and the item is considered ready for release to service.",
};

export default function EASAForm1Preview({
  data,
  animate = false,
}: EASAForm1PreviewProps) {
  const d = 350; // Delay increment between rows (ms)
  const form = data || DEMO_DATA;

  return (
    <div className="border-2 border-slate-400 rounded-sm bg-white overflow-hidden font-serif text-sm">
      {/* Header — dark blue bar with EASA branding */}
      <FormRow delay={0} animate={animate}>
        <div className="px-4 py-3 bg-blue-950 flex justify-between items-start">
          <div>
            <p className="text-lg font-bold text-white tracking-wide">EASA FORM 1</p>
            <p className="text-blue-300 text-xs">AUTHORIZED RELEASE CERTIFICATE</p>
          </div>
          <div className="text-right">
            <p className="text-blue-200 text-sm font-bold">EU</p>
            <p className="text-blue-400 text-[10px]">Regulation (EU) No 748/2012</p>
          </div>
        </div>
      </FormRow>

      {/* Block 1 + 3: Authority and Tracking Number */}
      <FormRow delay={d * 1} animate={animate}>
        <div className="grid grid-cols-2">
          <FormCell label="Block 1 — Approving Authority" value={form.block1} highlight />
          <FormCell label="Block 3 — Form Tracking Number" value={form.block3} highlight />
        </div>
      </FormRow>

      {/* Block 4: Organization */}
      <FormRow delay={d * 2} animate={animate}>
        <FormCell
          label="Block 4 — Organization Name and Address"
          value={form.block4}
          className="col-span-full"
        />
      </FormRow>

      {/* Block 5: Work Order */}
      <FormRow delay={d * 3} animate={animate}>
        <FormCell label="Block 5 — Work Order / Contract / Invoice" value={form.block5} />
      </FormRow>

      {/* Block 6: Item Identification */}
      <FormRow delay={d * 4} animate={animate}>
        <div className="grid grid-cols-4">
          <FormCell label="6a. Description" value={form.block6a} />
          <FormCell label="6b. Part Number" value={form.block6b} highlight />
          <FormCell label="6c. Serial Number" value={form.block6c} highlight />
          <FormCell label="6d. Quantity" value={form.block6d} />
        </div>
      </FormRow>

      {/* Block 7: Remarks */}
      <FormRow delay={d * 5} animate={animate}>
        <div className="px-2.5 py-1.5">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider leading-tight">
            Block 7 — Remarks
          </p>
          <p className="mt-0.5 text-xs text-slate-800 whitespace-pre-line leading-relaxed">
            {form.block7}
          </p>
        </div>
      </FormRow>

      {/* Block 8-10: Release Type */}
      <FormRow delay={d * 6} animate={animate}>
        <div className="px-2.5 py-1.5 bg-slate-50">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider leading-tight mb-1">
            Release to Service
          </p>
          <div className="space-y-0.5 text-xs">
            {form.block8 && form.block8 !== "N/A" && (
              <p className="text-slate-700">
                <span className="font-bold text-green-700">[X]</span> Block 8 — Part 21 (Production): {form.block8}
              </p>
            )}
            {form.block9 && form.block9 !== "N/A" && (
              <p className="text-slate-700">
                <span className="font-bold text-green-700">[X]</span> Block 9 — Part 145 (Maintenance): {form.block9}
              </p>
            )}
            {form.block10 && form.block10 !== "N/A" && (
              <p className="text-slate-700">
                <span className="font-bold text-green-700">[X]</span> Block 10 — Other: {form.block10}
              </p>
            )}
            {!form.block8 && !form.block9 && !form.block10 && (
              <p className="text-slate-400 italic">No release type specified</p>
            )}
          </div>
        </div>
      </FormRow>

      {/* Block 11-13: Authorization */}
      <FormRow delay={d * 7} animate={animate}>
        <div className="grid grid-cols-3">
          <FormCell label="Block 11 — Approval Number" value={form.block11} highlight />
          <FormCell label="Block 12 — Date" value={form.block12} />
          <FormCell label="Block 13 — Authorized Signature" value={form.block13} />
        </div>
      </FormRow>

      {/* Block 14: Certifying Statement */}
      <FormRow delay={d * 8} animate={animate}>
        <div className="px-2.5 py-1.5 bg-blue-50 border-t-2 border-blue-200">
          <p className="text-[10px] text-blue-400 font-sans uppercase tracking-wider leading-tight">
            Block 14 — Certifying Statement
          </p>
          <p className="mt-0.5 text-xs text-blue-900 leading-relaxed">
            {form.block14}
          </p>
        </div>
      </FormRow>
    </div>
  );
}
