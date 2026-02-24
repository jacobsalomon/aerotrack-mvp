"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
import { FormCell, FormRow, FORM_ROW_KEYFRAME } from "@/components/documents/form-helpers";
import Form337Preview from "@/components/documents/form-337-preview";
import Form8010Preview from "@/components/documents/form-8010-preview";

// ══════════════════════════════════════════════════════════════════════
// SMART GLASSES HUD VIEW
// Shows what a mechanic would see through smart glasses during an
// overhaul. Auto-plays a scripted demo sequence with voice transcription,
// findings, measurements, and AI-generated documentation — all hands-free.
//
// FLOW:
//   1. Pre-start screen (user clicks START)
//   2. 43-second HUD simulation (auto-plays)
//   3. "Generating" transition (3 seconds)
//   4. Document Review — three auto-populated FAA forms
//
// This is a standalone page (no sidebar, no navigation) designed for
// full-screen immersive presentation during the HEICO demo.
// ══════════════════════════════════════════════════════════════════════

// ── TYPES ────────────────────────────────────────────────────────────

// Bill of Materials — sub-components of the HPC-7 Hydraulic Pump (P/N 881700-1089)
// Each sub-component gets checked off as the mechanic inspects it
interface BomItem {
  partNumber: string;
  description: string;
  inspected: boolean;
}

const INITIAL_BOM: BomItem[] = [
  { partNumber: "881700-2010", description: "Piston Assembly",    inspected: false },
  { partNumber: "881700-3045", description: "Gear Train Assembly", inspected: false },
  { partNumber: "881700-4022", description: "Inlet Port Seal Kit", inspected: false },
  { partNumber: "881700-5008", description: "Shaft Bearing",       inspected: false },
  { partNumber: "881700-6001", description: "Pump Housing",        inspected: false },
  { partNumber: "881700-7003", description: "Relief Valve",        inspected: false },
];

// The scripted demo sequence — each event appears at a timed interval
// to simulate a mechanic working through an inspection
interface HudEvent {
  time: number;
  type: "scan" | "transcript" | "finding" | "measurement" | "photo" | "action" | "document" | "status";
  text: string;
  detail?: string;
  severity?: "green" | "amber" | "red" | "blue";
  bomIndex?: number;
}

const DEMO_SCRIPT: HudEvent[] = [
  // Part identification
  { time: 1000, type: "status", text: "INITIALIZING AEROVISION...", severity: "blue" },
  { time: 2500, type: "status", text: "CAMERA ACTIVE | VOICE REC ON", severity: "green" },
  { time: 3500, type: "scan", text: "SCANNING...", detail: "QR code detected in viewport" },
  { time: 5000, type: "scan", text: "PART IDENTIFIED", detail: "P/N 881700-1089 | S/N SN-2024-11432 | HPC-7 Hydraulic Pump" },
  { time: 6000, type: "status", text: "BOM LOADED — 6 SUB-COMPONENTS | 12 LIFECYCLE EVENTS", severity: "blue" },
  { time: 7000, type: "status", text: "STEP 3 OF 6: INSPECT", severity: "green" },

  // Mechanic begins inspecting piston assembly (BOM item 0: P/N 881700-2010)
  { time: 8500, type: "transcript", text: "\"Inspecting piston bore under magnification...\"", bomIndex: 0 },
  { time: 10000, type: "photo", text: "PHOTO CAPTURED", detail: "881700-2010 Piston Assembly — bore at 10x" },
  { time: 11000, type: "transcript", text: "\"No scoring or pitting visible. Bore looks clean.\"" },
  { time: 12500, type: "transcript", text: "\"Measuring diameter now...\"" },

  // Piston measurement
  { time: 14000, type: "measurement", text: "881700-2010 BORE DIAMETER", detail: "2.4985 in. | Spec: 2.500 ± 0.002 in.", severity: "green" },
  { time: 15000, type: "finding", text: "881700-2010 Piston Assembly — SERVICEABLE", detail: "Within tolerance per CMM 881700-OH §70-20", severity: "green" },

  // Gear train assembly (BOM item 1: P/N 881700-3045)
  { time: 17000, type: "transcript", text: "\"Moving to gear train assembly... checking backlash.\"", bomIndex: 1 },
  { time: 18500, type: "measurement", text: "881700-3045 GEAR BACKLASH", detail: "0.004 in. | Spec: 0.003–0.006 in.", severity: "green" },
  { time: 19500, type: "finding", text: "881700-3045 Gear Train — SERVICEABLE", detail: "Within tolerance per CMM §70-40", severity: "green" },

  // Inlet port seal (BOM item 2: P/N 881700-4022) — the dramatic moment
  { time: 21000, type: "transcript", text: "\"Now checking inlet port seal kit...\"", bomIndex: 2 },
  { time: 22500, type: "transcript", text: "\"Seal looks degraded. Checking hardness...\"" },
  { time: 24000, type: "measurement", text: "881700-4022 SEAL HARDNESS", detail: "Shore 82A | Spec: min 75A | Within limits but degraded", severity: "amber" },
  { time: 25500, type: "transcript", text: "\"Hardness is 82A — still in limits, but given 8,200 hours on this unit, I'd replace it.\"" },
  { time: 27000, type: "finding", text: "881700-4022 Inlet Seal Kit — RECOMMEND REPLACE", detail: "Shore 82A, within limits but degraded at 8,200 hrs", severity: "amber" },
  { time: 28000, type: "photo", text: "PHOTO CAPTURED", detail: "881700-4022 Inlet seal — degradation visible" },

  // AI picks up tribal knowledge about this specific part number
  { time: 29500, type: "action", text: "AI NOTE: 881700-4022 seals on units >7,500 hrs showed failure within 1,000 hrs across fleet. Replacement recommended.", severity: "blue" },

  // Transition to documentation
  { time: 32000, type: "status", text: "INSPECTION COMPLETE — 3 OF 6 BOM ITEMS INSPECTED, 3 FINDINGS", severity: "green" },
  { time: 33500, type: "transcript", text: "\"That's the inspection done. Generate docs.\"" },
  { time: 34500, type: "status", text: "VOICE COMMAND: GENERATE DOCUMENTS", severity: "blue" },
  { time: 35500, type: "document", text: "GENERATING FAA 8130-3...", severity: "blue" },
  { time: 37000, type: "document", text: "GENERATING WORK ORDER...", severity: "blue" },
  { time: 38500, type: "document", text: "UPDATING PART PROVENANCE RECORDS...", severity: "blue" },

  // Documentation ready
  { time: 40000, type: "document", text: "ALL DOCUMENTS READY", detail: "8130-3 | Work Order | Provenance Records | Test Results", severity: "green" },
  { time: 41500, type: "status", text: "SAY 'REVIEW' TO OPEN | SAY 'APPROVE' TO SIGN", severity: "green" },
  { time: 43000, type: "status", text: "TIME SAVED VS. MANUAL PAPERWORK: ~1.5 HOURS", severity: "green" },
];


// ══════════════════════════════════════════════════════════════════════
// FORM RENDERERS — Light-themed FAA form components for the doc review
// phase. Styled to match the normal web app UI (not the HUD).
// FormCell, FormRow are imported from @/components/documents/form-helpers.
// Form337Preview, Form8010Preview are imported from @/components/documents/.
// Form8130 stays inline here because it uses a different data layout
// than the reusable Form8130Preview component.
// ══════════════════════════════════════════════════════════════════════

// ── FAA FORM 8130-3: Authorized Release Certificate ──────────────────
// The most important form — certifies a part is airworthy after overhaul.
// This is what gets generated at the end of every overhaul workflow.
function Form8130({ animate }: { animate: boolean }) {
  const d = 350; // delay increment between rows (ms)

  return (
    <div className="border-2 border-slate-400 rounded-sm bg-white overflow-hidden font-serif text-sm">
      {/* Header */}
      <FormRow delay={0} animate={animate}>
        <div className="px-4 py-3 bg-slate-100 flex justify-between items-start">
          <div>
            <p className="text-lg font-bold text-slate-800 tracking-wide">AUTHORIZED RELEASE CERTIFICATE</p>
            <p className="text-slate-500 text-xs">FAA Form 8130-3 (02-14)</p>
          </div>
          <div className="text-right text-slate-500 text-xs">
            <p>OMB No. 2120-0020</p>
          </div>
        </div>
      </FormRow>

      {/* Row 1: Authority + Tracking Number */}
      <FormRow delay={d * 1} animate={animate}>
        <div className="grid grid-cols-3">
          <FormCell label="1. Approving Authority / Country" value="FAA / United States" />
          <FormCell label="2." value="Authorized Release Certificate" />
          <FormCell label="3. Form Tracking Number" value="ATK-2024-08847-8130" highlight />
        </div>
      </FormRow>

      {/* Row 2: Organization + Work Order */}
      <FormRow delay={d * 2} animate={animate}>
        <div className="grid grid-cols-2">
          <FormCell
            label="4. Organization Name and Address"
            value={"ST Engineering Aerospace\n540 Airport Blvd\nBurlingame, CA 94010"}
          />
          <FormCell label="5. Work Order Number" value="WO-2024-08847" source="WORK ORDER SYSTEM" />
        </div>
      </FormRow>

      {/* Row 3: Item details — the parts identification row */}
      <FormRow delay={d * 3} animate={animate}>
        <div className="grid grid-cols-6">
          <FormCell label="6. Item" value="1" />
          <FormCell label="7. Description" value="HPC-7 Hydraulic Pump" source="QR SCAN" />
          <FormCell label="8. Part Number" value="881700-1089" highlight source="QR SCAN" />
          <FormCell label="9. Qty" value="1" />
          <FormCell label="10. Serial Number" value="SN-2024-11432" highlight source="QR SCAN" />
          <FormCell label="11. Status/Work" value="Overhauled" />
        </div>
      </FormRow>

      {/* Row 4: Remarks — the big narrative block where all findings go */}
      <FormRow delay={d * 4} animate={animate}>
        <div className="px-3 py-2">
          <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">12. Remarks</p>
          <div className="text-xs text-slate-700 space-y-2 leading-relaxed">
            <p>Full overhaul per CMM 881700-OH Rev. 12, §70-00 through §70-90.</p>
            <div>
              <p className="font-bold text-slate-700 text-[11px] mb-0.5 font-sans">INSPECTION FINDINGS:</p>
              <p className="ml-2">
                <span className="text-green-600">✓</span> 881700-2010 Piston Assembly: Bore 2.4985 in (spec 2.500 ± 0.002) —{" "}
                <span className="text-green-700 font-bold">SERVICEABLE</span>
                <span className="text-blue-500 text-[8px] italic ml-1">← MEASUREMENT</span>
              </p>
              <p className="ml-2">
                <span className="text-green-600">✓</span> 881700-3045 Gear Train: Backlash 0.004 in (spec 0.003–0.006) —{" "}
                <span className="text-green-700 font-bold">SERVICEABLE</span>
                <span className="text-blue-500 text-[8px] italic ml-1">← MEASUREMENT</span>
              </p>
              <p className="ml-2">
                <span className="text-amber-500">⚠</span> 881700-4022 Inlet Seal Kit: Shore 82A (spec min 75A) —{" "}
                <span className="text-amber-600 font-bold">REPLACED</span>
                <span className="text-blue-500 text-[8px] italic ml-1">← VIDEO + MEASUREMENT</span>
              </p>
            </div>
            <div>
              <p className="font-bold text-slate-700 text-[11px] mb-0.5 font-sans">PARTS REPLACED:</p>
              <p className="ml-2">881700-4022 Inlet Port Seal Kit, Qty 1 (New, CoC ref: COC-2024-1847)</p>
            </div>
            <div>
              <p className="font-bold text-slate-700 text-[11px] mb-0.5 font-sans">TEST RESULTS:</p>
              <p className="ml-2">
                <span className="text-green-600">✓</span> Pressure Test: 3,000 PSI —{" "}
                <span className="text-green-700 font-bold">PASS</span> (spec: 2,800–3,200 PSI)
              </p>
              <p className="ml-2">
                <span className="text-green-600">✓</span> Flow Rate: 12.4 GPM —{" "}
                <span className="text-green-700 font-bold">PASS</span> (spec: 11.5–13.0 GPM)
              </p>
            </div>
          </div>
        </div>
      </FormRow>

      {/* Row 5: Conformity checkboxes */}
      <FormRow delay={d * 5} animate={animate}>
        <div className="grid grid-cols-2">
          <div className="border-r border-slate-200 px-2.5 py-1.5">
            <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">13a. Certifies Conformity To</p>
            <p className="text-xs text-slate-700">
              <span className="inline-block w-3.5 h-3.5 border rounded-sm bg-slate-800 text-white text-center leading-[14px] text-[10px] mr-1 align-text-bottom">×</span>
              Approved design data, condition for safe operation
            </p>
          </div>
          <div className="px-2.5 py-1.5">
            <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">14a. Return to Service</p>
            <p className="text-xs text-slate-700">
              <span className="inline-block w-3.5 h-3.5 border rounded-sm bg-slate-800 text-white text-center leading-[14px] text-[10px] mr-1 align-text-bottom">×</span>
              14 CFR 43.9
            </p>
          </div>
        </div>
      </FormRow>

      {/* Row 6: Signature blocks */}
      <FormRow delay={d * 6} animate={animate}>
        <div className="grid grid-cols-2">
          <div className="border-r border-slate-200 px-2.5 py-2">
            <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">13b–e. Manufacturing/Overhaul Certification</p>
            <p className="text-blue-800 italic text-base">M. Thompson</p>
            <p className="text-slate-500 text-[10px]">A&P/IA | Auth: R4RS289K | 08/FEB/2024</p>
            <p className="text-blue-500 text-[8px] italic">← BADGE READER</p>
          </div>
          <div className="px-2.5 py-2">
            <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">14b–e. Return to Service Certification</p>
            <p className="text-blue-800 italic text-base">M. Thompson</p>
            <p className="text-slate-500 text-[10px]">IA-2847291 | 08/FEB/2024</p>
            <p className="text-blue-500 text-[8px] italic">← BADGE READER</p>
          </div>
        </div>
      </FormRow>

      {/* Row 7: AeroVision verification footer */}
      <FormRow delay={d * 7} animate={animate}>
        <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="border border-blue-300 bg-blue-50 px-1.5 py-0.5 rounded text-blue-700 text-[9px] font-sans font-medium">AeroVision Verified</span>
            <span className="font-mono text-slate-400">SHA-256: a4f8...c91d</span>
          </div>
          <p className="text-[10px] text-slate-400 font-sans">Tamper-evident | AI-generated v1.0</p>
        </div>
      </FormRow>
    </div>
  );
}


// Form337 and Form8010 are now imported from @/components/documents/
// as Form337Preview and Form8010Preview respectively.


// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════

// The four phases of the demo
type DemoPhase = "pre-start" | "hud" | "generating" | "doc-review";

export default function GlassesDemoPage() {
  // ── ROUTER ──
  const router = useRouter();

  // ── PHASE STATE ──
  // Controls which screen is showing
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("pre-start");

  // ── HUD STATE ──
  // Events that have appeared so far (accumulates over time)
  const [visibleEvents, setVisibleEvents] = useState<HudEvent[]>([]);
  const [statusLine, setStatusLine] = useState("STANDBY");
  const [statusColor, setStatusColor] = useState<"green" | "amber" | "red" | "blue">("blue");
  const [transcript, setTranscript] = useState("");
  const [findings, setFindings] = useState<{ text: string; severity: string }[]>([]);
  const [measurements, setMeasurements] = useState<{ text: string; detail: string; severity: string }[]>([]);
  const [flashActive, setFlashActive] = useState(false);
  const [partInfo, setPartInfo] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string | null>(null);
  const [bom, setBom] = useState<BomItem[]>(INITIAL_BOM.map(b => ({ ...b })));
  const [currentImage, setCurrentImage] = useState(`${basePath}/glasses/glasses-1-scan.jpg`);

  // ── GENERATING SCREEN STATE ──
  // Tracks which progress steps are visible during the "generating" transition
  const [generatingStep, setGeneratingStep] = useState(0);

  // ── DOC REVIEW STATE ──
  // Which form tab is currently selected
  const [activeFormTab, setActiveFormTab] = useState<"8130" | "337" | "8010">("8130");
  // Which forms have already been animated (so we don't re-animate on tab switch)
  const [animatedForms, setAnimatedForms] = useState<Set<string>>(new Set());

  // ── REFS ──
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  // ── START DEMO ──
  // Kicks off the full demo flow: HUD → generating → doc review
  function startDemo() {
    // Reset everything
    setDemoPhase("hud");
    setVisibleEvents([]);
    setStatusLine("STANDBY");
    setStatusColor("blue");
    setTranscript("");
    setFindings([]);
    setMeasurements([]);
    setPartInfo(null);
    setDocStatus(null);
    setBom(INITIAL_BOM.map(b => ({ ...b })));
    setCurrentImage(`${basePath}/glasses/glasses-1-scan.jpg`);
    setGeneratingStep(0);
    setActiveFormTab("8130");
    setAnimatedForms(new Set());

    // Schedule camera image transitions synced to the demo phases
    const imageTransitions = [
      { time: 0,     src: `${basePath}/glasses/glasses-1-scan.jpg` },
      { time: 8500,  src: `${basePath}/glasses/glasses-3-inspect-bore.jpg` },
      { time: 17000, src: `${basePath}/glasses/glasses-2-teardown.jpg` },
      { time: 21000, src: `${basePath}/glasses/glasses-4-seal-degraded.jpg` },
      { time: 30000, src: `${basePath}/glasses/glasses-5-repair.jpg` },
      { time: 35500, src: `${basePath}/glasses/glasses-6-test.jpg` },
      { time: 40000, src: `${basePath}/glasses/glasses-7-complete.jpg` },
    ];
    imageTransitions.forEach(({ time, src }) => {
      timersRef.current.push(setTimeout(() => setCurrentImage(src), time));
    });

    // Schedule each HUD event
    DEMO_SCRIPT.forEach((event) => {
      const timer = setTimeout(() => {
        if (event.type !== "status") {
          setVisibleEvents((prev) => [...prev, event]);
        }
        if (event.bomIndex !== undefined) {
          setBom(prev => prev.map((item, i) =>
            i === event.bomIndex ? { ...item, inspected: true } : item
          ));
        }
        switch (event.type) {
          case "status":
            setStatusLine(event.text);
            setStatusColor(event.severity || "blue");
            break;
          case "scan":
            if (event.detail?.includes("P/N")) setPartInfo(event.detail);
            setStatusLine(event.text);
            setStatusColor("blue");
            break;
          case "transcript":
            setTranscript(event.text);
            break;
          case "finding":
            setFindings((prev) => [...prev, { text: event.text, severity: event.severity || "green" }]);
            break;
          case "measurement":
            setMeasurements((prev) => [...prev, { text: event.text, detail: event.detail || "", severity: event.severity || "green" }]);
            break;
          case "photo":
            setFlashActive(true);
            setTimeout(() => setFlashActive(false), 200);
            break;
          case "document":
            setDocStatus(event.text);
            if (event.severity === "green") {
              setStatusLine(event.text);
              setStatusColor("green");
            }
            break;
          case "action":
            break;
        }
      }, event.time);
      timersRef.current.push(timer);
    });

    // ── PHASE TRANSITIONS ──
    // At 45.5 seconds: switch to the "generating" screen
    timersRef.current.push(setTimeout(() => {
      setDemoPhase("generating");
      setGeneratingStep(0);
    }, 45500));

    // Animate the generating steps (evidence processing)
    const genStepTimes = [46100, 46700, 47300, 47900];
    genStepTimes.forEach((time, i) => {
      timersRef.current.push(setTimeout(() => setGeneratingStep(i + 1), time));
    });

    // At 49 seconds: switch to document review
    timersRef.current.push(setTimeout(() => {
      setDemoPhase("doc-review");
    }, 49000));
  }

  // ── RESET DEMO ──
  // Returns to the pre-start screen and clears all state
  function resetDemo() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setDemoPhase("pre-start");
    setVisibleEvents([]);
    setStatusLine("STANDBY");
    setStatusColor("blue");
    setTranscript("");
    setFindings([]);
    setMeasurements([]);
    setPartInfo(null);
    setDocStatus(null);
    setBom(INITIAL_BOM.map(b => ({ ...b })));
    setCurrentImage(`${basePath}/glasses/glasses-1-scan.jpg`);
    setGeneratingStep(0);
    setActiveFormTab("8130");
    setAnimatedForms(new Set());
  }

  // ── EFFECTS ──

  // Auto-scroll the event feed during HUD phase
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [visibleEvents]);

  // Mark forms as animated after enough time passes for the stagger animation
  // (8 rows × 350ms delay + 400ms animation = ~3.2 seconds)
  useEffect(() => {
    if (demoPhase !== "doc-review") return;
    if (animatedForms.has(activeFormTab)) return;

    const timeout = setTimeout(() => {
      setAnimatedForms(prev => new Set([...prev, activeFormTab]));
    }, 3500);

    return () => clearTimeout(timeout);
  }, [demoPhase, activeFormTab, animatedForms]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  // ── HELPERS ──

  function severityColor(severity: string) {
    switch (severity) {
      case "green": return "text-green-400";
      case "amber": return "text-amber-400";
      case "red": return "text-red-400";
      case "blue": return "text-cyan-400";
      default: return "text-green-400";
    }
  }

  function severityBorder(severity: string) {
    switch (severity) {
      case "green": return "border-green-500/40";
      case "amber": return "border-amber-500/40";
      case "red": return "border-red-500/40";
      case "blue": return "border-cyan-500/40";
      default: return "border-green-500/40";
    }
  }

  function eventIcon(type: string) {
    switch (type) {
      case "scan": return "[SCAN]";
      case "transcript": return "[VOICE]";
      case "finding": return "[FIND]";
      case "measurement": return "[MEAS]";
      case "photo": return "[PHOTO]";
      case "action": return "[AI]";
      case "document": return "[DOC]";
      default: return "[SYS]";
    }
  }


  // ══════════════════════════════════════════════════════════════════
  // RENDER: PRE-START SCREEN
  // ══════════════════════════════════════════════════════════════════
  if (demoPhase === "pre-start") {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-8">
        <div className="fixed inset-0 pointer-events-none opacity-10"
          style={{
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.03) 2px, rgba(0,255,0,0.03) 4px)",
          }}
        />
        <div className="text-center max-w-lg relative z-10">
          <p className="text-xs text-cyan-500 tracking-[0.3em] mb-4">AEROTRACK SMART GLASSES</p>
          <h1 className="text-3xl font-bold text-green-400 mb-2 tracking-wide">PREVIEW</h1>
          <p className="text-sm text-green-600 mb-8">
            Simulated view through smart glasses during component overhaul
          </p>
          <div className="border border-green-500/30 rounded p-6 mb-8 text-left text-sm text-green-500 space-y-2">
            <p>This demo shows the smart glasses experience:</p>
            <p className="text-green-400">
              &gt; Camera is always on, capturing everything the technician sees
            </p>
            <p className="text-green-400">
              &gt; Voice recording and tags let technicians add notes to captured footage
            </p>
            <p className="text-green-400">
              &gt; AI parses the work and automatically fills out FAA documentation,
              part provenance tracking, and builds verifiable records
            </p>
            <p className="mt-3 text-cyan-400">
              The mechanic never touches a screen. They just work.
            </p>
          </div>
          <button
            onClick={startDemo}
            className="bg-green-500/20 border border-green-500/50 text-green-400 px-8 py-3 font-mono tracking-wide hover:bg-green-500/30 transition-colors"
          >
            [ START SIMULATION ]
          </button>
        </div>
      </div>
    );
  }


  // ══════════════════════════════════════════════════════════════════
  // RENDER: GENERATING SCREEN
  // Brief transition showing AeroVision processing the captured evidence
  // into FAA documents. Plays for ~3.5 seconds between HUD and doc review.
  // ══════════════════════════════════════════════════════════════════
  if (demoPhase === "generating") {
    const steps = [
      { label: "43 seconds of video analyzed — key frames extracted", done: true },
      { label: "Voice transcript parsed — 3 findings, 1 recommendation", done: true },
      { label: "3 measurements cross-referenced with CMM 881700-OH", done: true },
      { label: "Auto-populating 3 FAA documents...", done: false },
    ];

    return (
      <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-8">
        {/* Scan line effect */}
        <div className="fixed inset-0 pointer-events-none opacity-10"
          style={{
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.03) 2px, rgba(0,255,0,0.03) 4px)",
          }}
        />

        <div className="relative z-10 max-w-md w-full">
          <p className="text-xs text-cyan-500 tracking-[0.3em] mb-4 text-center">AEROTRACK AI</p>
          <h2 className="text-xl font-bold text-green-400 text-center mb-8 tracking-wide animate-pulse">
            PROCESSING CAPTURED EVIDENCE...
          </h2>

          {/* Progress steps — each appears with a checkmark as it completes */}
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 text-sm transition-all duration-500 ${
                  generatingStep > i
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-4"
                }`}
              >
                {/* Checkmark or spinner for the last item */}
                {step.done ? (
                  <span className="text-green-500 text-base">✓</span>
                ) : (
                  <span className="text-cyan-400 animate-spin inline-block">⟳</span>
                )}
                <span className={step.done ? "text-green-400" : "text-cyan-400"}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Evidence summary bar */}
          <div className="mt-8 border border-green-500/20 rounded-sm px-4 py-3 flex items-center justify-between text-xs text-green-600">
            <span>Source: Continuous video feed</span>
            <span>Duration: 43 sec</span>
            <span>Voice tags: 3 · Photos: 2 · Measurements: 3</span>
          </div>
        </div>
      </div>
    );
  }


  // ══════════════════════════════════════════════════════════════════
  // RENDER: DOCUMENT REVIEW SCREEN
  // Shows three auto-populated FAA forms with tabbed navigation.
  // Each form animates its fields in on first view.
  // ══════════════════════════════════════════════════════════════════
  if (demoPhase === "doc-review") {
    // Tab configuration
    const tabs: { key: "8130" | "337" | "8010"; label: string; subtitle: string }[] = [
      { key: "8130", label: "FAA 8130-3", subtitle: "Release Certificate" },
      { key: "337",  label: "FAA 337",    subtitle: "Major Repair" },
      { key: "8010", label: "FAA 8010-4", subtitle: "Defect Report" },
    ];

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 relative">
        {/* CSS keyframe for the form row stagger animation */}
        <style dangerouslySetInnerHTML={{ __html: FORM_ROW_KEYFRAME }} />

        {/* ── TOP BANNER ── */}
        <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-blue-600 font-medium tracking-wide mb-1">AEROTRACK AI — DOCUMENT REVIEW</p>
                <h1 className="text-lg font-bold text-slate-800">
                  3 FAA Documents Auto-Generated
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetDemo}
                  className="text-sm text-slate-500 hover:text-slate-800 border border-slate-300 rounded px-4 py-1.5 hover:bg-slate-100 transition-colors"
                >
                  Back to Demo
                </button>
                <button
                  onClick={() => router.push("/parts/demo-hpc7-overhaul")}
                  className="text-sm text-white bg-blue-600 hover:bg-blue-700 rounded px-4 py-1.5 transition-colors flex items-center gap-1.5"
                >
                  View Part Details
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Summary stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <span className="text-blue-600">⏱</span>
                <span className="text-blue-800 font-semibold">~1.5 hours saved</span>
                <span className="text-blue-600">vs. manual documentation</span>
              </div>
              <span className="text-slate-400 text-xs">
                Auto-populated from: continuous video · voice transcript · measurements · CMM database · fleet data
              </span>
            </div>
          </div>
        </div>

        {/* ── FORM TABS ── */}
        <div className="max-w-5xl mx-auto px-6 pt-5">
          <div className="flex gap-1 mb-5 border-b border-slate-200">
            {tabs.map(tab => {
              const isActive = activeFormTab === tab.key;
              const isComplete = animatedForms.has(tab.key);

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFormTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                    isActive
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {isComplete && <span className="text-green-600">✓</span>}
                    <span>{tab.label}</span>
                    <span className="text-slate-400 font-normal">{tab.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── ACTIVE FORM ── */}
          {/* Each form component animates on first view, shows instantly on repeat views */}
          <div className="pb-20">
            {activeFormTab === "8130" && (
              <Form8130
                key={animatedForms.has("8130") ? "8130-static" : "8130-animate"}
                animate={!animatedForms.has("8130")}
              />
            )}
            {activeFormTab === "337" && (
              <Form337Preview
                key={animatedForms.has("337") ? "337-static" : "337-animate"}
                animate={!animatedForms.has("337")}
              />
            )}
            {activeFormTab === "8010" && (
              <Form8010Preview
                key={animatedForms.has("8010") ? "8010-static" : "8010-animate"}
                animate={!animatedForms.has("8010")}
              />
            )}

            {/* Export PDF button (placeholder) */}
            <div className="mt-4 flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 rounded-md text-slate-700 bg-white hover:bg-slate-50 shadow-sm transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export as PDF
              </button>
              <span className="text-xs text-slate-400">Ready for download or email to operator</span>
            </div>

            {/* Evidence source summary below the form */}
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-slate-600">
              <p className="mb-1 text-blue-700 font-semibold text-[11px]">
                How this form was populated
              </p>
              {activeFormTab === "8130" && (
                <p>
                  Part identification from <span className="text-blue-700 font-medium">QR code in video feed</span> ·
                  Inspection findings extracted from <span className="text-blue-700 font-medium">43 sec continuous video</span> with{" "}
                  <span className="text-blue-700 font-medium">voice transcript + 2 measurements</span> ·
                  CMM references from <span className="text-blue-700 font-medium">database lookup</span> ·
                  Test results from <span className="text-blue-700 font-medium">functional test readings</span> ·
                  Certifications from <span className="text-blue-700 font-medium">badge reader</span>
                </p>
              )}
              {activeFormTab === "337" && (
                <p>
                  Aircraft and owner data from <span className="text-blue-700 font-medium">fleet database</span> ·
                  Unit identification from <span className="text-blue-700 font-medium">QR code in video feed</span> ·
                  Work description synthesized from <span className="text-blue-700 font-medium">video analysis + voice transcript + measurements</span> ·
                  Conformity and approval auto-linked from <span className="text-blue-700 font-medium">repair station credentials</span>
                </p>
              )}
              {activeFormTab === "8010" && (
                <p>
                  Defect identification from <span className="text-blue-700 font-medium">video + measurement</span> (Shore 82A) +{" "}
                  <span className="text-blue-700 font-medium">voice transcript</span> (&quot;seal looks degraded&quot;) ·
                  Fleet pattern detected by <span className="text-blue-700 font-medium">AI analysis</span> of 12 fleet units ·
                  Recommendations auto-generated from <span className="text-blue-700 font-medium">CMM data + fleet trends</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }


  // ══════════════════════════════════════════════════════════════════
  // RENDER: HUD SCREEN
  // The main 43-second glasses simulation showing what the mechanic
  // sees: camera feed, voice transcription, findings, measurements,
  // BOM tracking, and document generation — all hands-free.
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-black text-green-400 font-mono relative overflow-hidden select-none">
      {/* Scan line overlay — subtle CRT/HUD effect */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-50"
        style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.05) 2px, rgba(0,255,0,0.05) 4px)",
        }}
      />

      {/* Photo flash effect */}
      {flashActive && (
        <div className="fixed inset-0 bg-white/30 z-40 pointer-events-none transition-opacity" />
      )}

      {/* ── TOP BAR ── */}
      <div className="fixed top-0 left-0 right-0 z-30 bg-black/80 border-b border-green-500/20 px-4 py-2">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400">REC</span>
            </div>
            <span className="text-xs text-green-600">|</span>
            <span className="text-xs text-green-500">AEROTRACK v1.0</span>
          </div>
          <div className={`text-sm font-bold tracking-wide ${severityColor(statusColor)}`}>
            {statusLine}
          </div>
          <div className="flex items-center gap-3 text-xs text-green-600">
            <span>WiFi: Strong</span>
            <span>|</span>
            <span>Batt: 84%</span>
            <span>|</span>
            <span>{new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="pt-12 pb-16 px-4 h-screen flex">
        {/* Left panel: Camera viewport + event feed */}
        <div className="flex-1 flex flex-col gap-3 mr-4">
          {/* Simulated camera viewport */}
          <div className="flex-1 border border-green-500/20 relative bg-black rounded-sm overflow-hidden">
            <img
              src={currentImage}
              alt="Smart glasses camera feed"
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 opacity-80"
            />
            <div className="absolute inset-0 bg-green-900/20 mix-blend-multiply pointer-events-none" />

            {/* Crosshairs */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-32 h-32 border border-green-500/20 relative">
                <div className="absolute top-0 left-1/2 -translate-x-px w-px h-4 bg-green-500/30" />
                <div className="absolute bottom-0 left-1/2 -translate-x-px w-px h-4 bg-green-500/30" />
                <div className="absolute left-0 top-1/2 -translate-y-px w-4 h-px bg-green-500/30" />
                <div className="absolute right-0 top-1/2 -translate-y-px w-4 h-px bg-green-500/30" />
              </div>
            </div>

            {/* Corner brackets */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-green-500/40" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-green-500/40" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-green-500/40" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-green-500/40" />

            {/* Camera label */}
            <div className="absolute top-3 left-10 text-xs text-green-600">
              LIVE FEED — AEROTRACK HUD
            </div>

            {/* Part info overlay */}
            {partInfo && (
              <div className="absolute bottom-4 left-4 right-4 bg-black/70 border border-cyan-500/30 px-3 py-2 text-xs">
                <p className="text-cyan-400 font-bold">{partInfo}</p>
                <p className="text-green-600 mt-1">12 lifecycle events | 8,247 hrs | 3,891 cycles | Status: in-repair</p>
              </div>
            )}
          </div>

          {/* Live transcription area */}
          <div className="border border-green-500/20 bg-black/50 p-3 h-16 flex items-center">
            <div className="flex items-center gap-2 w-full">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              <p className="text-sm text-green-300 truncate">
                {transcript || "Listening for voice input..."}
              </p>
            </div>
          </div>
        </div>

        {/* Right panel: BOM + Findings + Measurements + Documents */}
        <div className="w-80 flex flex-col gap-3">
          {/* BOM — sub-component checklist */}
          <div className="border border-green-500/20 bg-black/50">
            <div className="px-3 py-2 border-b border-green-500/20 flex items-center justify-between">
              <span className="text-xs font-bold text-green-500 tracking-wide">COMPONENT BOM</span>
              <span className="text-xs text-green-700">
                {bom.filter(b => b.inspected).length}/{bom.length} inspected
              </span>
            </div>
            <div className="p-2 space-y-0.5">
              {bom.map((item, i) => (
                <div key={i} className={`flex items-center gap-2 px-2 py-1 text-xs transition-colors duration-500 ${
                  item.inspected ? "border border-green-500/30" : "border border-green-500/10 opacity-50"
                }`}>
                  <span className={`shrink-0 w-4 text-center ${
                    item.inspected ? "text-green-400" : "text-green-800"
                  }`}>
                    {item.inspected ? "✓" : "○"}
                  </span>
                  <span className={`font-mono shrink-0 ${
                    item.inspected ? "text-cyan-400" : "text-green-700"
                  }`}>
                    {item.partNumber}
                  </span>
                  <span className={item.inspected ? "text-green-400" : "text-green-800"}>
                    {item.description}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Findings */}
          <div className="border border-green-500/20 bg-black/50 flex-1 flex flex-col">
            <div className="px-3 py-2 border-b border-green-500/20 flex items-center justify-between">
              <span className="text-xs font-bold text-green-500 tracking-wide">FINDINGS</span>
              <span className="text-xs text-green-700">{findings.length} logged</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {findings.length === 0 ? (
                <p className="text-xs text-green-700 text-center py-4">Awaiting inspection...</p>
              ) : (
                findings.map((f, i) => (
                  <div key={i} className={`border ${severityBorder(f.severity)} px-2 py-1.5 text-xs`}>
                    <span className={severityColor(f.severity)}>{f.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Measurements */}
          <div className="border border-green-500/20 bg-black/50">
            <div className="px-3 py-2 border-b border-green-500/20">
              <span className="text-xs font-bold text-green-500 tracking-wide">MEASUREMENTS</span>
            </div>
            <div className="p-2 space-y-1.5 max-h-40 overflow-y-auto">
              {measurements.length === 0 ? (
                <p className="text-xs text-green-700 text-center py-2">No measurements yet</p>
              ) : (
                measurements.map((m, i) => (
                  <div key={i} className={`border ${severityBorder(m.severity)} px-2 py-1 text-xs`}>
                    <span className={`font-bold ${severityColor(m.severity)}`}>{m.text}</span>
                    <p className="text-green-600 mt-0.5">{m.detail}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Document status */}
          {docStatus && (
            <div className="border border-cyan-500/30 bg-cyan-900/10 px-3 py-2">
              <span className="text-xs font-bold text-cyan-400 tracking-wide">{docStatus}</span>
              {docStatus === "ALL DOCUMENTS READY" && (
                <p className="text-xs text-cyan-600 mt-1">8130-3 | Work Order | Findings | Tests</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── EVENT FEED ── */}
      <div className="fixed bottom-10 left-4 right-[340px] z-20">
        <div ref={feedRef} className="bg-black/70 border border-green-500/15 max-h-28 overflow-y-auto p-2 space-y-0.5">
          {visibleEvents.map((event, i) => (
            <div key={i} className="text-xs flex gap-2">
              <span className={`shrink-0 ${event.type === "action" ? "text-cyan-500" : "text-green-700"}`}>
                {eventIcon(event.type)}
              </span>
              <span className={event.type === "action" ? "text-cyan-400" : event.severity === "amber" ? "text-amber-400" : "text-green-500"}>
                {event.text}
              </span>
              {event.detail && event.type !== "scan" && (
                <span className="text-green-700 truncate">{event.detail}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/80 border-t border-green-500/20 px-4 py-2">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4 text-xs text-green-600">
            <span className="text-green-500 font-bold">VOICE COMMANDS:</span>
            <span className="border border-green-500/30 px-2 py-0.5">&quot;NEXT STEP&quot;</span>
            <span className="border border-green-500/30 px-2 py-0.5">&quot;TAKE PHOTO&quot;</span>
            <span className="border border-green-500/30 px-2 py-0.5">&quot;LOG MEASUREMENT&quot;</span>
            <span className="border border-green-500/30 px-2 py-0.5">&quot;GENERATE DOCS&quot;</span>
          </div>
          <button
            onClick={resetDemo}
            className="text-xs text-green-700 hover:text-green-400 border border-green-500/20 px-3 py-1"
          >
            [ EXIT ]
          </button>
        </div>
      </div>
    </div>
  );
}
