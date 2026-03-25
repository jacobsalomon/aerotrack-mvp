"use client";

// Sticky progress bar at top of inspection workspace
// Shows: completion percentage, item counts, problems, config variant, review button
// WO# is editable inline — click to edit, Enter/blur to save

import { ReactNode, useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Camera, Eye, Lock, Pencil } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

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
  componentInfo: { partNumber: string; serialNumber: string; description: string } | null;
  isReadOnly: boolean;
  unassignedCount: number;
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
  componentInfo,
  isReadOnly,
  unassignedCount,
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
    <div className="sticky top-0 z-20 bg-zinc-900 border-b border-white/10 px-4 py-3">
      {/* Top row: component info + template */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 min-w-0">
          {componentInfo && (
            <span className="text-white/70 text-sm truncate">
              {componentInfo.description} · P/N: {componentInfo.partNumber} · S/N: {componentInfo.serialNumber}
            </span>
          )}
          <span className="text-white/40 text-xs truncate hidden sm:inline">
            {templateTitle}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {recorderSlot}
          {searchSlot}
          {isReadOnly && (
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 text-xs">
              <Lock className="h-3 w-3 mr-1" /> Signed Off
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={onReview} className="border-white/20 text-white/70 hover:text-white">
            <Eye className="h-4 w-4 mr-1" /> Review
          </Button>
        </div>
      </div>

      {/* Progress row */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Progress value={pct} className="h-2 bg-white/10" />
        </div>
        <div className="flex items-center gap-3 text-sm flex-shrink-0">
          <span className="text-white font-medium">
            {completedCount} / {summary.total}
            <span className="text-white/40 ml-1">({pct}%)</span>
          </span>
          {summary.problem > 0 && (
            <span className="text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {summary.problem + summary.findings} problems
            </span>
          )}
          {configVariant && (
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 text-xs">
              {configVariant}
            </Badge>
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
              className="flex items-center gap-1 text-white/30 text-xs hover:text-white/60 transition-colors"
              title={isReadOnly ? "Signed off — cannot edit" : "Click to edit work order"}
            >
              {savedWo || "Add WO#"}
              {!isReadOnly && <Pencil className="h-2.5 w-2.5" />}
            </button>
          )}

          {!!photoCount && photoCount > 0 && (
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 text-xs">
              <Camera className="h-3 w-3 mr-1" /> {photoCount}
            </Badge>
          )}
          {unassignedCount > 0 && (
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-300 text-xs animate-pulse">
              {unassignedCount} unassigned
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
