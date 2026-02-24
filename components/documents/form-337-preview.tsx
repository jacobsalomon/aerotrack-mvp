// ══════════════════════════════════════════════════════════════════════
// FAA FORM 337 — Major Repair and Alteration
//
// Required when a major repair is performed on an aircraft component.
// In our demo: replacing the degraded inlet seal kit during overhaul.
//
// Uses the same FormCell/FormRow helpers and formRowIn animation
// as the other form previews. Data is hardcoded to match the
// HPC-7 Hydraulic Pump overhaul scenario.
// ══════════════════════════════════════════════════════════════════════

"use client";

import { FormCell, FormRow } from "./form-helpers";

interface Form337PreviewProps {
  animate: boolean;
}

export default function Form337Preview({ animate }: Form337PreviewProps) {
  // Delay increment between rows (ms) — controls the stagger speed
  const d = 350;

  return (
    <div className="border-2 border-slate-400 rounded-sm bg-white overflow-hidden font-serif text-sm">
      {/* Header */}
      <FormRow delay={0} animate={animate}>
        <div className="px-4 py-3 bg-slate-100 flex justify-between items-start">
          <div>
            <p className="text-lg font-bold text-slate-800 tracking-wide">MAJOR REPAIR AND ALTERATION</p>
            <p className="text-slate-500 text-xs">FAA Form 337 (10/06) — Airframe, Powerplant, Propeller, or Appliance</p>
          </div>
          <div className="text-right text-slate-500 text-xs">
            <p>OMB No. 2120-0020</p>
          </div>
        </div>
      </FormRow>

      {/* Row 1: Aircraft identification */}
      <FormRow delay={d * 1} animate={animate}>
        <div className="px-3 py-1.5">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">1. Aircraft</p>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Nationality & Reg. Mark</p>
              <p className="text-blue-800 font-bold font-mono">N89247</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Serial No.</p>
              <p className="text-slate-800">42891</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Make</p>
              <p className="text-slate-800">Boeing</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">Model / Series</p>
              <p className="text-slate-800">737-800</p>
            </div>
          </div>
        </div>
      </FormRow>

      {/* Row 2: Owner */}
      <FormRow delay={d * 2} animate={animate}>
        <div className="grid grid-cols-2">
          <FormCell label="2. Owner (Name)" value="Southwest Airlines Co." />
          <FormCell label="Address" value={"2702 Love Field Dr\nDallas, TX 75235"} />
        </div>
      </FormRow>

      {/* Row 3: Type + Unit Identification */}
      <FormRow delay={d * 3} animate={animate}>
        <div className="px-3 py-1.5">
          <div className="grid grid-cols-6 gap-2 text-xs">
            <div>
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider">4. Type</p>
              <p className="text-slate-800"><span className="inline-block w-3.5 h-3.5 border rounded-sm bg-slate-800 text-white text-center leading-[14px] text-[10px] mr-0.5 align-text-bottom">×</span> Repair</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider">Unit</p>
              <p className="text-slate-800 font-medium">APPLIANCE</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider">5. Make</p>
              <p className="text-slate-800">Parker Aerospace</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider">Model</p>
              <p className="text-blue-800 font-bold font-mono">881700-1089</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider">Serial No.</p>
              <p className="text-blue-800 font-bold font-mono">SN-2024-11432</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider">Type</p>
              <p className="text-slate-800">Hydraulic Pump</p>
            </div>
          </div>
          <p className="text-blue-500 text-[8px] italic mt-1 font-sans">← QR SCAN + DATABASE</p>
        </div>
      </FormRow>

      {/* Row 4: Conformity Statement */}
      <FormRow delay={d * 4} animate={animate}>
        <div className="px-3 py-1.5">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">6. Conformity Statement</p>
          <div className="grid grid-cols-3 gap-3 text-xs mb-2">
            <div>
              <p className="text-slate-400 text-[10px] font-sans">A. Agency</p>
              <p className="text-slate-800">ST Engineering Aerospace<br/>540 Airport Blvd, Burlingame, CA 94010</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">B. Kind of Agency</p>
              <p className="text-slate-800"><span className="inline-block w-3.5 h-3.5 border rounded-sm bg-slate-800 text-white text-center leading-[14px] text-[10px] mr-0.5 align-text-bottom">×</span> Certificated Repair Station</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-sans">C. Certificate No.</p>
              <p className="text-blue-800 font-bold font-mono">R4RS289K</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 italic">
            D. I certify that the repair made to the unit(s) identified in item 5 have been made in
            accordance with the requirements of Part 43 of the U.S. Federal Aviation Regulations.
          </p>
          <p className="text-blue-800 italic text-base mt-1">M. Thompson <span className="text-slate-500 text-[10px] not-italic ml-2">08/FEB/2024</span></p>
        </div>
      </FormRow>

      {/* Row 5: Approval for Return to Service */}
      <FormRow delay={d * 5} animate={animate}>
        <div className="px-3 py-1.5">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">7. Approval for Return to Service</p>
          <div className="flex items-center gap-4 text-xs mb-1">
            <p className="text-slate-800"><span className="inline-block w-3.5 h-3.5 border rounded-sm bg-slate-800 text-white text-center leading-[14px] text-[10px] mr-0.5 align-text-bottom">×</span> Approved</p>
            <p className="text-slate-400"><span className="inline-block w-3.5 h-3.5 border rounded-sm border-slate-400 mr-0.5 align-text-bottom"></span> Rejected</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-800">
            <p><span className="inline-block w-3.5 h-3.5 border rounded-sm bg-slate-800 text-white text-center leading-[14px] text-[10px] mr-0.5 align-text-bottom">×</span> Repair Station</p>
            <p className="text-slate-500">Certificate: R4RS289K</p>
          </div>
          <p className="text-blue-800 italic text-base mt-1">M. Thompson <span className="text-slate-500 text-[10px] not-italic ml-2">08/FEB/2024</span></p>
        </div>
      </FormRow>

      {/* Row 6: Description of Work Accomplished */}
      <FormRow delay={d * 6} animate={animate}>
        <div className="px-3 py-2">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">8. Description of Work Accomplished</p>
          <div className="text-xs text-slate-700 space-y-2 leading-relaxed">
            <p>
              Major repair of HPC-7 Hydraulic Pump (P/N 881700-1089, S/N SN-2024-11432)
              per CMM 881700-OH Rev. 12.
            </p>
            <p>
              Work included complete disassembly, cleaning, inspection, parts replacement
              (Inlet Port Seal Kit P/N 881700-4022), reassembly, and functional testing per
              manufacturer specifications.
            </p>
            <p>
              Inlet Port Seal Kit replaced due to degradation (Shore hardness 82A at 8,247
              flight hours). Fleet data indicates accelerated aging pattern on this part number
              beyond 7,500 flight hours.
              <span className="text-blue-500 text-[8px] italic ml-1 font-sans">← VIDEO TRANSCRIPT + AI ANALYSIS</span>
            </p>
            <p>
              All other components within manufacturer tolerances. Pressure test (3,000 PSI)
              and flow rate test (12.4 GPM) passed.
            </p>
            <p className="text-green-700 font-bold">Component returned to service — Overhauled.</p>
          </div>
        </div>
      </FormRow>

      {/* Row 7: AeroVision verification footer */}
      <FormRow delay={d * 7} animate={animate}>
        <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="border border-blue-300 bg-blue-50 px-1.5 py-0.5 rounded text-blue-700 text-[9px] font-sans font-medium">AeroVision Verified</span>
            <span className="font-mono text-slate-400">SHA-256: e7b2...4f1a</span>
          </div>
          <p className="text-[10px] text-slate-400 font-sans">Auto-populated from inspection evidence</p>
        </div>
      </FormRow>
    </div>
  );
}
