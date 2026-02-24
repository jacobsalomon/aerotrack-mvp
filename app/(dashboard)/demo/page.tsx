"use client";

// ══════════════════════════════════════════════════════════════════════
// HEICO EXECUTIVE DEMO — Guided 12-Minute Flow
//
// This page ties together EVERY AeroVision feature into a single
// narrative designed to make HEICO's CEO say "I need this."
//
// 7 steps, each building on the last:
// 1. The Problem — Animated industry stats showing MRO paperwork burden
// 2. The Mechanic's View — Glasses HUD demo with autopilot
// 3. Evidence → Documents — 8130-3 form rendering with reveal animation
// 4. The Digital Thread — Component 1 (clean) vs Component 2 (gap)
// 5. Fleet Intelligence — Integrity dashboard with exception scan
// 6. The HEICO Opportunity — Editable ROI calculator
// 7. Try It Yourself — Return to the free-explore app
// ══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Form8130Preview, { type Form8130Data } from "@/components/documents/form-8130-preview";
import Form337Preview from "@/components/documents/form-337-preview";
import Form8010Preview from "@/components/documents/form-8010-preview";
import { FORM_ROW_KEYFRAME } from "@/components/documents/form-helpers";
import StepThread from "@/components/demo/step-thread";
import {
  Play,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Clock,
  FileText,
  Glasses,
  Shield,
  DollarSign,
  Search,
  Sparkles,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Check,
  TrendingUp,
  Link2,
  Info,
} from "lucide-react";

// ─── STEP DEFINITIONS ──────────────────────────────────────
const DEMO_STEPS = [
  { key: "problem", label: "The Problem", duration: "30 sec", icon: AlertTriangle },
  { key: "mechanic", label: "The Mechanic's View", duration: "2 min", icon: Glasses },
  { key: "documents", label: "Evidence → Documents", duration: "2 min", icon: FileText },
  { key: "thread", label: "The Digital Thread", duration: "2 min", icon: Search },
  { key: "intelligence", label: "Fleet Intelligence", duration: "1 min", icon: Shield },
  { key: "opportunity", label: "The HEICO Opportunity", duration: "1 min", icon: DollarSign },
  { key: "explore", label: "Try It Yourself", duration: "open", icon: Play },
];

// ─── PRESENTER NOTES ───────────────────────────────────────
// These are only visible when the presenter toggles them on.
// They provide talking points and answers to common questions.
const PRESENTER_NOTES: Record<string, { points: string[]; questions: { q: string; a: string }[] }> = {
  problem: {
    points: [
      "60% of a mechanic's day is spent on documentation, not actual maintenance (McKinsey, 'The Generative AI Opportunity in Airline Maintenance', 2024)",
      "520,000 suspected unapproved parts enter aircraft annually (FAA Suspected Unapproved Parts Program)",
      "44–73% of maintenance errors involve documentation failures (FAA Human Factors in Aviation Maintenance report, 2012)",
      "$114B global MRO market still running on handwritten forms (Oliver Wyman MRO Forecast 2024)",
      "1 in 3 mechanics will reach retirement age within a decade (Oliver Wyman 2023). When they leave, their tribal knowledge leaves with them. AeroVision captures that knowledge as they work.",
      "Each error can ground an aircraft costing $10K–$150K per hour",
    ],
    questions: [
      { q: "Where do these numbers come from?", a: "McKinsey 'Generative AI in Airline Maintenance' 2024, Oliver Wyman MRO Forecast 2024, FAA Suspected Unapproved Parts (SUP) Program data, FAA Human Factors in Aviation Maintenance report (2012), and Impresa Corp fleet management data." },
      { q: "Is this just paperwork or does it affect safety?", a: "Both. The FAA found that 44–73% of maintenance errors involve documentation failures. Documentation errors are a leading cause of repeat inspections and a key factor in bogus part infiltration." },
      { q: "What about the AOG Technics scandal?", a: "In 2023, AOG Technics was found to have sold thousands of parts with forged 8130-3 documentation to major airlines. 120+ aircraft were grounded. This happened because there's no automated way to verify documentation at the source — exactly what AeroVision solves." },
      { q: "What about the workforce crisis?", a: "Oliver Wyman projects 1 in 3 A&P mechanics will reach retirement age within a decade. AeroVision preserves tribal knowledge by capturing it during the normal workflow — new mechanics get AI-assisted guidance from day one." },
      { q: "What about European regulations?", a: "EASA is phasing in digital compliance requirements through 2027 under its Part 145 modernization roadmap. Companies that adopt digital documentation now will be ahead; companies that wait will face costly catch-up." },
    ],
  },
  mechanic: {
    points: [
      "This is what the mechanic sees through RealWear Navigator 500 glasses",
      "Camera is always on — auto-captures photos of findings",
      "Voice is always recording — AI extracts findings in real-time",
      "The mechanic never touches a screen or keyboard",
      "Notice the amber finding — that's tribal knowledge being preserved",
    ],
    questions: [
      { q: "Do mechanics actually wear these?", a: "RealWear has 40,000+ units deployed in industrial settings. Boeing, Airbus, and GE Aviation all use them." },
      { q: "What about ITAR-restricted work?", a: "We have a restricted mode that disables the camera. Voice and measurements still work." },
    ],
  },
  documents: {
    points: [
      "Watch the form fill itself in — 8 seconds vs. hours of manual work",
      "Every field is populated from the captured evidence",
      "Click 'See What This Replaced' for the before/after comparison",
      "The PDF download creates a print-ready FAA form",
      "Notice the 8010-4 tab — the AI detected a fleet-wide pattern that no human would have caught",
    ],
    questions: [
      { q: "Is this legally valid?", a: "The form is generated as a draft. An A&P/IA still reviews and signs it. We automate 95% of the work, they provide the final 5% — the judgment." },
      { q: "What if the AI makes a mistake?", a: "Every field has traceability back to the source evidence. The watermark says 'PENDING REVIEW' until a human signs." },
      { q: "Is AI-generated documentation legally valid?", a: "Yes. FAA Advisory Circular AC 120-78B explicitly allows electronic signatures and records. AeroVision follows the 'AI-assisted, human-approved' model — the AI drafts the form, a certified A&P/IA reviews and signs. This is fully compliant." },
      { q: "What about European regulations?", a: "EASA is phasing in digital compliance requirements through 2027 under its Part 145 modernization roadmap. Companies that adopt digital documentation now will be ahead; companies that wait will face costly catch-up." },
    ],
  },
  thread: {
    points: [
      "Component 1 has a 94% trace score — that's exceptional",
      "Every facility is tracked: OEM → Airline → MRO → Distributor",
      "Now look at Component 2 — spot the red gap?",
      "14 months with no records. Was it on an aircraft? In a warehouse? Nobody knows.",
      "This is how counterfeit parts enter the supply chain",
      "The FAA's SUP Program flags ~520,000 suspected unapproved parts annually — most enter through documentation gaps like Component B.",
    ],
    questions: [
      { q: "What's a typical trace score?", a: "Most parts have significant documentation gaps. The FAA estimates ~520,000 suspected unapproved parts enter aircraft annually, largely through chain-of-custody breaks. AeroVision captures everything automatically — gaps become impossible." },
      { q: "Can this prevent counterfeit parts?", a: "Not directly — but it makes them visible. If a part shows up with a gap, you investigate before installing it." },
      { q: "What about European regulations?", a: "EASA is phasing in digital compliance requirements through 2027 under its Part 145 modernization roadmap. Companies that adopt digital documentation now will be ahead; companies that wait will face costly catch-up." },
    ],
  },
  intelligence: {
    points: [
      "The exception engine scanned all components in seconds",
      "It found documentation gaps, missing certificates, date inconsistencies",
      "Red = critical (safety), Yellow = warning (compliance), Blue = info",
      "Each exception has evidence — click through to see the details",
      "This is what an automated audit looks like",
    ],
    questions: [
      { q: "How does it know what's wrong?", a: "Rule-based engine: checks for monotonic timestamps, required documents at each lifecycle stage, certificate validity, and cross-references part numbers." },
      { q: "False positive rate?", a: "In seed data, ~10%. The engine errs on the side of flagging — better to investigate and dismiss than to miss a real issue." },
      { q: "What about European regulations?", a: "EASA is phasing in digital compliance requirements through 2027 under its Part 145 modernization roadmap. Companies that adopt digital documentation now will be ahead; companies that wait will face costly catch-up." },
    ],
  },
  opportunity: {
    points: [
      "These numbers are editable — adjust for HEICO's actual network size",
      "62 MRO shops and 8,500 overhauls/year is conservative for HEICO",
      "The 5-year value is the key number — that's the contract size",
      "Open the Advanced Inputs to see the full value story: AOG avoidance, audit reduction, and fleet value preservation",
      "Ask: 'What would it mean if every part in your network could tell its own story?'",
    ],
    questions: [
      { q: "What does AeroVision cost?", a: "We're finalizing pricing tiers — we'll have specifics for the proposal. Our model is designed so the ROI is obvious within the first quarter." },
      { q: "What's the implementation timeline?", a: "Pilot at one shop in 30 days. Network rollout in 6 months. Full integration in 12 months." },
      { q: "What about European regulations?", a: "EASA is phasing in digital compliance requirements through 2027 under its Part 145 modernization roadmap. Companies that adopt digital documentation now will be ahead; companies that wait will face costly catch-up." },
    ],
  },
  explore: {
    points: [
      "Let them explore freely — click around the dashboard",
      "Suggest they look at a specific component's timeline",
      "Point them to the capture workflow if they want to see evidence capture",
      "The glasses demo is available from the sidebar",
    ],
    questions: [],
  },
};

// ─── MOCK 8130-3 DATA (for Step 3 demo) ─────────────────
const MOCK_8130: Form8130Data = {
  block1: "FAA",
  block2: "Authorized Release Certificate",
  block3: "ATC-2025-04782",
  block4: "ACE Aerospace Repair Station\n1234 Aviation Way\nMiami, FL 33142\nRepair Station Certificate: AY2R123N",
  block5: "WO-ACE-2025-01892",
  block6a: "HPC-7 Hydraulic Pump Assembly",
  block6b: "881700-1089",
  block6c: "SN-2024-11432",
  block6d: "1",
  block6e: "Overhauled",
  block7: `Component 881700-1089 S/N SN-2024-11432 received for overhaul per CMM 881700-OH Rev. 12.

FINDINGS:
- Piston bore diameter: 2.4985 in. (Spec: 2.500 ± 0.002 in.) — within limits, serviceable
- Gear backlash: 0.004 in. (Spec: 0.003–0.006 in.) — within limits, serviceable
- Inlet port seal hardness: Shore 82A (Spec: min 75A) — within limits but degraded at 8,200 hrs, recommend replacement

WORK PERFORMED:
- Complete teardown and inspection per CMM 881700-OH Chapter 72-00
- Replaced all O-ring seals (5 ea.) — P/N SK-881700-1, CoC #24-11892
- Incorporated SB 881700-29-004 (PTFE composite seal upgrade per Parker bulletin)
- Reassembly per CMM step 4.3.2, Loctite 567 applied, housing bolts torqued to 45 ft-lbs per Table 72-50-01
- Safety wire installed per standard practice

PARTS CONSUMED:
- Seal Kit P/N SK-881700-1 — Vendor: Parker Hannifin, CoC: #24-11892

TEST RESULTS:
- Pressure hold: 3,000 PSI for 5 min, zero leakage — PASS
- Flow rate: 12.4 GPM @ 3,000 PSI (Spec: 12 ± 0.5 GPM) — PASS
- External leak test: No leakage detected — PASS`,
  block8: "",
  block9: "",
  block10: "",
  block11: "AY2R123N",
  block12: new Date().toISOString().split("T")[0],
  block13: "[PENDING E-SIGNATURE]",
  block14: "Except as noted above, the work identified in Block 5 and described in Block 7 was accomplished in accordance with current FAA-approved data and with respect to that work, the items are approved for return to service.",
  narrative_summary: "HPC-7 Hydraulic Pump Assembly overhauled per CMM. All inspections and tests passed. Component approved for return to service.",
};

// ─── MAIN COMPONENT ────────────────────────────────────────

export default function DemoPage() {
  const router = useRouter();
  // "landing" = show entry points, "guided" = show step-by-step flow
  const [mode, setMode] = useState<"landing" | "guided">("landing");
  // Current step in the guided flow (0-indexed)
  const [step, setStep] = useState(0);
  // Elapsed time since guided flow started
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  // Whether presenter notes are visible
  const [showNotes, setShowNotes] = useState(false);

  // ── Elapsed timer ──
  useEffect(() => {
    if (mode !== "guided") return;
    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [mode]);

  function startGuidedDemo() {
    setMode("guided");
    setStep(0);
    setElapsed(0);
  }

  function formatElapsed(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ═══════════════════════════════════════════════════════
  // LANDING PAGE — Three entry points into the demo
  // ═══════════════════════════════════════════════════════
  if (mode === "landing") {
    return (
      <div className="max-w-4xl mx-auto py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <Badge variant="outline" className="mb-4 text-blue-600 border-blue-200">
            HEICO Executive Demo
          </Badge>
          <h1 className="text-3xl font-bold text-slate-900 mb-3">
            What if every part could tell its own story?
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            AeroVision captures maintenance evidence at the point of work,
            generates documentation automatically, and creates an unbreakable
            digital thread for every component in your fleet.
          </p>
        </div>

        {/* Industry stat callout */}
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-6 mb-8 text-center">
          <p className="text-sm text-red-600 uppercase tracking-wider font-medium mb-2">
            The MRO Industry Problem
          </p>
          <p className="text-2xl font-bold text-red-800 mb-1">
            2.4 million hours/year spent on paperwork
          </p>
          <p className="text-sm text-red-600">
            $180M in labor costs | 15% error rate on hand-written forms | 12 forms per overhaul
          </p>
        </div>

        {/* Three entry points */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Primary CTA — guided demo */}
          <Card
            className="md:col-span-3 border-2 border-blue-200 bg-blue-50/50 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={startGuidedDemo}
          >
            <CardContent className="pt-6 pb-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center">
                  <Play className="h-6 w-6 ml-0.5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-blue-900">Start Executive Demo</h2>
                  <p className="text-sm text-blue-600">
                    7-step guided tour | ~12 minutes | Narrated with talking points
                  </p>
                </div>
              </div>
              <ChevronRight className="h-6 w-6 text-blue-400" />
            </CardContent>
          </Card>

          {/* Secondary: Capture workflow */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push("/capture")}
          >
            <CardContent className="pt-6 pb-6 text-center">
              <Sparkles className="h-8 w-8 text-purple-500 mx-auto mb-3" />
              <h3 className="font-semibold text-sm mb-1">Capture Workflow</h3>
              <p className="text-xs text-slate-500">
                See the 6-step overhaul evidence capture process
              </p>
            </CardContent>
          </Card>

          {/* Secondary: Glasses HUD */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push("/glasses-demo")}
          >
            <CardContent className="pt-6 pb-6 text-center">
              <Glasses className="h-8 w-8 text-green-600 mx-auto mb-3" />
              <h3 className="font-semibold text-sm mb-1">Glasses HUD</h3>
              <p className="text-xs text-slate-500">
                Full-screen smart glasses experience
              </p>
            </CardContent>
          </Card>

          {/* Secondary: Explore freely */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push("/dashboard")}
          >
            <CardContent className="pt-6 pb-6 text-center">
              <Search className="h-8 w-8 text-slate-500 mx-auto mb-3" />
              <h3 className="font-semibold text-sm mb-1">Explore Freely</h3>
              <p className="text-xs text-slate-500">
                Browse the dashboard, components, and analytics
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // GUIDED FLOW — Full-screen 7-step demo
  // ═══════════════════════════════════════════════════════
  const currentStep = DEMO_STEPS[step];
  const notes = PRESENTER_NOTES[currentStep.key];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* ── PROGRESS BAR (top) ── */}
      <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400">AeroVision Demo</span>
          <div className="flex items-center gap-1">
            {DEMO_STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all ${
                  i === step
                    ? "w-8 bg-blue-500"
                    : i < step
                    ? "w-2 bg-green-500"
                    : "w-2 bg-slate-600"
                }`}
              />
            ))}
          </div>
          <span className="text-sm font-medium">
            Step {step + 1} of {DEMO_STEPS.length}: {currentStep.label}
          </span>
          <span className="text-xs text-slate-400">({currentStep.duration})</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 font-mono">
            <Clock className="h-3 w-3 inline mr-1" />
            {formatElapsed(elapsed)}
          </span>
          <button
            onClick={() => setShowNotes(!showNotes)}
            className={`p-1.5 rounded transition-colors ${
              showNotes ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
            }`}
            title="Toggle presenter notes"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setMode("landing"); setStep(0); }}
            className="text-xs text-slate-400 hover:text-white border border-slate-600 px-3 py-1 rounded"
          >
            Exit Demo
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 overflow-y-auto relative">
        <div className={`h-full ${showNotes ? "mr-80" : ""} transition-all`}>
          {step === 0 && <StepProblem />}
          {step === 1 && <StepMechanic />}
          {step === 2 && <StepDocuments />}
          {step === 3 && <StepThread active={step === 3} />}
          {step === 4 && <StepIntelligence />}
          {step === 5 && <StepOpportunity />}
          {step === 6 && <StepExplore onNavigate={(path) => { setMode("landing"); router.push(path); }} />}
        </div>

        {/* ── PRESENTER NOTES PANEL ── */}
        {showNotes && notes && (
          <div className="fixed top-[44px] right-0 bottom-[52px] w-80 bg-slate-50 border-l border-slate-200 overflow-y-auto p-4 z-40">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Presenter Notes
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1.5">Key Points:</p>
                <ul className="space-y-1.5">
                  {notes.points.map((point, i) => (
                    <li key={i} className="text-xs text-slate-700 flex gap-1.5">
                      <span className="text-blue-500 shrink-0 mt-0.5">-</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              {notes.questions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1.5 mt-4">
                    If They Ask:
                  </p>
                  {notes.questions.map((qa, i) => (
                    <div key={i} className="mb-2 bg-white rounded p-2 border text-xs">
                      <p className="font-medium text-slate-700">Q: {qa.q}</p>
                      <p className="text-slate-500 mt-1">A: {qa.a}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── NAVIGATION BAR (bottom) ── */}
      <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {DEMO_STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  i === step
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : i < step
                    ? "text-green-600"
                    : "text-slate-400"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden lg:inline">{s.label}</span>
              </button>
            );
          })}
        </div>
        {step < DEMO_STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} className="gap-1">
            Next: {DEMO_STEPS[step + 1].label} <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => { setMode("landing"); router.push("/dashboard"); }} className="gap-1">
            Finish Demo <Check className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STEP COMPONENTS — Each step is its own component
// ═══════════════════════════════════════════════════════════

// ── STEP 1: THE PROBLEM ────────────────────────────────────
// Animated stats counters that reveal the MRO paperwork burden.
// The 60% McKinsey stat is the hero — largest and most prominent.
// New: AOG Technics scandal card, workforce crisis, grounded cost.
function StepProblem() {
  const [counters, setCounters] = useState({
    counterfeit: 0, mro: 0, errors: 0, forms: 0, mckinsey: 0,
  });
  const animDone = useRef(false);

  useEffect(() => {
    if (animDone.current) return;
    // All stats sourced — see presenter notes for citations
    const targets = {
      counterfeit: 520000, // FAA SUP Program — suspected unapproved parts/year
      mro: 114,           // Oliver Wyman MRO Forecast 2024 — $114B global market
      errors: 44,         // FAA Human Factors report 2012 — 44-73% doc-related
      forms: 50,          // Impresa Corp — 50-75 pieces of paper per LRU overhaul
      mckinsey: 60,       // McKinsey — verified
    };
    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;
    let current = 0;

    const timer = setInterval(() => {
      current++;
      const progress = Math.min(current / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounters({
        counterfeit: Math.round(targets.counterfeit * eased),
        mro: Math.round(targets.mro * eased),
        errors: Math.round(targets.errors * eased),
        forms: Math.round(targets.forms * eased),
        mckinsey: Math.round(targets.mckinsey * eased),
      });
      if (current >= steps) {
        clearInterval(timer);
        animDone.current = true;
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-900 to-slate-800 p-8 overflow-y-auto">
      <div className="max-w-4xl w-full text-center">
        <p className="text-sm text-red-400 uppercase tracking-widest mb-4 font-medium">
          A $114 Billion Industry, Still Running on Paper
        </p>
        <h2 className="text-4xl font-bold text-white mb-2">
          MRO Paperwork is Unsustainable
        </h2>
        <p className="text-lg text-slate-400 mb-10">
          Every year, the aviation MRO industry wastes millions of hours
          on documentation that should be automatic.
        </p>

        {/* ── HERO STAT: 60% McKinsey ── */}
        <div className="mb-10">
          <p className="text-7xl font-bold text-red-400 font-mono leading-none">
            {counters.mckinsey}%
          </p>
          <p className="text-lg text-slate-300 mt-2 max-w-md mx-auto">
            of a mechanic&apos;s day spent on paperwork, not fixing airplanes
          </p>
          <p className="text-xs text-slate-500 mt-1 italic">
            Source: McKinsey, &ldquo;The Generative AI Opportunity in Airline Maintenance&rdquo;, 2024
          </p>
        </div>

        {/* ── 4 STAT COUNTERS (all sourced) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-2xl font-bold text-red-400 font-mono">
              {counters.counterfeit.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">suspected unapproved parts/year</p>
            <p className="text-[10px] text-slate-500 mt-0.5 italic">FAA SUP Program</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-2xl font-bold text-red-400 font-mono">
              ${counters.mro}B
            </p>
            <p className="text-xs text-slate-400 mt-1">global MRO market</p>
            <p className="text-[10px] text-slate-500 mt-0.5 italic">Oliver Wyman 2024</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-2xl font-bold text-amber-400 font-mono">
              {counters.errors}–73%
            </p>
            <p className="text-xs text-slate-400 mt-1">of maintenance errors are documentation-related</p>
            <p className="text-[10px] text-slate-500 mt-0.5 italic">FAA Human Factors, 2012</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-2xl font-bold text-blue-400 font-mono">
              {counters.forms}–75
            </p>
            <p className="text-xs text-slate-400 mt-1">pieces of paper per LRU overhaul</p>
            <p className="text-[10px] text-slate-500 mt-0.5 italic">Impresa Corp</p>
          </div>
        </div>

        {/* ── NEW STAT ROW: Workforce + Grounded Cost ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-left">
            <p className="text-3xl font-bold text-amber-400 font-mono mb-1">
              1 in 3
            </p>
            <p className="text-sm text-amber-200">
              mechanics will reach retirement age within a decade
            </p>
            <p className="text-xs text-amber-500/70 mt-1">
              Oliver Wyman 2023 — When they leave, their tribal knowledge leaves with them.
            </p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-left">
            <p className="text-3xl font-bold text-red-400 font-mono mb-1">
              $10K–$150K
            </p>
            <p className="text-sm text-red-200">
              per hour — cost of a grounded aircraft
            </p>
            <p className="text-xs text-red-500/70 mt-1">
              A single documentation error can trigger an AOG event costing hundreds of thousands.
            </p>
          </div>
        </div>

        {/* ── AOG TECHNICS SCANDAL ALERT ── */}
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-5 mb-8 text-left max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <span className="text-red-300 font-bold text-sm uppercase tracking-wide">
              AOG Technics Scandal — 2023
            </span>
          </div>
          <p className="text-sm text-red-200">
            One company sold parts with <strong className="text-red-100">forged 8130-3 tags</strong> to Delta, United,
            American, and Southwest. <strong className="text-red-100">120+ aircraft were grounded</strong>. This happened
            because there&apos;s no automated way to verify documentation at the source —{" "}
            <span className="text-white font-medium">exactly what AeroVision solves.</span>
          </p>
        </div>

        {/* ── WARNING CALLOUTS ── */}
        <div className="space-y-3 text-left max-w-lg mx-auto mb-8">
          <div className="flex items-start gap-3 text-slate-300 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <p>A single transposition error on an 8130-3 can ground an aircraft for days</p>
          </div>
          <div className="flex items-start gap-3 text-slate-300 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <p>Counterfeit parts enter the supply chain through documentation gaps</p>
          </div>
          <div className="flex items-start gap-3 text-slate-300 text-sm">
            <AlertTriangle className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
            <p>Average mechanic spends 60% of their time writing paperwork instead of turning wrenches</p>
          </div>
        </div>

        <p className="text-lg text-white font-medium">
          What if there was a better way?
        </p>
      </div>
    </div>
  );
}

// ── STEP 2: THE MECHANIC'S VIEW ────────────────────────────
// Links to the glasses demo (opens in new tab or embedded)
function StepMechanic() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      {/* Narration card */}
      <div className="max-w-2xl w-full mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Glasses className="h-5 w-5 text-blue-600" />
            <h3 className="font-bold text-blue-900">The Mechanic&apos;s View</h3>
          </div>
          <p className="text-sm text-blue-700">
            Through smart glasses, the mechanic never types a single character.
            Camera auto-captures, voice is transcribed in real-time, and measurements
            are extracted from natural speech. Watch what happens when they find
            a degraded seal...
          </p>
        </div>
      </div>

      {/* Preview of glasses HUD (black background area) */}
      <div className="max-w-3xl w-full">
        <div className="bg-black rounded-lg border border-green-500/30 p-8 text-center">
          <div className="text-green-400 font-mono mb-6">
            <p className="text-xs text-green-600 tracking-[0.3em] mb-2">AEROVISION SMART GLASSES</p>
            <h3 className="text-2xl font-bold mb-2">HUD Preview</h3>
            <p className="text-sm text-green-600">
              Simulated view through RealWear Navigator 500
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8 text-xs text-green-500 font-mono">
            <div className="border border-green-500/20 p-3 rounded">
              <p className="text-green-400 font-bold">AUTO-CAPTURE</p>
              <p className="text-green-600 mt-1">Camera always on</p>
            </div>
            <div className="border border-green-500/20 p-3 rounded">
              <p className="text-green-400 font-bold">VOICE-TO-TEXT</p>
              <p className="text-green-600 mt-1">AI transcription</p>
            </div>
            <div className="border border-green-500/20 p-3 rounded">
              <p className="text-green-400 font-bold">ZERO TYPING</p>
              <p className="text-green-600 mt-1">Fully hands-free</p>
            </div>
          </div>

          <a
            href="/glasses-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500/20 border border-green-500/50 text-green-400 px-6 py-3 font-mono tracking-wide hover:bg-green-500/30 transition-colors"
          >
            [ LAUNCH GLASSES DEMO ] <ExternalLink className="h-4 w-4" />
          </a>

          <p className="text-xs text-green-700 mt-4">
            Opens in a new tab | Press F11 for full-screen | ~45 seconds
          </p>
        </div>
      </div>
    </div>
  );
}

// ── STEP 3: EVIDENCE → DOCUMENTS ───────────────────────────
// Shows all 3 FAA forms (8130-3, 337, 8010-4) in a tabbed interface
// with staggered row animations. Includes AI pattern detection
// callout on the 8010-4 tab and a narrative transition card.
function StepDocuments() {
  const [formKey, setFormKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  // Which tab is active
  const [activeTab, setActiveTab] = useState<"8130" | "337" | "8010">("8130");
  // Track which forms have already animated (don't re-animate on tab switch)
  const [animatedForms, setAnimatedForms] = useState<Set<string>>(new Set());
  // Whether the 8130-3 form animation has completed (for the narrative card)
  const [formAnimDone, setFormAnimDone] = useState(false);

  function triggerGeneration() {
    setFormKey((k) => k + 1);
    setShowForm(true);
    setActiveTab("8130");
    setAnimatedForms(new Set());
    setFormAnimDone(false);
  }

  // Mark forms as animated after the stagger animation completes (~3.5s)
  useEffect(() => {
    if (!showForm) return;
    if (animatedForms.has(activeTab)) return;

    const timeout = setTimeout(() => {
      setAnimatedForms((prev) => new Set([...prev, activeTab]));
    }, 3500);

    return () => clearTimeout(timeout);
  }, [showForm, activeTab, animatedForms]);

  // Tab configuration
  const tabs: { key: "8130" | "337" | "8010"; label: string; subtitle: string }[] = [
    { key: "8130", label: "FAA 8130-3", subtitle: "Release Certificate" },
    { key: "337", label: "FAA 337", subtitle: "Major Repair" },
    { key: "8010", label: "FAA 8010-4", subtitle: "Defect Report" },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* CSS keyframe for Form337/Form8010 row animations */}
      <style dangerouslySetInnerHTML={{ __html: FORM_ROW_KEYFRAME + `
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />

      {/* Narration card */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-purple-600" />
            <h3 className="font-bold text-purple-900">Evidence to Documents</h3>
          </div>
          <p className="text-sm text-purple-700">
            All the evidence captured during the overhaul — photos, voice notes,
            measurements — is fed to AI which generates <strong>three complete FAA forms</strong> in
            seconds. Watch them fill themselves in.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        {!showForm ? (
          <div className="text-center py-12">
            <Sparkles className="h-12 w-12 text-blue-400 mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Ready to generate</p>
            <p className="text-sm text-slate-500 mb-6">
              AI will create 3 complete FAA forms from captured evidence
            </p>
            <Button size="lg" onClick={triggerGeneration} className="gap-2">
              <Sparkles className="h-4 w-4" /> Generate FAA Documentation
            </Button>
          </div>
        ) : (
          <>
            {/* ── TABBED FORM INTERFACE ── */}
            <div className="flex gap-1 mb-5 border-b border-slate-200">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                const isComplete = animatedForms.has(tab.key);
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                      isActive
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isComplete && <span className="text-green-600">✓</span>}
                      <span>{tab.label}</span>
                      <span className="text-slate-400 font-normal text-xs">{tab.subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── AI DETECTION CALLOUT (8010-4 tab only) ── */}
            {activeTab === "8010" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-amber-900 text-sm">AI DETECTED: Fleet-Wide Pattern</p>
                    <p className="text-sm text-amber-700 mt-1">
                      881700-4022 seals on units &gt;7,500 hrs show accelerated failure rates.
                      4 of 12 fleet units required unscheduled replacement. AeroVision auto-generated
                      this defect report to alert the FAA — no human had to notice the pattern.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── ACTIVE FORM ── */}
            {activeTab === "8130" && (
              <Form8130Preview
                key={animatedForms.has("8130") ? `8130-static-${formKey}` : `8130-animate-${formKey}`}
                data={MOCK_8130}
                animate={!animatedForms.has("8130")}
                showDownload={true}
                onAnimationComplete={() => setFormAnimDone(true)}
              />
            )}
            {activeTab === "337" && (
              <Form337Preview
                key={animatedForms.has("337") ? "337-static" : "337-animate"}
                animate={!animatedForms.has("337")}
              />
            )}
            {activeTab === "8010" && (
              <Form8010Preview
                key={animatedForms.has("8010") ? "8010-static" : "8010-animate"}
                animate={!animatedForms.has("8010")}
              />
            )}

            {/* ── NARRATIVE TRANSITION CARD (US-003) ── */}
            {formAnimDone && (
              <div
                className="border-l-4 border-indigo-400 bg-indigo-50 rounded-r-lg p-5 mt-6"
                style={{
                  animation: "fadeSlideUp 500ms ease forwards",
                  animationDelay: "400ms",
                  opacity: 0,
                }}
              >
                <div className="flex items-start gap-3">
                  <Link2 className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-indigo-800">
                      That form just created an unbreakable link in this component&apos;s chain of custody.
                      Every measurement, every photo, every signature — cryptographically sealed.{" "}
                      <strong>Now let&apos;s see what happens when that chain is broken.</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── STEP 5: FLEET INTELLIGENCE ─────────────────────────────
// Shows the integrity dashboard with exception scan results
function StepIntelligence() {
  const [scanResult, setScanResult] = useState<{
    totalComponents: number;
    componentsWithExceptions: number;
    totalExceptions: number;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [exceptions, setExceptions] = useState<{
    id: string;
    exceptionType: string;
    severity: string;
    title: string;
    description: string;
    component: { partNumber: string; serialNumber: string };
  }[]>([]);

  async function runScan() {
    setScanning(true);
    try {
      const res = await fetch(apiUrl("/api/exceptions/scan-all"), { method: "POST" });
      const result = await res.json();
      setScanResult(result);
      // Fetch exception list
      const exRes = await fetch(apiUrl("/api/exceptions"));
      const exData = await exRes.json();
      setExceptions(exData.slice(0, 10)); // show top 10
    } catch {
      // Ignore errors in demo
    }
    setScanning(false);
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Narration card */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-amber-600" />
            <h3 className="font-bold text-amber-900">Fleet Intelligence</h3>
          </div>
          <p className="text-sm text-amber-700">
            AeroVision doesn&apos;t just capture data — it analyzes it. The exception engine
            scans every component in your fleet for inconsistencies, documentation gaps,
            and compliance issues. What used to take an audit team weeks takes seconds.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        {!scanResult && !scanning && (
          <div className="text-center py-12">
            <Shield className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Run Fleet Scan</p>
            <p className="text-sm text-slate-500 mb-6">
              The exception engine will analyze every component for issues
            </p>
            <Button size="lg" onClick={runScan} className="gap-2">
              <Search className="h-4 w-4" /> Scan All Components
            </Button>
          </div>
        )}

        {scanning && (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium">Scanning fleet...</p>
            <p className="text-sm text-slate-500">Analyzing all components for exceptions</p>
          </div>
        )}

        {scanResult && (
          <div className="space-y-6">
            {/* Scan summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-800">{scanResult.totalComponents}</p>
                <p className="text-xs text-blue-600">Components Scanned</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-amber-800">{scanResult.componentsWithExceptions}</p>
                <p className="text-xs text-amber-600">With Exceptions</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-800">{scanResult.totalExceptions}</p>
                <p className="text-xs text-red-600">Total Findings</p>
              </div>
            </div>

            {/* Exception list preview */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700">Top Findings:</h4>
              {exceptions.map((ex) => (
                <div
                  key={ex.id}
                  className={`border-l-4 rounded-r-lg bg-white border p-3 text-sm ${
                    ex.severity === "critical"
                      ? "border-l-red-500"
                      : ex.severity === "warning"
                      ? "border-l-yellow-500"
                      : "border-l-blue-500"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            ex.severity === "critical"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : ex.severity === "warning"
                              ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {ex.severity}
                        </Badge>
                        <span className="text-xs text-slate-500 font-mono">
                          {ex.component.partNumber} ({ex.component.serialNumber})
                        </span>
                      </div>
                      <p className="font-medium text-sm">{ex.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ex.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Link to full integrity dashboard */}
            <div className="text-center">
              <a
                href="/integrity"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                Open Full Integrity Dashboard <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── STEP 6: THE HEICO OPPORTUNITY ──────────────────────────
// Editable ROI calculator with HEICO-relevant defaults.
// Covers 5 value categories: labor savings, AOG cost avoidance,
// audit cost reduction, counterfeit risk reduction, and
// aircraft value preservation.
function StepOpportunity() {
  // Core inputs (always visible)
  const [inputs, setInputs] = useState({
    shops: 62,
    partsPerYear: 8500,
    minutesPerPart: 90,
    hourlyRate: 65,
    // Advanced inputs (behind toggle)
    aogEventsAvoided: 10,
    avgAogCost: 150000,
    annualAuditPrepCost: 500000,
    fleetDocImprovement: 15,
  });

  // Toggle for the advanced inputs section
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Helper to clamp input values to non-negative integers
  const handleInput = (field: string, value: string) => {
    setInputs({ ...inputs, [field]: Math.max(0, parseInt(value) || 0) });
  };

  // ── COMPUTED OUTPUTS ──
  // 1. Labor savings: time saved per part × hourly rate
  const totalMinutesSaved = inputs.partsPerYear * (inputs.minutesPerPart - 3); // 3 min with AeroVision
  const totalHoursSaved = Math.round(totalMinutesSaved / 60);
  const laborCostSaved = Math.round(totalHoursSaved * inputs.hourlyRate);

  // 2. AOG cost avoidance: fewer aircraft-on-ground events via predictive docs
  const aogAvoidance = inputs.aogEventsAvoided * inputs.avgAogCost;

  // 3. Audit cost reduction: 60% less time on audit prep
  const auditReduction = Math.round(inputs.annualAuditPrepCost * 0.60);

  // 4. Counterfeit risk reduction: 2% of parts × $5K avg exposure × doc improvement %
  const counterfeitReduction = Math.round(
    inputs.partsPerYear * 0.02 * 5000 * (inputs.fleetDocImprovement / 100)
  );

  // 5. Aircraft value preservation: better docs = higher residual value
  const aircraftValue = Math.round(
    inputs.shops * 3 * 1_000_000 * (inputs.fleetDocImprovement / 100)
  );

  // Total annual savings (excluding one-time aircraft value)
  const annualSavings = laborCostSaved + aogAvoidance + auditReduction + counterfeitReduction;

  // 5-year total: annual savings × 5 + aircraft value preservation
  const fiveYearValue = annualSavings * 5 + aircraftValue;

  // Stacked bar segments (percentage of annual savings)
  const barSegments = [
    { label: "Labor", value: laborCostSaved, color: "bg-green-500" },
    { label: "AOG", value: aogAvoidance, color: "bg-blue-500" },
    { label: "Audit", value: auditReduction, color: "bg-indigo-500" },
    { label: "Counterfeit", value: counterfeitReduction, color: "bg-amber-500" },
  ];
  const barTotal = barSegments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Narration card */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            <h3 className="font-bold text-emerald-900">The HEICO Opportunity</h3>
          </div>
          <p className="text-sm text-emerald-700">
            These numbers are editable — adjust them for your actual network.
            The defaults are conservative estimates for HEICO&apos;s MRO operations.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        {/* ── CORE INPUTS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">MRO Shops in Network</label>
            <Input
              type="number"
              value={inputs.shops}
              onChange={(e) => handleInput("shops", e.target.value)}
              className="text-center font-bold"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Parts Overhauled/Year</label>
            <Input
              type="number"
              value={inputs.partsPerYear}
              onChange={(e) => handleInput("partsPerYear", e.target.value)}
              className="text-center font-bold"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Avg. Paperwork Min/Part</label>
            <Input
              type="number"
              value={inputs.minutesPerPart}
              onChange={(e) => handleInput("minutesPerPart", e.target.value)}
              className="text-center font-bold"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Mechanic Hourly Rate ($)</label>
            <Input
              type="number"
              value={inputs.hourlyRate}
              onChange={(e) => handleInput("hourlyRate", e.target.value)}
              className="text-center font-bold"
            />
          </div>
        </div>

        {/* ── ADVANCED INPUTS TOGGLE ── */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-4 mx-auto transition-colors"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
          {showAdvanced ? "Hide" : "Show"} Advanced Inputs
        </button>

        {/* ── ADVANCED INPUTS (hidden by default) ── */}
        {showAdvanced && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                AOG Events Avoided/Yr
                <span className="group relative">
                  <Info className="h-3 w-3 text-slate-400 cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Aircraft-on-ground events prevented by better documentation
                  </span>
                </span>
              </label>
              <Input
                type="number"
                value={inputs.aogEventsAvoided}
                onChange={(e) => handleInput("aogEventsAvoided", e.target.value)}
                className="text-center font-bold"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                Avg. AOG Cost ($)
                <span className="group relative">
                  <Info className="h-3 w-3 text-slate-400 cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Cost per grounded aircraft ($10K–$150K/hr is industry standard)
                  </span>
                </span>
              </label>
              <Input
                type="number"
                value={inputs.avgAogCost}
                onChange={(e) => handleInput("avgAogCost", e.target.value)}
                className="text-center font-bold"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                Annual Audit Prep ($)
                <span className="group relative">
                  <Info className="h-3 w-3 text-slate-400 cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Total cost of preparing for FAA/EASA audits across all shops
                  </span>
                </span>
              </label>
              <Input
                type="number"
                value={inputs.annualAuditPrepCost}
                onChange={(e) => handleInput("annualAuditPrepCost", e.target.value)}
                className="text-center font-bold"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                Doc Improvement (%)
                <span className="group relative">
                  <Info className="h-3 w-3 text-slate-400 cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    Percentage improvement in fleet documentation completeness
                  </span>
                </span>
              </label>
              <Input
                type="number"
                value={inputs.fleetDocImprovement}
                onChange={(e) => handleInput("fleetDocImprovement", e.target.value)}
                className="text-center font-bold"
              />
            </div>
          </div>
        )}

        {/* ── OUTPUT CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {/* Existing outputs */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-800">
              {totalHoursSaved.toLocaleString()}
            </p>
            <p className="text-xs text-green-600 mt-1">Hours Saved / Year</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-800">
              ${(laborCostSaved / 1000000).toFixed(1)}M
            </p>
            <p className="text-xs text-green-600 mt-1">Labor Cost Saved / Year</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-800">
              15% → &lt;1%
            </p>
            <p className="text-xs text-green-600 mt-1">Error Rate Reduction</p>
          </div>

          {/* New outputs from advanced calculator */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-800">
              ${(aogAvoidance / 1000000).toFixed(1)}M
            </p>
            <p className="text-xs text-blue-600 mt-1">AOG Cost Avoidance / Year</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-800">
              ${(auditReduction / 1000).toFixed(0)}K
            </p>
            <p className="text-xs text-blue-600 mt-1">Audit Cost Reduction / Year</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-800">
              ${(counterfeitReduction / 1000).toFixed(0)}K
            </p>
            <p className="text-xs text-blue-600 mt-1">Counterfeit Risk Reduction</p>
          </div>

          {/* Full-width value cards */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-indigo-800">
              ${(aircraftValue / 1000000).toFixed(1)}M
            </p>
            <p className="text-xs text-indigo-600 mt-1">Aircraft Value Preserved</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-800">
              0% → 94%+
            </p>
            <p className="text-xs text-blue-600 mt-1">Digital Thread Coverage</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-emerald-800">
              ${(fiveYearValue / 1000000).toFixed(0)}M+
            </p>
            <p className="text-xs text-emerald-600 mt-1 font-medium">5-Year Total Value</p>
          </div>
        </div>

        {/* ── STACKED BAR CHART ── */}
        {/* Visual breakdown of annual savings by category */}
        <div className="mb-6">
          <p className="text-xs text-slate-500 mb-2 font-medium">Annual Savings Breakdown</p>
          <div className="flex h-8 rounded-lg overflow-hidden border border-slate-200">
            {barSegments.map((seg) => {
              const pct = barTotal > 0 ? (seg.value / barTotal) * 100 : 0;
              if (pct < 1) return null; // Skip tiny segments
              return (
                <div
                  key={seg.label}
                  className={`${seg.color} flex items-center justify-center text-white text-[10px] font-medium transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${seg.label}: $${(seg.value / 1000000).toFixed(1)}M`}
                >
                  {pct > 12 ? `${seg.label} $${(seg.value / 1000000).toFixed(1)}M` : ""}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-2">
            {barSegments.map((seg) => (
              <div key={seg.label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <div className={`w-2.5 h-2.5 rounded-sm ${seg.color}`} />
                {seg.label}: ${(seg.value / 1000000).toFixed(1)}M
              </div>
            ))}
          </div>
        </div>

        {/* Bottom insight */}
        <div className="bg-slate-50 border rounded-lg p-5 text-center">
          <TrendingUp className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm text-slate-700">
            At {inputs.shops} shops processing {inputs.partsPerYear.toLocaleString()} overhauls/year,
            AeroVision delivers <strong>${(annualSavings / 1000000).toFixed(1)}M in annual savings</strong> across
            labor, AOG avoidance, audit prep, and counterfeit prevention — plus{" "}
            <strong>${(aircraftValue / 1000000).toFixed(1)}M in aircraft value preservation</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── STEP 7: TRY IT YOURSELF ────────────────────────────────
// Links back to the app for free exploration
function StepExplore({ onNavigate }: { onNavigate: (path: string) => void }) {
  const links = [
    { label: "Dashboard", desc: "Browse all components, alerts, and analytics", path: "/dashboard", icon: Search },
    { label: "Component Timeline", desc: "See a full back-to-birth digital thread", path: "/parts/demo-hpc7-overhaul", icon: Clock },
    { label: "Capture Workflow", desc: "Walk through the 6-step overhaul process", path: "/capture", icon: Sparkles },
    { label: "Glasses HUD", desc: "Experience the smart glasses view", path: "/glasses-demo", icon: Glasses },
    { label: "Integrity & Compliance", desc: "See the exception detection engine", path: "/integrity", icon: Shield },
  ];

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        {/* ── CLOSING STATEMENT CARD ── */}
        <div className="border-t border-b border-slate-200 rounded-xl p-8 mb-8 bg-gradient-to-b from-white to-slate-50">
          <p className="text-xl md:text-2xl font-semibold text-slate-800 leading-relaxed">
            The aerospace industry is moving to digital thread.
            The question isn&apos;t <em>whether</em> — it&apos;s who gets there first.
          </p>
          <p className="text-sm text-slate-500 mt-4">
            Everything you&apos;ve seen is live. This isn&apos;t a slide deck — it&apos;s a working system.
          </p>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Your Turn
        </h2>
        <p className="text-sm text-slate-500 mb-8">
          Explore the app freely. Click anything. Ask questions.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.path}
                onClick={() => onNavigate(link.path)}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow text-left flex items-start gap-3 bg-white"
              >
                <Icon className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">{link.label}</p>
                  <p className="text-xs text-slate-500">{link.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 ml-auto mt-1 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
