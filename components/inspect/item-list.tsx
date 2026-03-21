"use client";

// Inspection item list within the active section
// Shows items with progressive disclosure: collapsed → status dot + callout + name
// Expanded → full spec, value entry, pass/fail buttons, notes

import { useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Image as ImageIcon, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import InspectionStatusIndicator from "./inspection-status-indicator";
import NumericKeypad from "./numeric-keypad";

interface InspectionItem {
  id: string;
  itemType: string;
  itemCallout: string | null;
  parameterName: string;
  specification: string;
  specValueLow: number | null;
  specValueHigh: number | null;
  specUnit: string | null;
  specValueLowMetric: number | null;
  specValueHighMetric: number | null;
  specUnitMetric: string | null;
  toolsRequired: string[];
  checkReference: string | null;
  repairReference: string | null;
  notes: string | null;
  sortOrder: number;
}

interface ProgressRecord {
  inspectionItemId: string;
  status: string;
  result: string | null;
  measurementId: string | null;
  measurement: {
    id: string;
    value: number;
    unit: string;
    inTolerance: boolean | null;
    status: string;
  } | null;
}

interface Props {
  items: InspectionItem[];
  progressMap: Map<string, ProgressRecord>;
  sessionId: string;
  sectionId: string;
  isReadOnly: boolean;
  onItemCompleted: (itemId: string, status: string, result: string | null, measurement: ProgressRecord["measurement"]) => void;
  referenceImageUrls: string[];
}

export default function ItemList({
  items,
  progressMap,
  sessionId,
  sectionId,
  isReadOnly,
  onItemCompleted,
  referenceImageUrls,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [keypadItemId, setKeypadItemId] = useState<string | null>(null);
  const [keypadValue, setKeypadValue] = useState("");

  // Pass/fail items can be completed with one tap
  const isPassFailType = (type: string) =>
    ["visual_check", "procedural_check", "safety_wire"].includes(type);

  // Handle pass/fail for simple items
  async function handlePassFail(item: InspectionItem, result: "pass" | "fail") {
    if (isReadOnly) return;
    setSubmitting(item.id);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/items/${item.id}/complete`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onItemCompleted(item.id, data.data.progressStatus, data.data.progressResult, null);
      }
    } catch (err) {
      console.error("Pass/fail error:", err);
    } finally {
      setSubmitting(null);
    }
  }

  // Handle numeric value submission from keypad
  async function handleNumericSubmit(item: InspectionItem) {
    if (isReadOnly || !keypadValue) return;
    const numericValue = parseFloat(keypadValue);
    if (isNaN(numericValue)) return;

    setSubmitting(item.id);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/items/${item.id}/complete`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: numericValue,
          unit: item.specUnit || "units",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onItemCompleted(item.id, data.data.progressStatus, data.data.progressResult, data.data.measurement);
        setKeypadItemId(null);
        setKeypadValue("");
      }
    } catch (err) {
      console.error("Numeric submit error:", err);
    } finally {
      setSubmitting(null);
    }
  }

  // Handle skip
  async function handleSkip(item: InspectionItem) {
    if (isReadOnly) return;
    const reason = prompt("Reason for skipping this item:");
    if (!reason) return;

    setSubmitting(item.id);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/items/${item.id}/skip`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onItemCompleted(item.id, "skipped", "not_applicable", null);
      }
    } catch (err) {
      console.error("Skip error:", err);
    } finally {
      setSubmitting(null);
    }
  }

  // Find the item the keypad is open for
  const keypadItem = keypadItemId ? items.find((i) => i.id === keypadItemId) : null;

  return (
    <div className="px-4 py-3">
      {/* Reference diagram panel (collapsible) */}
      {referenceImageUrls.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setDiagramOpen(!diagramOpen)}
            className="flex items-center gap-2 text-white/50 hover:text-white/70 text-sm mb-2"
          >
            <ImageIcon className="h-4 w-4" />
            Reference Diagram
            {diagramOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {diagramOpen && (
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <img
                src={referenceImageUrls[0]}
                alt="Reference diagram"
                className="max-w-full max-h-[400px] object-contain mx-auto rounded"
              />
            </div>
          )}
        </div>
      )}

      {/* Item rows */}
      <div className="space-y-1">
        {items.map((item) => {
          const progress = progressMap.get(item.id);
          const status = progress?.status || "pending";
          const isExpanded = expandedId === item.id;
          const isPassFail = isPassFailType(item.itemType);

          return (
            <div key={item.id} className="bg-white/5 rounded-lg border border-white/10">
              {/* Collapsed row — always visible */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left"
              >
                <InspectionStatusIndicator status={status} size="sm" />

                {item.itemCallout && (
                  <span className="text-white/40 text-xs font-mono w-10 flex-shrink-0">
                    #{item.itemCallout}
                  </span>
                )}

                <span className={cn(
                  "flex-1 text-sm truncate",
                  status === "done" ? "text-white/50" : "text-white"
                )}>
                  {item.parameterName}
                </span>

                {/* Show captured value if done */}
                {progress?.measurement && (
                  <span className={cn(
                    "text-sm font-mono flex-shrink-0",
                    progress.measurement.inTolerance === false ? "text-red-400" : "text-green-400"
                  )}>
                    {progress.measurement.value} {progress.measurement.unit}
                  </span>
                )}

                {/* Pass/fail inline buttons (no expansion needed) */}
                {isPassFail && status === "pending" && !isReadOnly ? (
                  <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 h-[44px] px-4 text-sm font-medium"
                      disabled={submitting === item.id}
                      onClick={() => handlePassFail(item, "pass")}
                    >
                      PASS
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 h-[44px] px-4 text-sm font-medium"
                      disabled={submitting === item.id}
                      onClick={() => handlePassFail(item, "fail")}
                    >
                      FAIL
                    </Button>
                  </div>
                ) : (
                  <ChevronRight className={cn(
                    "h-4 w-4 text-white/30 transition-transform flex-shrink-0",
                    isExpanded && "rotate-90"
                  )} />
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                  {/* Full specification */}
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Specification</p>
                    <p className="text-white font-medium">{item.specification}</p>
                    {item.specValueLow != null && item.specValueHigh != null && (
                      <p className="text-white/60 text-sm mt-1">
                        Range: {item.specValueLow} – {item.specValueHigh} {item.specUnit}
                        {item.specValueLowMetric != null && (
                          <span className="text-white/40">
                            {" "}({item.specValueLowMetric} – {item.specValueHighMetric} {item.specUnitMetric})
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Tools required */}
                  {item.toolsRequired.length > 0 && (
                    <p className="text-white/40 text-xs">
                      Tools: {item.toolsRequired.join(", ")}
                    </p>
                  )}

                  {/* Check/repair references */}
                  {(item.checkReference || item.repairReference) && (
                    <div className="flex gap-2">
                      {item.checkReference && (
                        <span className="text-amber-400 text-xs bg-amber-400/10 px-2 py-1 rounded">
                          ⚠ {item.checkReference}
                        </span>
                      )}
                      {item.repairReference && (
                        <span className="text-amber-400 text-xs bg-amber-400/10 px-2 py-1 rounded">
                          ⚠ {item.repairReference}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {item.notes && (
                    <p className="text-white/50 text-xs italic">{item.notes}</p>
                  )}

                  {/* Captured value display */}
                  {progress?.measurement && (
                    <div className={cn(
                      "rounded-lg p-3 border",
                      progress.measurement.inTolerance === false
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-green-500/10 border-green-500/30"
                    )}>
                      <p className="text-white font-mono text-lg">
                        {progress.measurement.value} {progress.measurement.unit}
                      </p>
                      <p className={cn(
                        "text-sm",
                        progress.measurement.inTolerance === false ? "text-red-400" : "text-green-400"
                      )}>
                        {progress.measurement.inTolerance === false ? "OUT OF SPEC" : "IN SPEC"}
                      </p>
                    </div>
                  )}

                  {/* Manual entry — opens numeric keypad */}
                  {status === "pending" && !isPassFail && !isReadOnly && (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 h-14 text-lg bg-blue-600 hover:bg-blue-700"
                        onClick={() => { setKeypadItemId(item.id); setKeypadValue(""); }}
                        disabled={submitting === item.id}
                      >
                        Enter Value
                      </Button>
                      <Button
                        variant="outline"
                        className="h-14 border-white/20 text-white/50 hover:text-white"
                        onClick={() => handleSkip(item)}
                        disabled={submitting === item.id}
                      >
                        <SkipForward className="h-4 w-4 mr-1" /> Skip
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="text-white/30 text-center py-8">No items in this section</p>
        )}
      </div>

      {/* Numeric keypad overlay */}
      {keypadItem && (
        <>
          {/* Backdrop to prevent accidental dismissal */}
          <div className="fixed inset-0 bg-black/50 z-20" />
          <NumericKeypad
            value={keypadValue}
            onChange={setKeypadValue}
            onDone={() => handleNumericSubmit(keypadItem)}
            unit={keypadItem.specUnit}
            specLow={keypadItem.specValueLow}
            specHigh={keypadItem.specValueHigh}
          />
        </>
      )}

      {/* Spacer when keypad is open to prevent content being hidden behind it */}
      {keypadItemId && <div className="h-[400px]" />}
    </div>
  );
}
