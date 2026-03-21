"use client";

// Template selection flow for CMM-guided inspections.
// Step 1: Look up component by serial/part number
// Step 2: Show matching templates (from ComponentInspectionTemplate join table + partNumbersCovered)
// Step 3: Pick configuration variant (if applicable)
// Step 4: Start inspection → create session → redirect to /inspect/[sessionId]

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  ClipboardCheck,
  FileText,
  ChevronRight,
  AlertCircle,
  BookOpen,
} from "lucide-react";

// Types for the data we get back from the API
interface ComponentResult {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  status: string;
}

interface TemplateResult {
  id: string;
  title: string;
  revisionDate: string | null;
  version: number;
  status: string;
  sectionCount: number;
  itemCount: number;
  configVariants: string[];
}

export default function InspectSelectClient() {
  const router = useRouter();

  // Step tracking
  const [step, setStep] = useState<"component" | "template" | "start">("component");

  // Component lookup
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [component, setComponent] = useState<ComponentResult | null>(null);
  const [searchError, setSearchError] = useState("");

  // Template selection
  const [templates, setTemplates] = useState<TemplateResult[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateResult | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Config variant + work order
  const [configVariant, setConfigVariant] = useState<string>("");
  const [workOrderRef, setWorkOrderRef] = useState("");

  // Session creation
  const [creating, setCreating] = useState(false);

  // ── Step 1: Look up component ──
  async function handleSearch() {
    if (!searchInput.trim()) return;
    setSearching(true);
    setSearchError("");
    setComponent(null);
    setTemplates([]);
    setSelectedTemplate(null);

    try {
      const res = await fetch(apiUrl(`/api/components?search=${encodeURIComponent(searchInput.trim())}&pageSize=5`));
      const data = await res.json();

      if (!res.ok || !data.data?.length) {
        setSearchError("No component found. Try a different serial or part number.");
        return;
      }

      // Take the first match
      const comp = data.data[0];
      setComponent({
        id: comp.id,
        partNumber: comp.partNumber,
        serialNumber: comp.serialNumber,
        description: comp.description,
        status: comp.status,
      });

      // Auto-load templates for this component
      await loadTemplates(comp.id, comp.partNumber);
      setStep("template");
    } catch {
      setSearchError("Failed to search. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  // ── Step 2: Load matching templates ──
  async function loadTemplates(componentId: string, partNumber: string) {
    setLoadingTemplates(true);
    try {
      // Fetch templates linked to this component or matching the part number
      const res = await fetch(apiUrl(`/api/inspect/templates?componentId=${componentId}&partNumber=${encodeURIComponent(partNumber)}`));
      const data = await res.json();

      if (res.ok && data.success) {
        setTemplates(data.data);
        // Auto-select if only one template
        if (data.data.length === 1) {
          setSelectedTemplate(data.data[0]);
          setStep("start");
        }
      }
    } catch {
      // Templates endpoint might not exist yet — that's fine
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }

  function handleTemplateSelect(template: TemplateResult) {
    setSelectedTemplate(template);
    setConfigVariant("");
    setStep("start");
  }

  // ── Step 4: Create session and go ──
  async function handleStartInspection() {
    if (!component || !selectedTemplate) return;
    setCreating(true);

    try {
      const res = await fetch(apiUrl("/api/inspect/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentId: component.id,
          templateId: selectedTemplate.id,
          configurationVariant: configVariant || null,
          workOrderRef: workOrderRef || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        router.push(`/jobs/${data.data.sessionId}`);
      } else {
        setSearchError(data.error || "Failed to create inspection session");
      }
    } catch {
      setSearchError("Failed to start inspection. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function handleReset() {
    setStep("component");
    setComponent(null);
    setTemplates([]);
    setSelectedTemplate(null);
    setConfigVariant("");
    setWorkOrderRef("");
    setSearchInput("");
    setSearchError("");
  }

  return (
    <div className="max-w-2xl mx-auto py-2">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-slate-700" />
          CMM-Guided Inspection
        </h1>
        <p className="text-slate-500 mt-1">
          Select a component and template to start a guided inspection
        </p>
      </div>

      {/* Step 1: Component Lookup */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-sm font-mono">1</span>
            Find Component
          </CardTitle>
        </CardHeader>
        <CardContent>
          {component ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-900 font-medium">{component.description}</p>
                  <p className="text-slate-500 text-sm">
                    P/N: {component.partNumber} &middot; S/N: {component.serialNumber}
                  </p>
                </div>
                <Badge variant="outline" className="text-slate-600 border-slate-300">
                  {component.status}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-500 hover:text-slate-700">
                Change component
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Serial number or part number..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searching || !searchInput.trim()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          )}
          {searchError && (
            <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {searchError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Template Selection */}
      {step !== "component" && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-sm font-mono">2</span>
              Select Template
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <div className="text-slate-500 space-y-2">
                <p className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  No CMM template found for this component.
                </p>
                <Button variant="outline" size="sm" onClick={() => router.push("/library")}>
                  <BookOpen className="h-4 w-4 mr-1" /> Upload one in the Library
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateSelect(t)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selectedTemplate?.id === t.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-900 font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400" />
                          {t.title}
                        </p>
                        <p className="text-slate-400 text-sm mt-1">
                          Rev. {t.revisionDate ? new Date(t.revisionDate).toLocaleDateString() : "—"}
                          {" · "}
                          {t.sectionCount} sections · {t.itemCount} items
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Config variant + Work order + Start */}
      {step === "start" && selectedTemplate && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-sm font-mono">3</span>
              Start Inspection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Config variant selector — only show if template has variants */}
            {selectedTemplate.configVariants.length > 0 && (
              <div className="space-y-2">
                <label className="text-slate-600 text-sm font-medium">Configuration Variant</label>
                <Select value={configVariant} onValueChange={setConfigVariant}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select variant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTemplate.configVariants.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Work order reference (optional) */}
            <div className="space-y-2">
              <label className="text-slate-600 text-sm font-medium">Work Order Reference (optional)</label>
              <Input
                placeholder="e.g., WO#359847"
                value={workOrderRef}
                onChange={(e) => setWorkOrderRef(e.target.value)}
              />
            </div>

            <Button
              onClick={handleStartInspection}
              disabled={creating || (selectedTemplate.configVariants.length > 0 && !configVariant)}
              className="w-full h-14 text-lg font-medium bg-blue-600 hover:bg-blue-700"
            >
              {creating ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Creating session...</>
              ) : (
                <><ClipboardCheck className="h-5 w-5 mr-2" /> Start Inspection</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
