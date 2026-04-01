"use client";

// MeasurementToast — shows extracted measurements at the bottom of the inspection
// workspace with Accept/Reassign/Dismiss actions. Stacks max 3 toasts, auto-dismisses
// after 30 seconds if not acted on.

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, ArrowRightLeft, X, Glasses } from "lucide-react";
import type { MatchResult } from "@/lib/inspect/match-measurement-to-item";

export interface MeasurementSuggestion {
  id: string; // unique ID for this suggestion
  value: number;
  unit: string;
  match: MatchResult | null; // null = no match found
  source: "audio" | "glasses";
  createdAt: number; // Date.now()
}

// Items available for reassignment — passed from the parent workspace
export interface ReassignableItem {
  id: string;
  itemCallout: string | null;
  parameterName: string;
}

interface Props {
  suggestions: MeasurementSuggestion[];
  reassignableItems?: ReassignableItem[];
  onAccept: (suggestion: MeasurementSuggestion) => void;
  onReassign: (suggestion: MeasurementSuggestion, targetItemId: string) => void;
  onDismiss: (suggestionId: string) => void;
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 30_000;

export default function MeasurementToast({
  suggestions,
  reassignableItems = [],
  onAccept,
  onReassign,
  onDismiss,
}: Props) {
  // Track which suggestion currently has the reassign dropdown open
  const [reassignOpenId, setReassignOpenId] = useState<string | null>(null);

  // Auto-dismiss timer — check every second and remove expired toasts
  useEffect(() => {
    if (suggestions.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      for (const s of suggestions) {
        if (now - s.createdAt > AUTO_DISMISS_MS) {
          onDismiss(s.id);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [suggestions, onDismiss]);

  // Show most recent first, capped at MAX_VISIBLE
  const visible = suggestions.slice(-MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col gap-2 w-full max-w-lg px-4">
      {visible.map((s) => (
        <div
          key={s.id}
          className="bg-zinc-800 border border-white/10 rounded-lg px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2"
        >
          <div className="flex items-center gap-3">
            {/* Source indicator */}
            {s.source === "glasses" && (
              <Glasses className="h-4 w-4 text-blue-400 shrink-0" />
            )}

            {/* Measurement value and match info */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">
                Detected: {s.value} {s.unit}
              </p>
              {s.match ? (
                <p className="text-white/50 text-xs truncate">
                  Best match: {s.match.itemCallout ? `#${s.match.itemCallout} ` : ""}
                  {s.match.parameterName}
                </p>
              ) : (
                <p className="text-white/40 text-xs">No item match</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {s.match ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAccept(s)}
                    className="h-7 px-2 text-green-400 hover:text-green-300 hover:bg-green-400/10"
                    title="Accept"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    <span className="text-xs">Accept</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setReassignOpenId(reassignOpenId === s.id ? null : s.id)}
                    className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                    title="Reassign to different item"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                    <span className="text-xs">Reassign</span>
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReassignOpenId(reassignOpenId === s.id ? null : s.id)}
                  className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                  title="Assign to an item"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                  <span className="text-xs">Assign</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(s.id)}
                className="h-7 w-7 p-0 text-white/30 hover:text-white/60"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Inline reassign dropdown — shown when Reassign/Assign is clicked */}
          {reassignOpenId === s.id && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <select
                autoFocus
                className="w-full text-sm bg-zinc-700 border border-white/20 rounded px-2 py-1.5 text-white"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    onReassign(s, e.target.value);
                    setReassignOpenId(null);
                  }
                }}
                onBlur={() => setReassignOpenId(null)}
              >
                <option value="" disabled>Select item...</option>
                {reassignableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemCallout ? `#${item.itemCallout} ` : ""}{item.parameterName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
