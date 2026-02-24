// ══════════════════════════════════════════════════════════════════════
// FAA FORM 8010-4 — Malfunction or Defect Report
//
// Filed when a defect is discovered during maintenance. AeroVision
// auto-generates this because the AI noticed a degraded seal AND
// flagged a fleet-wide pattern — this report alerts the FAA to a
// potential trend.
//
// Uses the same FormCell/FormRow helpers and formRowIn animation
// as the other form previews. Data is hardcoded to match the
// HPC-7 Hydraulic Pump overhaul scenario.
// ══════════════════════════════════════════════════════════════════════

"use client";

import { FormCell, FormRow } from "./form-helpers";

interface Form8010PreviewProps {
  animate: boolean;
}

export default function Form8010Preview({ animate }: Form8010PreviewProps) {
  // Delay increment between rows (ms) — controls the stagger speed
  const d = 350;

  return (
    <div className="border-2 border-slate-400 rounded-sm bg-white overflow-hidden font-serif text-sm">
      {/* Header */}
      <FormRow delay={0} animate={animate}>
        <div className="px-4 py-3 bg-slate-100 flex justify-between items-start">
          <div>
            <p className="text-lg font-bold text-slate-800 tracking-wide">MALFUNCTION OR DEFECT REPORT</p>
            <p className="text-slate-500 text-xs">FAA Form 8010-4 (10-92)</p>
          </div>
          <div className="text-right text-slate-500 text-xs">
            <p>OMB No. 2120-0663</p>
          </div>
        </div>
      </FormRow>

      {/* Row 1: Aircraft identification */}
      <FormRow delay={d * 1} animate={animate}>
        <div className="grid grid-cols-4">
          <FormCell label="1. A/C Reg. No." value="N89247" highlight />
          <FormCell label="Manufacturer" value="Boeing" />
          <FormCell label="Model / Series" value="737-800" />
          <FormCell label="Serial Number" value="42891" />
        </div>
      </FormRow>

      {/* Row 2: Aircraft / Powerplant / Propeller */}
      <FormRow delay={d * 2} animate={animate}>
        <div className="grid grid-cols-3">
          <FormCell label="2. Aircraft" value="Boeing 737-800" />
          <FormCell label="3. Powerplant" value="—" />
          <FormCell label="4. Propeller" value="—" />
        </div>
      </FormRow>

      {/* Row 3: Specific Part Causing Trouble */}
      <FormRow delay={d * 3} animate={animate}>
        <div className="px-3 py-1.5">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">5. Specific Part (of component) Causing Trouble</p>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Part Name</p>
              <p className="text-amber-600 font-bold">Inlet Port Seal Kit</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">MFG. Model or Part No.</p>
              <p className="text-blue-800 font-bold font-mono">881700-4022</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Serial No.</p>
              <p className="text-slate-800">SN-2024-S4022</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Part/Defect Location</p>
              <p className="text-slate-800">Inlet Port</p>
            </div>
          </div>
          <p className="text-blue-500 text-[8px] italic mt-1 font-sans">← VIDEO + MEASUREMENT</p>
        </div>
      </FormRow>

      {/* Row 4: Component / Appliance */}
      <FormRow delay={d * 4} animate={animate}>
        <div className="px-3 py-1.5">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">6. Appliance/Component (Assembly that Includes Part)</p>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Comp/Appl Name</p>
              <p className="text-slate-800">HPC-7 Hydraulic Pump</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Manufacturer</p>
              <p className="text-slate-800">Parker Aerospace</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Model or Part No.</p>
              <p className="text-blue-800 font-bold font-mono">881700-1089</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Serial Number</p>
              <p className="text-blue-800 font-bold font-mono">SN-2024-11432</p>
            </div>
          </div>
          <p className="text-blue-500 text-[8px] italic mt-1 font-sans">← QR SCAN</p>
        </div>
      </FormRow>

      {/* Row 5: Part metrics + date */}
      <FormRow delay={d * 5} animate={animate}>
        <div className="grid grid-cols-4">
          <FormCell label="Part TT" value="8,247 hrs" />
          <FormCell label="Part TSO" value="8,247 hrs" source="DATABASE" />
          <FormCell label="Part Condition" value="Degraded" highlight />
          <FormCell label="7. Date Submitted" value="08/FEB/2024" />
        </div>
      </FormRow>

      {/* Row 6: Comments — the detailed defect narrative */}
      <FormRow delay={d * 6} animate={animate}>
        <div className="px-3 py-2">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">8. Comments</p>
          <div className="text-xs text-slate-700 space-y-2 leading-relaxed">
            <p>
              During overhaul inspection of HPC-7 Hydraulic Pump (P/N 881700-1089,
              S/N SN-2024-11432), Inlet Port Seal Kit (P/N 881700-4022) found with
              Shore hardness of 82A (specification minimum: 75A). While currently
              within tolerance, degradation pattern is consistent with accelerated
              aging at high flight hours.
              <span className="text-blue-500 text-[8px] italic ml-1 font-sans">← VIDEO + MEASUREMENT</span>
            </p>
            <p>
              <span className="text-amber-600 font-bold">Fleet data analysis:</span>{" "}
              881700-4022 seals on units exceeding 7,500 flight hours show increased
              failure rates. 4 of 12 units in fleet sample required unscheduled
              replacement within 1,000 hours of the 7,500-hour threshold.
              <span className="text-blue-500 text-[8px] italic ml-1 font-sans">← AI FLEET ANALYSIS</span>
            </p>
            <div>
              <p className="font-bold text-slate-700 text-[11px] mb-0.5 font-sans">RECOMMENDATIONS:</p>
              <p className="ml-2">1. Replace seal kit during any overhaul at or beyond 7,500 flight hours</p>
              <p className="ml-2">2. Consider fleet-wide inspection campaign for units approaching 7,500 hours</p>
              <p className="ml-2">3. Recommend Parker Aerospace evaluate for potential service bulletin</p>
            </div>
          </div>
        </div>
      </FormRow>

      {/* Row 7: Submitted by + AeroVision footer */}
      <FormRow delay={d * 7} animate={animate}>
        <div className="px-3 py-1.5">
          <div className="grid grid-cols-3 gap-3 text-xs mb-2">
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Submitted By</p>
              <p className="text-slate-800">Repair Station</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Operator Designation</p>
              <p className="text-slate-800">R4RS289K</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Telephone</p>
              <p className="text-slate-800">(650) 555-0142</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className="border border-blue-300 bg-blue-50 px-1.5 py-0.5 rounded text-blue-700 text-[9px] font-sans font-medium">AeroVision Verified</span>
              <span className="font-mono text-slate-400">SHA-256: 3c9e...87a2</span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans">Auto-generated from AI fleet analysis</p>
          </div>
        </div>
      </FormRow>
    </div>
  );
}
