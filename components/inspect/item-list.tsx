"use client";

// Inspection item list within the active section
// Shows items with progressive disclosure: collapsed → status dot + callout + name
// Expanded → full spec, value entry, pass/fail buttons, notes

import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Camera, Check, ChevronDown, ChevronRight, Image as ImageIcon, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import InspectionStatusIndicator from "./inspection-status-indicator";
import NumericKeypad from "./numeric-keypad";
import PhotoUpload from "./photo-upload";
import PhotoThumbnails from "./photo-thumbnails";
import type { PhotoEvidence } from "./photo-types";

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
  instanceCount: number;
  instanceLabels: string[];
}

interface ProgressRecord {
  inspectionItemId: string;
  instanceIndex: number;
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

import { progressKey } from "@/lib/inspect/cmm-config";

interface Props {
  items: InspectionItem[];
  progressMap: Map<string, ProgressRecord>;
  photoMap: Map<string, PhotoEvidence[]>;
  sessionId: string;
  isReadOnly: boolean;
  isOffline?: boolean;
  onItemCompleted: (itemId: string, status: string, result: string | null, measurement: ProgressRecord["measurement"], instanceIndex?: number) => void;
  onPhotoUploaded: (photo: PhotoEvidence) => void;
  referenceImageUrls: string[];
  targetItemId?: string | null;
  onTargetItemHandled?: () => void;
  autoAcceptedItemIds?: Set<string>;
}

export default function ItemList({
  items,
  progressMap,
  photoMap,
  sessionId,
  isReadOnly,
  isOffline,
  onItemCompleted,
  onPhotoUploaded,
  referenceImageUrls,
  targetItemId,
  onTargetItemHandled,
  autoAcceptedItemIds,
}: Props) {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [keypadItemId, setKeypadItemId] = useState<string | null>(null);
  const [keypadValue, setKeypadValue] = useState("");

  useEffect(() => {
    if (!targetItemId) return;
    setExpandedId(targetItemId);
    const timer = setTimeout(() => {
      const el = itemRefs.current.get(targetItemId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      onTargetItemHandled?.();
    }, 100);
    return () => clearTimeout(timer);
  }, [targetItemId, onTargetItemHandled]);

  // Track which instance the keypad is for
  const [keypadInstanceIndex, setKeypadInstanceIndex] = useState(0);

  // Pass/fail items can be completed with one tap
  const isPassFailType = (type: string) =>
    ["visual_check", "procedural_check", "safety_wire"].includes(type);

  // Handle pass/fail for simple items
  async function handlePassFail(item: InspectionItem, result: "pass" | "fail", instanceIndex = 0) {
    if (isReadOnly) return;
    setSubmitting(`${item.id}:${instanceIndex}`);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/items/${item.id}/complete`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, instanceIndex }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onItemCompleted(item.id, data.data.progressStatus, data.data.progressResult, null, instanceIndex);
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

    const instanceIndex = keypadInstanceIndex;
    setSubmitting(`${item.id}:${instanceIndex}`);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/items/${item.id}/complete`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: numericValue,
          unit: item.specUnit || "units",
          instanceIndex,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onItemCompleted(item.id, data.data.progressStatus, data.data.progressResult, data.data.measurement, instanceIndex);
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
  async function handleSkip(item: InspectionItem, instanceIndex = 0) {
    if (isReadOnly) return;
    const reason = prompt("Reason for skipping this item:");
    if (!reason) return;

    setSubmitting(`${item.id}:${instanceIndex}`);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/items/${item.id}/skip`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, instanceIndex }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onItemCompleted(item.id, "skipped", "not_applicable", null, instanceIndex);
      }
    } catch (err) {
      console.error("Skip error:", err);
    } finally {
      setSubmitting(null);
    }
  }

  // Find the item the keypad is open for
  const keypadItem = keypadItemId ? items.find((i) => i.id === keypadItemId) : null;

  // Helper: get instance label for a multi-instance item
  function instanceLabel(item: InspectionItem, idx: number): string {
    if (item.instanceLabels.length > idx) return item.instanceLabels[idx];
    return `${item.parameterName} #${idx + 1}`;
  }

  // Helper: count completed instances for a multi-instance item
  function completedInstances(item: InspectionItem): number {
    let count = 0;
    for (let i = 0; i < item.instanceCount; i++) {
      const p = progressMap.get(progressKey(item.id, i));
      if (p && p.status !== "pending") count++;
    }
    return count;
  }

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
          const isMulti = item.instanceCount > 1;
          const isExpanded = expandedId === item.id;
          const isPassFail = isPassFailType(item.itemType);

          // ─── Multi-instance item: expandable group ─────────────────
          if (isMulti) {
            const doneCount = completedInstances(item);
            const groupDone = doneCount >= item.instanceCount;

            return (
              <div key={item.id} ref={(el) => { if (el) itemRefs.current.set(item.id, el); }} className={cn("bg-white/5 rounded-lg border border-white/10 transition-colors duration-500", autoAcceptedItemIds?.has(item.id) && "ring-2 ring-green-400/50 bg-green-400/10")}>
                {/* Group header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left"
                >
                  <InspectionStatusIndicator status={groupDone ? "done" : doneCount > 0 ? "in_progress" : "pending"} size="sm" />

                  {item.itemCallout && (
                    <span className="text-white/40 text-xs font-mono w-10 flex-shrink-0">
                      #{item.itemCallout}
                    </span>
                  )}

                  <span className={cn(
                    "flex-1 text-sm",
                    groupDone ? "text-white/50" : "text-white"
                  )}>
                    {item.parameterName}
                    <span className="text-white/40 ml-2 text-xs">
                      ({doneCount}/{item.instanceCount} measured)
                    </span>
                  </span>

                  {/* Required photo indicator for visual check items */}
                  {item.itemType === "visual_check" && (
                    (photoMap.get(item.id)?.length || 0) > 0 ? (
                      <span className="text-green-400 flex items-center" title="Photo attached">
                        <Camera className="h-3.5 w-3.5" />
                        <Check className="h-2.5 w-2.5 -ml-0.5" />
                      </span>
                    ) : (
                      <span className="relative text-white/30 flex items-center" title="Photo required">
                        <Camera className="h-3.5 w-3.5" />
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
                      </span>
                    )
                  )}

                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-white/30 flex-shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-white/30 flex-shrink-0" />
                  }
                </button>

                {/* Expanded: spec info + instance sub-rows */}
                {isExpanded && (
                  <div className="border-t border-white/5">
                    {/* Specification (shared across all instances) */}
                    <div className="px-4 py-3">
                      <div className="bg-white/5 rounded-lg p-3 mb-2">
                        <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Specification</p>
                        <p className="text-white font-medium">{item.specification}</p>
                        {item.specValueLow != null && item.specValueHigh != null && (
                          <p className="text-white/60 text-sm mt-1">
                            Range: {item.specValueLow} – {item.specValueHigh} {item.specUnit}
                          </p>
                        )}
                      </div>
                      {item.notes && <p className="text-white/50 text-xs italic mb-2">{item.notes}</p>}

                      {/* Photo evidence: upload + thumbnails (shared across instances) */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {!isReadOnly && !isOffline && (
                            <PhotoUpload
                              sessionId={sessionId}
                              inspectionItemId={item.id}
                              onPhotoUploaded={onPhotoUploaded}
                            />
                          )}
                          {(photoMap.get(item.id)?.length || 0) > 0 && (
                            <span className="text-white/30 text-xs">
                              {photoMap.get(item.id)!.length} photo{photoMap.get(item.id)!.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <PhotoThumbnails photos={photoMap.get(item.id) || []} />
                      </div>
                    </div>

                    {/* Instance sub-rows */}
                    <div className="px-2 pb-2 space-y-1">
                      {Array.from({ length: item.instanceCount }, (_, idx) => {
                        const instProgress = progressMap.get(progressKey(item.id, idx));
                        const instStatus = instProgress?.status || "pending";
                        const instSubmitting = submitting === `${item.id}:${idx}`;

                        return (
                          <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-md bg-white/[0.03]">
                            <InspectionStatusIndicator status={instStatus} size="sm" />
                            <span className={cn(
                              "flex-1 text-sm",
                              instStatus === "done" ? "text-white/50" : "text-white"
                            )}>
                              {instanceLabel(item, idx)}
                            </span>

                            {/* Show captured value */}
                            {instProgress?.measurement && (
                              <span className={cn(
                                "text-sm font-mono flex-shrink-0",
                                instProgress.measurement.inTolerance === false ? "text-red-400" : "text-green-400"
                              )}>
                                {instProgress.measurement.value} {instProgress.measurement.unit}
                              </span>
                            )}

                            {/* Action buttons for pending instances */}
                            {instStatus === "pending" && !isReadOnly && !isOffline && (
                              <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                {isPassFail ? (
                                  <>
                                    <Button size="sm" className="bg-green-600 hover:bg-green-700 h-9 px-3 text-xs" disabled={instSubmitting} onClick={() => handlePassFail(item, "pass", idx)}>
                                      PASS
                                    </Button>
                                    <Button size="sm" className="bg-red-600 hover:bg-red-700 h-9 px-3 text-xs" disabled={instSubmitting} onClick={() => handlePassFail(item, "fail", idx)}>
                                      FAIL
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-11 px-3 text-sm" disabled={instSubmitting} onClick={() => { setKeypadItemId(item.id); setKeypadInstanceIndex(idx); setKeypadValue(""); }}>
                                      Enter
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-11 px-3 bg-transparent border-white/20 text-white/50 text-sm" disabled={instSubmitting} onClick={() => handleSkip(item, idx)}>
                                      <SkipForward className="h-3.5 w-3.5 mr-1" /> Skip
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // ─── Single-instance item (original rendering) ─────────────
          const progress = progressMap.get(progressKey(item.id, 0));
          const status = progress?.status || "pending";

          return (
            <div key={item.id} ref={(el) => { if (el) itemRefs.current.set(item.id, el); }} className={cn("bg-white/5 rounded-lg border border-white/10 transition-colors duration-500", autoAcceptedItemIds?.has(item.id) && "ring-2 ring-green-400/50 bg-green-400/10")}>
              {/* Collapsed row — always visible */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left"
              >
                <InspectionStatusIndicator status={status} size="sm" />

                {item.itemCallout && (
                  <span className="text-white/60 text-sm font-mono w-10 flex-shrink-0">
                    #{item.itemCallout}
                  </span>
                )}

                <span className={cn(
                  "flex-1 text-base truncate",
                  status === "done" ? "text-white/50" : "text-white"
                )}>
                  {item.parameterName}
                </span>

                {/* Required photo indicator for visual check items */}
                {item.itemType === "visual_check" && (
                  (photoMap.get(item.id)?.length || 0) > 0 ? (
                    <span className="text-green-400 flex items-center" title="Photo attached">
                      <Camera className="h-3.5 w-3.5" />
                      <Check className="h-2.5 w-2.5 -ml-0.5" />
                    </span>
                  ) : (
                    <span className="relative text-white/30 flex items-center" title="Photo required">
                      <Camera className="h-3.5 w-3.5" />
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
                    </span>
                  )
                )}

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
                {isPassFail && status === "pending" && !isReadOnly && !isOffline ? (
                  <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 h-[44px] px-4 text-sm font-medium"
                      disabled={submitting === `${item.id}:0`}
                      onClick={() => handlePassFail(item, "pass", 0)}
                    >
                      PASS
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 h-[44px] px-4 text-sm font-medium"
                      disabled={submitting === `${item.id}:0`}
                      onClick={() => handlePassFail(item, "fail", 0)}
                    >
                      FAIL
                    </Button>
                  </div>
                ) : (
                  <ChevronRight className={cn(
                    "h-4 w-4 text-white/50 transition-transform flex-shrink-0",
                    isExpanded && "rotate-90"
                  )} />
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                  {/* Full specification */}
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-white/60 text-sm uppercase tracking-wide mb-1">Specification</p>
                    <p className="text-white font-medium text-lg">{item.specification}</p>
                    {item.specValueLow != null && item.specValueHigh != null && (
                      <p className="text-white/70 text-base mt-1">
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
                    <p className="text-white/60 text-sm">
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
                    <p className="text-white/70 text-sm italic">{item.notes}</p>
                  )}

                  {/* Photo evidence: upload button + thumbnails */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {!isReadOnly && !isOffline && (
                        <PhotoUpload
                          sessionId={sessionId}
                          inspectionItemId={item.id}
                          instanceIndex={0}
                          onPhotoUploaded={onPhotoUploaded}
                        />
                      )}
                      {(photoMap.get(item.id)?.length || 0) > 0 && (
                        <span className="text-white/60 text-sm">
                          {photoMap.get(item.id)!.length} photo{photoMap.get(item.id)!.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <PhotoThumbnails photos={photoMap.get(item.id) || []} />
                  </div>

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
                  {status === "pending" && !isPassFail && !isReadOnly && !isOffline && (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 h-14 text-lg bg-blue-600 hover:bg-blue-700"
                        onClick={() => { setKeypadItemId(item.id); setKeypadInstanceIndex(0); setKeypadValue(""); }}
                        disabled={submitting === `${item.id}:0`}
                      >
                        {item.specValueLow != null && item.specValueHigh != null ? "Enter Value" : "Mark Done"}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-14 bg-transparent border-white/20 text-white/50 hover:text-white"
                        onClick={() => handleSkip(item, 0)}
                        disabled={submitting === `${item.id}:0`}
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
