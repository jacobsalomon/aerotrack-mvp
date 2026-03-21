"use client";

// New Job Dialog — look up a component by WO# or serial, optionally match a template,
// then create either a guided inspection or freeform capture session.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";
import { Loader2, Search, Sparkles } from "lucide-react";

// The 3 FAA form types for freeform capture
const FORM_TYPES = [
  { id: "8130-3", label: "FAA 8130-3", desc: "Authorized Release Certificate" },
  { id: "337", label: "FAA 337", desc: "Major Repair and Alteration" },
  { id: "8010-4", label: "FAA 8010-4", desc: "Malfunction or Defect Report" },
];

interface ComponentResult {
  id: string;
  partNumber: string;
  serialNumber: string | null;
  description: string;
}

interface TemplateResult {
  id: string;
  title: string;
  itemCount: number;
}

export function NewJobDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  // Lookup state
  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [looked, setLooked] = useState(false);
  const [component, setComponent] = useState<ComponentResult | null>(null);
  const [template, setTemplate] = useState<TemplateResult | null>(null);

  // Freeform fallback state
  const [showFormPicker, setShowFormPicker] = useState(false);

  // Creation state
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setQuery("");
    setLooking(false);
    setLooked(false);
    setComponent(null);
    setTemplate(null);
    setShowFormPicker(false);
    setCreating(false);
    setError(null);
  }

  // Look up a component by the search term, then check for matching templates
  async function handleLookup() {
    if (!query.trim()) return;
    setLooking(true);
    setLooked(false);
    setComponent(null);
    setTemplate(null);
    setError(null);

    try {
      // Search components
      const compRes = await fetch(apiUrl(`/api/components?search=${encodeURIComponent(query.trim())}`));
      if (!compRes.ok) throw new Error("Component search failed");
      const compData = await compRes.json();
      const components: ComponentResult[] = compData.data || [];

      if (components.length > 0) {
        const match = components[0];
        setComponent(match);

        // Check for matching inspection templates
        const tmplRes = await fetch(
          apiUrl(`/api/inspect/templates?componentId=${match.id}&partNumber=${encodeURIComponent(match.partNumber)}`)
        );
        if (tmplRes.ok) {
          const tmplData = await tmplRes.json();
          const templates = tmplData.data || [];
          if (templates.length > 0) {
            const t = templates[0];
            // Count items across sections
            const itemCount = t.sections?.reduce(
              (sum: number, s: { items: unknown[] }) => sum + (s.items?.length || 0),
              0
            ) || 0;
            setTemplate({ id: t.id, title: t.title, itemCount });
          }
        }
      }

      setLooked(true);
    } catch (err) {
      console.error("Lookup error:", err);
      setError("Search failed. Please try again.");
    } finally {
      setLooking(false);
    }
  }

  // Create a guided inspection session (template matched)
  async function startGuidedJob() {
    if (!template || !component) return;
    setCreating(true);
    setError(null);

    // Decide if the input looks like a work order number (has letters + numbers)
    const woRef = looksLikeWorkOrder(query.trim()) ? query.trim() : null;

    try {
      const res = await fetch(apiUrl("/api/inspect/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          componentId: component.id,
          workOrderRef: woRef,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to create job");
      }
      const result = await res.json();
      onOpenChange(false);
      reset();
      router.push(`/jobs/${result.data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
      setCreating(false);
    }
  }

  // Create a freeform capture session
  async function startFreeformJob(formType?: string) {
    setCreating(true);
    setError(null);

    const woRef = looksLikeWorkOrder(query.trim()) ? query.trim() : null;

    try {
      const res = await fetch(apiUrl("/api/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: woRef ? `Capture for ${woRef}` : "Web capture session",
          targetFormType: formType || null,
          workOrderRef: woRef,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to create job");
      }
      const session = await res.json();
      onOpenChange(false);
      reset();
      router.push(`/jobs/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-lg font-bold"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Start New Job
          </DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="flex gap-2 mt-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleLookup()}
            placeholder="e.g., WO#359847 or SN-2024-11432"
            className="flex-1"
            disabled={creating}
          />
          <Button
            onClick={() => void handleLookup()}
            disabled={looking || !query.trim() || creating}
            variant="outline"
            className="gap-1.5 shrink-0"
          >
            {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Look Up
          </Button>
        </div>

        {/* Results */}
        {looked && (
          <div className="mt-2 space-y-3">
            {component ? (
              <>
                {/* Component found */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-800">{component.description}</p>
                  <p className="text-xs text-emerald-600 mt-1 font-mono">
                    P/N: {component.partNumber}
                    {component.serialNumber && ` · S/N: ${component.serialNumber}`}
                  </p>
                </div>

                {template && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-blue-800">{template.title}</p>
                        <p className="text-xs text-blue-600 mt-0.5">{template.itemCount} inspection items</p>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => template ? void startGuidedJob() : void startFreeformJob()}
                  disabled={creating}
                  className="w-full gap-2"
                  style={{ backgroundColor: "rgb(37, 99, 235)", color: "white" }}
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Start Job
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-500">No component found for that identifier.</p>
            )}
          </div>
        )}

        {/* Start without lookup */}
        {!showFormPicker ? (
          <button
            onClick={() => setShowFormPicker(true)}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            disabled={creating}
          >
            Start without a work order or component
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Select form type</p>
            {FORM_TYPES.map((form) => (
              <button
                key={form.id}
                onClick={() => void startFreeformJob(form.id)}
                disabled={creating}
                className="flex items-start gap-3 w-full rounded-lg border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50 hover:border-slate-300"
              >
                <div>
                  <p className="font-mono text-xs font-semibold text-slate-800">{form.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{form.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="text-xs mt-2" style={{ color: "rgb(239, 68, 68)" }}>
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Check if input looks like a work order number (contains both letters and numbers)
function looksLikeWorkOrder(input: string): boolean {
  return /[a-zA-Z]/.test(input) && /\d/.test(input);
}
