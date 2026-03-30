"use client";

// Sticky progress bar at top of inspection workspace
// Shows: completion percentage, item counts, problems, config variant, review button
// WO# is editable inline — click to edit, Enter/blur to save

import { ReactNode, useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Camera, Clock, Eye, Glasses, Lock, Pencil } from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import { getCmmAgeWarning } from "@/lib/inspect/cmm-config";

interface Props {
  summary: {
    total: number;
    done: number;
    problem: number;
    skipped: number;
    pending: number;
    findings: number;
  };
  configVariant: string | null;
  workOrderRef: string | null;
  sessionId: string;
  templateTitle: string;
  templateCreatedAt?: string | null;
  componentInfo: { partNumber: string; serialNumber: string; description: string } | null;
  isReadOnly: boolean;
  unassignedCount: number;
  glassesPaired: boolean;
  onPairGlasses?: () => void;
  onReview: () => void;
  searchSlot?: ReactNode;
  recorderSlot?: ReactNode;
  photoCount?: number;
}

export default function ProgressBar({
  summary,
  configVariant,
  workOrderRef,
  sessionId,
  templateTitle,
  templateCreatedAt,
  componentInfo,
  isReadOnly,
  unassignedCount,
  glassesPaired,
  onPairGlasses,
  onReview,
  searchSlot,
  recorderSlot,
  photoCount,
}: Props) {
  const completedCount = summary.done + summary.skipped;
  const pct = summary.total > 0 ? Math.round((completedCount / summary.total) * 100) : 0;

  // Editable WO# state
  const [editing, setEditing] = useState(false);
  const [woValue, setWoValue] = useState(workOrderRef || "");
  const [savedWo, setSavedWo] = useState(workOrderRef);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function saveWo() {
    setEditing(false);
    const trimmed = woValue.trim();
    if (trimmed === (savedWo || "")) return; // no change
    setSavedWo(trimmed || null);
    try {
      await fetch(apiUrl(`/api/inspect/sessions/${sessionId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderRef: trimmed || null }),
      });
    } catch { /* silent — will show stale value but not crash */ }
  }

  return (
    <div className="sticky top-0 z-20 bg-zinc-900 border-b border-white/10 px-4 py-2">
      {/* Single consolidated header row */}
      <div className="flex items-center justify-between gap-2">
        {/* Left side: component info, template, WO#, counts */}
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          {componentInfo && (
            <span className="text-white/70 text-sm truncate hidden md:inline">
              {componentInfo.description} · P/N: {componentInfo.partNumber}
            </span>
          )}

          {/* Editable WO# — click to type, Enter/blur to save */}
          {!isReadOnly && editing ? (
            <input
              ref={inputRef}
              value={woValue}
              onChange={(e) => setWoValue(e.target.value)}
              onBlur={() => void saveWo()}
              onKeyDown={(e) => { if (e.key === "Enter") void saveWo(); if (e.key === "Escape") { setEditing(false); setWoValue(savedWo || ""); } }}
              placeholder="WO#"
              className="bg-white/10 text-white/70 text-xs rounded px-2 py-0.5 w-28 outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-white/20"
            />
          ) : (
            <button
              onClick={() => !isReadOnly && setEditing(true)}
              className="flex items-center gap-1 text-white/30 text-xs hover:text-white/60 transition-colors flex-shrink-0"
              title={isReadOnly ? "Signed off — cannot edit" : "Click to edit work order"}
            >
              {savedWo || "Add WO#"}
              {!isReadOnly && <Pencil className="h-2.5 w-2.5" />}
            </button>
          )}

          {configVariant && (
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 text-xs flex-shrink-0">
              {configVariant}
            </Badge>
          )}

          {/* Completion count (replaces progress bar) */}
          <span className="text-white font-medium text-sm flex-shrink-0">
            {completedCount}/{summary.total}
            <span className="text-white/40 ml-1">({pct}%)</span>
          </span>

          {summary.problem > 0 && (
            <span className="text-red-400 flex items-center gap-1 text-xs flex-shrink-0">
              <AlertTriangle className="h-3 w-3" /> {summary.problem + summary.findings}
            </span>
          )}

          {!!photoCount && photoCount > 0 && (
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 text-xs flex-shrink-0">
              <Camera className="h-3 w-3 mr-1" /> {photoCount}
            </Badge>
          )}

          {unassignedCount > 0 && (
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-300 text-xs animate-pulse flex-shrink-0">
              {unassignedCount} unassigned
            </Badge>
          )}

          <span className="text-white/40 text-xs truncate hidden lg:inline">
            {templateTitle}
            {templateCreatedAt && (() => {
              const ageLevel = getCmmAgeWarning(templateCreatedAt);
              const dateStr = new Date(templateCreatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              return (
                <span className={`ml-2 inline-flex items-center gap-1 ${
                  ageLevel === "critical" ? "text-red-400" :
                  ageLevel === "warning" ? "text-amber-400" :
                  "text-white/30"
                }`}>
                  <Clock className="h-3 w-3" />
                  {dateStr}
                </span>
              );
            })()}
          </span>
        </div>

        {/* Right side: recorder, glasses, search, review */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {recorderSlot}
          {glassesPaired ? (
            <span className="flex items-center gap-1" title="Glasses connected">
              <Glasses className="h-4 w-4 text-green-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onPairGlasses}
              className="gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 h-7 text-xs"
            >
              <Glasses className="h-3.5 w-3.5" />
              Send to Glasses
            </Button>
          )}
          {searchSlot}
          {isReadOnly && (
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 text-xs">
              <Lock className="h-3 w-3 mr-1" /> Signed Off
            </Badge>
          )}
          <Button size="sm" variant="secondary" onClick={onReview}>
            <Eye className="h-4 w-4 mr-1" /> Review
          </Button>
        </div>
      </div>
    </div>
  );
}
