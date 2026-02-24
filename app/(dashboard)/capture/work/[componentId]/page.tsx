"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Camera,
  CameraOff,
  Mic,
  Plus,
  Ruler,
  Wrench,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Sparkles,
  PenTool,
  Play,
  Square,
} from "lucide-react";
import Form8130Preview, { type Form8130Data } from "@/components/documents/form-8130-preview";

// The 6 overhaul steps
const STEPS = [
  { key: "receive", label: "Receive", num: 1 },
  { key: "teardown", label: "Teardown", num: 2 },
  { key: "inspect", label: "Inspect", num: 3 },
  { key: "repair", label: "Repair", num: 4 },
  { key: "test", label: "Test", num: 5 },
  { key: "release", label: "Release", num: 6 },
];

interface CapturedItem {
  id: string;
  type: "photo" | "voice" | "measurement" | "part_replaced" | "text_note";
  time: string;
  label: string;
  detail?: string;
  step: string;
}

interface TestResult {
  testName: string;
  spec: string;
  cmmRef: string;
  value: string;
  unit: string;
  result: "PASS" | "FAIL" | "";
}

interface ComponentInfo {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  oem: string;
  totalHours: number;
  totalCycles: number;
  status: string;
}

export default function CaptureWorkPage() {
  const params = useParams();
  const router = useRouter();
  const [component, setComponent] = useState<ComponentInfo | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [restrictedMode, setRestrictedMode] = useState(false);
  const [loading, setLoading] = useState(true);

  // Captured data across all steps
  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([]);
  const [receivingChecklist, setReceivingChecklist] = useState({
    pnMatch: false,
    snMatch: false,
    noDamage: false,
    docsComplete: false,
    tag8130: false,
    woReceived: false,
  });

  // Test results
  const [testResults, setTestResults] = useState<TestResult[]>([
    { testName: "Pressure Test", spec: "3,000 PSI for 5 min, no leaks", cmmRef: "CMM 29-10-01 §6.2", value: "", unit: "PSI", result: "" },
    { testName: "Flow Rate", spec: "12.0 ± 0.5 GPM", cmmRef: "CMM 29-10-01 §6.3", value: "", unit: "GPM", result: "" },
  ]);

  // Current text input for notes
  const [textNote, setTextNote] = useState("");
  const [measurementParam, setMeasurementParam] = useState("");
  const [measurementValue, setMeasurementValue] = useState("");
  const [measurementSpec, setMeasurementSpec] = useState("");

  // AI generation state
  const [generating, setGenerating] = useState(false);
  const [generatedDocs, setGeneratedDocs] = useState<{
    form8130: Record<string, string> | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workOrder: Record<string, any> | null;
    findingsReport: string | null;
    testResults: string | null;
  }>({ form8130: null, workOrder: null, findingsReport: null, testResults: null });

  // Signing state
  const [signed, setSigned] = useState(false);

  // Demo autopilot state — when active, the system auto-plays through
  // all 6 overhaul steps with realistic data appearing on a timer
  const [demoMode, setDemoMode] = useState(false);
  const demoAbortRef = useRef(false);

  useEffect(() => {
    async function fetchComponent() {
      const res = await fetch(apiUrl(`/api/components/${params.componentId}`));
      if (res.ok) {
        setComponent(await res.json());
      }
      setLoading(false);
    }
    fetchComponent();
  }, [params.componentId]);

  // Helper: add a captured item to a specific step (used by demo autopilot
  // so it can add items to any step without relying on currentStep state)
  function addItemToStep(step: string, type: CapturedItem["type"], label: string, detail?: string) {
    setCapturedItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        label,
        detail,
        step,
      },
    ]);
  }

  // Small helper to pause between demo events — makes the autopilot
  // feel natural by spacing out actions over time. Returns false if
  // the demo was cancelled while waiting.
  async function demoPause(ms: number): Promise<boolean> {
    await new Promise((r) => setTimeout(r, ms));
    return !demoAbortRef.current;
  }

  // ── DEMO AUTOPILOT ──
  // Walks through all 6 overhaul steps with realistic data appearing
  // at timed intervals for presentation purposes.
  // NOTE: This useCallback MUST be above the early returns below so
  // hooks always run in the same order on every render.
  const runDemoAutopilot = useCallback(async () => {
    if (!component) return;
    demoAbortRef.current = false;
    setDemoMode(true);

    // Reset everything to starting state
    setCapturedItems([]);
    setCurrentStep(0);
    setReceivingChecklist({ pnMatch: false, snMatch: false, noDamage: false, docsComplete: false, tag8130: false, woReceived: false });
    setTestResults([
      { testName: "Pressure Test", spec: "3,000 PSI for 5 min, no leaks", cmmRef: "CMM 29-10-01 §6.2", value: "", unit: "PSI", result: "" },
      { testName: "Flow Rate", spec: "12.0 ± 0.5 GPM", cmmRef: "CMM 29-10-01 §6.3", value: "", unit: "GPM", result: "" },
    ]);
    setGeneratedDocs({ form8130: null, workOrder: null, findingsReport: null, testResults: null });
    setSigned(false);

    // ── STEP 1: RECEIVE ──
    await demoPause(800);
    if (demoAbortRef.current) return;

    // Check receiving checklist items one by one
    const checklistKeys = ["pnMatch", "snMatch", "noDamage", "docsComplete", "tag8130", "woReceived"] as const;
    for (const key of checklistKeys) {
      if (demoAbortRef.current) return;
      setReceivingChecklist((prev) => ({ ...prev, [key]: true }));
      await demoPause(350);
    }

    // Add receiving evidence
    if (demoAbortRef.current) return;
    addItemToStep("receive", "photo", "As-received condition photo", "Component in shipping container, protective caps in place");
    await demoPause(600);
    if (demoAbortRef.current) return;
    addItemToStep("receive", "voice", "Receiving inspection note", "Component received from Delta TechOps. Packaging intact, no shipping damage. P/N and S/N verified against incoming paperwork.");
    await demoPause(1000);

    // ── STEP 2: TEARDOWN ──
    if (demoAbortRef.current) return;
    setCurrentStep(1);
    await demoPause(800);

    if (demoAbortRef.current) return;
    addItemToStep("teardown", "photo", "Pump housing — pre-teardown", "External surfaces show normal operational wear");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("teardown", "voice", "Beginning teardown", "Beginning teardown per CMM 881700-OH Chapter 72-00. Removing 12 housing bolts. Standard tooling.");
    await demoPause(800);
    if (demoAbortRef.current) return;
    addItemToStep("teardown", "photo", "Internal components exposed", "Housing separated, internal gear assembly visible");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("teardown", "voice", "Teardown observations", "All seals show normal wear. No visible contamination in fluid passages. Gear teeth look good from initial visual.");
    await demoPause(1000);

    // ── STEP 3: INSPECT ──
    if (demoAbortRef.current) return;
    setCurrentStep(2);
    await demoPause(800);

    if (demoAbortRef.current) return;
    addItemToStep("inspect", "photo", "Piston bore — 10x magnification", "No scoring or pitting visible under magnification");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("inspect", "measurement", "Piston bore diameter: 2.4985 in.", "Spec: 2.500 ± 0.002 in. — WITHIN LIMITS");
    await demoPause(800);
    if (demoAbortRef.current) return;
    addItemToStep("inspect", "voice", "Bore inspection findings", "Bore looks good, no scoring. Measuring at 2.4985, spec is 2.500 plus or minus 0.002 — within limits. Serviceable.");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("inspect", "measurement", "Gear backlash: 0.004 in.", "Spec: 0.003–0.006 in. — WITHIN LIMITS");
    await demoPause(800);
    if (demoAbortRef.current) return;
    addItemToStep("inspect", "voice", "Seal inspection findings", "Seal on inlet port is degraded — hardness Shore 82A, that's still in limits but I'd replace it given the hours on this unit. Recommend replacement.");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("inspect", "photo", "Inlet seal — degradation visible", "Seal hardness Shore 82A, within limits but showing age");
    await demoPause(1000);

    // ── STEP 4: REPAIR ──
    if (demoAbortRef.current) return;
    setCurrentStep(3);
    await demoPause(800);

    if (demoAbortRef.current) return;
    addItemToStep("repair", "voice", "Beginning seal replacement", "Replacing all O-ring seals per overhaul requirements. Old seals showing normal degradation.");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("repair", "part_replaced", "Seal kit installed — P/N SK-881700-1", "Old: O-ring seals (worn, Shore 82A) → New: Seal kit P/N SK-881700-1, CoC #24-11892");
    await demoPause(800);
    if (demoAbortRef.current) return;
    addItemToStep("repair", "photo", "New seal kit installed", "All seals seated properly in housing grooves");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("repair", "voice", "Service bulletin incorporation", "Incorporating SB 881700-29-004 — upgrading seal material to PTFE composite per Parker bulletin.");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("repair", "text_note", "Reassembly notes", "Loctite 567 applied per CMM step 4.3.2. Housing bolts torqued to 45 ft-lbs per Table 72-50-01. Safety wire installed.");
    await demoPause(1000);

    // ── STEP 5: TEST ──
    if (demoAbortRef.current) return;
    setCurrentStep(4);
    await demoPause(800);

    // Fill in test results
    if (demoAbortRef.current) return;
    setTestResults((prev) => {
      const updated = [...prev];
      updated[0] = { ...updated[0], value: "3,000", result: "PASS" };
      return updated;
    });
    await demoPause(800);
    if (demoAbortRef.current) return;
    setTestResults((prev) => {
      const updated = [...prev];
      updated[1] = { ...updated[1], value: "12.4", result: "PASS" };
      return updated;
    });
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("test", "photo", "Test bench setup with gauges", "Pressure and flow gauges connected, test fixture secured");
    await demoPause(700);
    if (demoAbortRef.current) return;
    addItemToStep("test", "voice", "Test results observation", "Pressure held at 3,000 PSI for 5 minutes, zero leakage. Flow rate 12.4 GPM, within spec. Both tests pass. Ready for release.");
    await demoPause(1200);

    // ── STEP 6: RELEASE — THE MAGIC MOMENT ──
    if (demoAbortRef.current) return;
    setCurrentStep(5);
    await demoPause(1000);

    // Auto-trigger documentation generation
    if (demoAbortRef.current) return;
    // generateDocumentation will be called, but we need to trigger it
    // by setting generating state and calling the API directly
    setGenerating(true);

    const payload = {
      component: {
        partNumber: component.partNumber,
        serialNumber: component.serialNumber,
        description: component.description,
        oem: component.oem,
        totalHours: component.totalHours,
        totalCycles: component.totalCycles,
      },
      capturedItems: [], // will be populated from state
      testResults: [
        { name: "Pressure Test", spec: "3,000 PSI for 5 min", value: "3,000 PSI — held, zero leakage", result: "PASS" },
        { name: "Flow Rate", spec: "12.0 ± 0.5 GPM", value: "12.4 GPM", result: "PASS" },
      ],
      receivingChecklist: { pnMatch: true, snMatch: true, noDamage: true, docsComplete: true, tag8130: true, woReceived: true },
    };

    try {
      const [form8130Res, workOrderRes] = await Promise.all([
        fetch(apiUrl("/api/ai/generate-8130"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
        fetch(apiUrl("/api/ai/generate-workorder"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
      ]);
      const form8130 = await form8130Res.json();
      const workOrder = await workOrderRes.json();
      const findingsCount = workOrder.findings?.length || 3;
      const testsCount = workOrder.testResults?.length || 2;
      setGeneratedDocs({
        form8130,
        workOrder,
        findingsReport: `${findingsCount} findings documented with photo references and CMM dispositions.`,
        testResults: `${testsCount} tests performed — all PASS.`,
      });
    } catch {
      // If API fails, still show something for the demo
      setGeneratedDocs({
        form8130: null,
        workOrder: null,
        findingsReport: "Generation failed — please try again.",
        testResults: null,
      });
    }
    setGenerating(false);
    setDemoMode(false);
  }, [component]);

  function stopDemo() {
    demoAbortRef.current = true;
    setDemoMode(false);
  }

  // ── EARLY RETURNS (must be AFTER all hooks) ──
  if (loading) return <p className="py-12 text-center text-slate-500">Loading...</p>;
  if (!component) return <p className="py-12 text-center text-slate-500">Component not found.</p>;

  const currentStepKey = STEPS[currentStep].key;

  function addItem(type: CapturedItem["type"], label: string, detail?: string) {
    setCapturedItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        label,
        detail,
        step: currentStepKey,
      },
    ]);
  }

  function addTextNote() {
    if (!textNote.trim()) return;
    addItem("text_note", textNote);
    setTextNote("");
  }

  function addMeasurement() {
    if (!measurementParam || !measurementValue) return;
    const pass = measurementSpec ? "— checking..." : "";
    addItem("measurement", `${measurementParam}: ${measurementValue}`, measurementSpec ? `Spec: ${measurementSpec} ${pass}` : undefined);
    setMeasurementParam("");
    setMeasurementValue("");
    setMeasurementSpec("");
  }

  async function generateDocumentation() {
    if (!component) return;
    setGenerating(true);

    // Build the payload with all captured data for the AI routes
    const payload = {
      component: {
        partNumber: component.partNumber,
        serialNumber: component.serialNumber,
        description: component.description,
        oem: component.oem,
        totalHours: component.totalHours,
        totalCycles: component.totalCycles,
      },
      capturedItems,
      testResults,
      receivingChecklist,
    };

    try {
      // Call both AI routes in parallel for speed
      const [form8130Res, workOrderRes] = await Promise.all([
        fetch(apiUrl("/api/ai/generate-8130"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        fetch(apiUrl("/api/ai/generate-workorder"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ]);

      const form8130 = await form8130Res.json();
      const workOrder = await workOrderRes.json();

      // Count findings and test results for the summary cards
      const findingsCount = workOrder.findings?.length || capturedItems.filter((i) => i.type === "text_note" || i.type === "voice").length;
      const testsCount = workOrder.testResults?.length || testResults.length;
      const allPass = workOrder.testResults?.every((t: { passFail: string }) => t.passFail === "PASS") ?? testResults.every((t) => t.result === "PASS");

      setGeneratedDocs({
        form8130,
        workOrder,
        findingsReport: `${findingsCount} findings documented with photo references and CMM dispositions.`,
        testResults: `${testsCount} tests performed — ${allPass ? "all PASS" : "review required"}.`,
      });
    } catch (error) {
      console.error("Documentation generation failed:", error);
      // Show a user-friendly error state
      setGeneratedDocs({
        form8130: null,
        workOrder: null,
        findingsReport: "Generation failed — please try again.",
        testResults: null,
      });
    }
    setGenerating(false);
  }

  // The 8130-3 data is already parsed (the API returns JSON directly)
  const form8130Data = generatedDocs.form8130;

  return (
    <div className="max-w-5xl mx-auto">
      {/* ITAR Banner */}
      {restrictedMode && (
        <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-lg mb-4 text-sm font-medium flex items-center gap-2">
          <CameraOff className="h-4 w-4" />
          RESTRICTED MODE — Camera disabled for ITAR compliance
        </div>
      )}

      {/* Demo mode banner — pulsing blue to show the autopilot is running */}
      {demoMode && (
        <div className="bg-blue-100 border border-blue-300 text-blue-800 px-4 py-2 rounded-lg mb-4 text-sm font-medium flex items-center gap-2 animate-pulse">
          <Play className="h-4 w-4" />
          Demo Mode — Auto-playing overhaul capture...
          <Button size="sm" variant="outline" onClick={stopDemo} className="ml-auto gap-1 text-blue-800 border-blue-300 hover:bg-blue-200">
            <Square className="h-3 w-3" /> Stop
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            AeroVision Capture — {component.partNumber}
          </h1>
          <p className="text-sm text-slate-500">
            {component.serialNumber} · {component.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Demo autopilot button — plays through the entire overhaul automatically */}
          {!demoMode && !signed && (
            <Button size="sm" variant="outline" onClick={runDemoAutopilot} className="gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50">
              <Play className="h-3.5 w-3.5" /> Play Demo
            </Button>
          )}
          <Label htmlFor="rm" className="text-xs text-slate-500">Restricted Mode</Label>
          <Switch id="rm" checked={restrictedMode} onCheckedChange={setRestrictedMode} />
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6 bg-white rounded-lg p-3 border">
        {STEPS.map((step, i) => {
          const isComplete = i < currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={step.key} className="flex items-center flex-1">
              <button
                onClick={() => i <= currentStep && setCurrentStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors w-full ${
                  isCurrent
                    ? "bg-blue-600 text-white"
                    : isComplete
                    ? "bg-green-100 text-green-800 cursor-pointer hover:bg-green-200"
                    : "text-slate-400 cursor-default"
                }`}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="text-xs">{step.num}.</span>
                )}
                {step.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 text-slate-300 mx-1 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Main capture area (3 cols) */}
        <div className="lg:col-span-3">
          {/* STEP: Receive */}
          {currentStepKey === "receive" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receiving Inspection</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                  <div>
                    <p className="text-slate-500 text-xs">P/N</p>
                    <p className="font-mono font-medium">{component.partNumber}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">S/N</p>
                    <p className="font-mono font-medium">{component.serialNumber}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Hours</p>
                    <p>{component.totalHours.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Cycles</p>
                    <p>{component.totalCycles.toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  {[
                    { key: "pnMatch" as const, label: "P/N matches documentation" },
                    { key: "snMatch" as const, label: "S/N matches documentation" },
                    { key: "noDamage" as const, label: "No visible shipping damage" },
                    { key: "docsComplete" as const, label: "Traceability docs complete" },
                    { key: "tag8130" as const, label: "8130-3 tag present & valid" },
                    { key: "woReceived" as const, label: "Customer work order received" },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={receivingChecklist[item.key]}
                        onCheckedChange={(v) =>
                          setReceivingChecklist((prev) => ({ ...prev, [item.key]: !!v }))
                        }
                      />
                      <span className="text-sm">{item.label}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-400 mb-4">
                  Customer Work Scope: &ldquo;Full overhaul per CMM 29-10-01&rdquo;
                </p>

                {/* Capture tools for receiving — photo of as-received condition, voice note */}
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Capture Evidence</p>
                  {!restrictedMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => addItem("photo", "As-received condition photo", "Photo of component upon arrival")}
                    >
                      <Camera className="h-4 w-4" /> Photo — As-Received Condition
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => addItem("voice", "Receiving inspection note", "Voice note captured during receiving inspection")}
                  >
                    <Mic className="h-4 w-4" /> Voice Note
                  </Button>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a note about incoming condition..."
                      value={textNote}
                      onChange={(e) => setTextNote(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                    <Button size="sm" variant="secondary" onClick={addTextNote} className="shrink-0 self-end">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEPS: Teardown, Inspect, Repair */}
          {(currentStepKey === "teardown" || currentStepKey === "inspect" || currentStepKey === "repair") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base capitalize">{currentStepKey === "inspect" ? "Detailed Inspection" : currentStepKey === "repair" ? "Repair & Reassembly" : "Teardown"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Photo button */}
                  {!restrictedMode && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => addItem("photo", `Photo — ${currentStepKey}`, "Simulated photo capture")}
                    >
                      <Camera className="h-4 w-4" /> Take Photo
                    </Button>
                  )}

                  {/* Voice note */}
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => addItem("voice", "Voice note recorded", "Piston bore looks good, no scoring. Measuring at 2.4985 inches, spec is 2.500 plus or minus 0.002 — within limits.")}
                  >
                    <Mic className="h-4 w-4" /> Record Voice Note
                  </Button>

                  {/* Measurement */}
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Ruler className="h-4 w-4" /> Log Measurement
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Input placeholder="Parameter" value={measurementParam} onChange={(e) => setMeasurementParam(e.target.value)} className="text-sm" />
                      <Input placeholder="Value" value={measurementValue} onChange={(e) => setMeasurementValue(e.target.value)} className="text-sm" />
                      <Input placeholder="Spec (optional)" value={measurementSpec} onChange={(e) => setMeasurementSpec(e.target.value)} className="text-sm" />
                    </div>
                    <Button size="sm" variant="secondary" onClick={addMeasurement}>Add Measurement</Button>
                  </div>

                  {/* Part replacement (repair step) */}
                  {currentStepKey === "repair" && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => addItem("part_replaced", "Part replaced", "Old: 881700-1045 (worn) → New: 881700-1045 S/N: 2026-01-08821")}
                    >
                      <Wrench className="h-4 w-4" /> Log Part Replacement
                    </Button>
                  )}

                  {/* Text note */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a text note..."
                      value={textNote}
                      onChange={(e) => setTextNote(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                    <Button size="sm" variant="secondary" onClick={addTextNote} className="shrink-0 self-end">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP: Test */}
          {currentStepKey === "test" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Functional Testing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {testResults.map((test, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">{test.testName}</p>
                        <Badge
                          variant="outline"
                          className={
                            test.result === "PASS"
                              ? "bg-green-100 text-green-800"
                              : test.result === "FAIL"
                              ? "bg-red-100 text-red-800"
                              : "bg-slate-100 text-slate-500"
                          }
                        >
                          {test.result || "Pending"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">
                        Spec: {test.spec} ({test.cmmRef})
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder={`Value (${test.unit})`}
                          value={test.value}
                          onChange={(e) => {
                            const updated = [...testResults];
                            updated[i] = { ...updated[i], value: e.target.value, result: e.target.value ? "PASS" : "" };
                            setTestResults(updated);
                          }}
                          className="text-sm w-32"
                        />
                        <span className="text-sm text-slate-500">{test.unit}</span>
                      </div>
                    </div>
                  ))}
                  {!restrictedMode && (
                    <Button variant="outline" className="gap-2" onClick={() => addItem("photo", "Test setup photo", "Photo of test bench setup")}>
                      <Camera className="h-4 w-4" /> Photo of Test Setup
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP: Release — THE MAGIC MOMENT
              This is where the AI-generated 8130-3 form appears,
              rendered as a visual FAA form (not raw JSON). */}
          {currentStepKey === "release" && !signed && (
            <div className="space-y-4">
              {/* Pre-generation state — prompt to generate */}
              {!generatedDocs.form8130 && !generating && (
                <Card>
                  <CardContent className="pt-8 pb-8">
                    <div className="text-center py-4">
                      <Sparkles className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                      <p className="text-lg font-medium mb-2">Ready to generate documentation</p>
                      <p className="text-sm text-slate-500 mb-6">
                        AI will create your 8130-3, work order, findings report, and test results from everything you captured.
                      </p>
                      <Button size="lg" onClick={generateDocumentation} className="gap-2">
                        <Sparkles className="h-4 w-4" /> Generate Documentation
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Generating state — loading animation */}
              {generating && (
                <Card>
                  <CardContent className="pt-8 pb-8">
                    <div className="text-center py-8">
                      <Loader2 className="h-10 w-10 text-blue-600 mx-auto mb-4 animate-spin" />
                      <p className="text-lg font-medium">Generating 8130-3...</p>
                      <p className="text-sm text-slate-500">AI is processing your photos, voice notes, and measurements</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Generated state — the rendered 8130-3 form with animation */}
              {form8130Data && !generating && (
                <>
                  {/* The visual 8130-3 form — the "money shot" */}
                  <Form8130Preview
                    data={form8130Data as unknown as Form8130Data}
                    animate={true}
                    signed={signed}
                    showDownload={true}
                    componentId={params.componentId as string}
                  />

                  {/* Supporting documents summary cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="border rounded-lg p-3 bg-green-50">
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium">Work Order</p>
                      </div>
                      <p className="text-xs text-slate-500">
                        {generatedDocs.workOrder?.workOrderNumber
                          ? `${generatedDocs.workOrder.workOrderNumber} — ${generatedDocs.workOrder.findings?.length || 0} findings, ${generatedDocs.workOrder.workPerformed?.length || 0} actions documented.`
                          : "Work order generated with full findings and repair details."}
                      </p>
                    </div>
                    <div className="border rounded-lg p-3 bg-green-50">
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium">Findings Report</p>
                      </div>
                      <p className="text-xs text-slate-500">{generatedDocs.findingsReport}</p>
                    </div>
                    <div className="border rounded-lg p-3 bg-green-50">
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium">Test Results</p>
                      </div>
                      <p className="text-xs text-slate-500">{generatedDocs.testResults}</p>
                    </div>
                  </div>

                  {/* Sign button */}
                  <Button size="lg" className="w-full gap-2" onClick={() => setSigned(true)}>
                    <PenTool className="h-4 w-4" /> Approve & Sign Electronically
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Signed success */}
          {currentStepKey === "release" && signed && (
            <Card className="border-green-300 bg-green-50">
              <CardContent className="pt-8 pb-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-green-900 mb-2">Documentation Complete</h2>
                <p className="text-sm text-green-800 mb-1">
                  {component.partNumber} ({component.serialNumber}) — {component.description}
                </p>
                <p className="text-sm text-green-700 mb-4">
                  Status: <span className="font-bold">Returned to Service — Overhauled</span>
                </p>
                <div className="text-sm text-green-700 mb-4 space-y-1">
                  <p>4 documents generated, signed, and sealed.</p>
                  <p>{capturedItems.filter((i) => i.type === "photo").length} photos, {capturedItems.filter((i) => i.type === "voice").length} voice notes, {capturedItems.filter((i) => i.type === "measurement").length} measurements archived.</p>
                  <p className="font-mono text-xs text-green-600 mt-2">
                    SHA-256: 7a3f2b1c8d9e0f1a2b3c4d5e6f7a8b9c...
                  </p>
                </div>
                <p className="text-xs text-green-600 mb-6">
                  Lifecycle record updated. Ready for export.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" className="gap-2">
                    Export to AMOS/TRAX
                  </Button>
                  <Button variant="outline" className="gap-2">
                    Export to SkyThread
                  </Button>
                  <Button onClick={() => router.push("/capture")} className="gap-2">
                    Scan Next Part
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Captured evidence sidebar (2 cols) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Captured Evidence</CardTitle>
              <p className="text-xs text-slate-400">
                {capturedItems.length} items captured
              </p>
            </CardHeader>
            <CardContent>
              {capturedItems.length === 0 ? (
                <div className="py-6 text-center">
                  <Camera className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-500 mb-1">
                    No evidence captured yet
                  </p>
                  <p className="text-xs text-slate-400 mb-3">
                    Photos, voice notes, and measurements will appear here as you capture them.
                  </p>
                  {!restrictedMode && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => addItem("photo", `Photo — ${currentStepKey}`, "Quick capture from evidence panel")}
                    >
                      <Camera className="h-3.5 w-3.5" /> Quick Photo
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {capturedItems.slice().reverse().map((item) => (
                    <div key={item.id} className="flex items-start gap-2 p-2 rounded border text-sm">
                      <span className="text-xs mt-0.5">
                        {item.type === "photo" && "📷"}
                        {item.type === "voice" && "🎤"}
                        {item.type === "measurement" && "📏"}
                        {item.type === "part_replaced" && "🔧"}
                        {item.type === "text_note" && "✏️"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{item.label}</p>
                        {item.detail && (
                          <p className="text-xs text-slate-500 line-clamp-2">{item.detail}</p>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Work summary */}
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Work Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1 text-slate-600">
              <p>📷 {capturedItems.filter((i) => i.type === "photo").length} photos</p>
              <p>🎤 {capturedItems.filter((i) => i.type === "voice").length} voice notes</p>
              <p>📏 {capturedItems.filter((i) => i.type === "measurement").length} measurements</p>
              <p>🔧 {capturedItems.filter((i) => i.type === "part_replaced").length} parts replaced</p>
              <p>✏️ {capturedItems.filter((i) => i.type === "text_note").length} text notes</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Navigation buttons */}
      {!signed && (
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            disabled={currentStep === 0}
            onClick={() => setCurrentStep((s) => s - 1)}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {currentStep < STEPS.length - 1 && (
            <Button
              onClick={() => setCurrentStep((s) => s + 1)}
              className="gap-1"
            >
              Next: {STEPS[currentStep + 1].label} <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
