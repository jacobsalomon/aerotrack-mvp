"use client";

// Unassigned measurements drawer
// Shows badge with count, opens drawer with measurement list + assignment dropdowns

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { X, AlertCircle } from "lucide-react";

interface UnassignedMeasurement {
  id: string;
  value: number;
  unit: string;
  parameterName: string;
  measurementType: string;
  createdAt: string;
  sources: { sourceType: string; rawExcerpt: string | null }[];
}

interface PendingItem {
  id: string;
  parameterName: string;
  itemCallout: string | null;
  specValueLow: number | null;
  specValueHigh: number | null;
  specUnit: string | null;
}

interface Props {
  sessionId: string;
  isReadOnly: boolean;
  onAssigned: () => void;
}

export default function UnassignedDrawer({ sessionId, isReadOnly, onAssigned }: Props) {
  const [measurements, setMeasurements] = useState<UnassignedMeasurement[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  // Fetch unassigned measurements
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}`));
        const data = await res.json();
        if (res.ok && data.success) {
          setMeasurements(data.data.unassignedMeasurements || []);
          // Collect all pending items from all sections
          const items: PendingItem[] = [];
          const progress = data.data.session.inspectionProgress || [];
          const pendingIds = new Set(
            progress.filter((p: { status: string }) => p.status === "pending").map((p: { inspectionItemId: string }) => p.inspectionItemId)
          );
          for (const section of data.data.session.inspectionTemplate?.sections || []) {
            for (const item of section.items) {
              if (pendingIds.has(item.id)) {
                items.push({
                  id: item.id,
                  parameterName: item.parameterName,
                  itemCallout: item.itemCallout,
                  specValueLow: item.specValueLow,
                  specValueHigh: item.specValueHigh,
                  specUnit: item.specUnit,
                });
              }
            }
          }
          setPendingItems(items);
        }
      } catch {
        // Non-critical
      }
    }
    if (open) load();
  }, [sessionId, open]);

  async function handleAssign(measurementId: string, inspectionItemId: string) {
    setAssigning(measurementId);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/assign`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurementId, inspectionItemId }),
      });
      if (res.ok) {
        setMeasurements((prev) => prev.filter((m) => m.id !== measurementId));
        onAssigned();
      }
    } catch {
      // Error handling
    } finally {
      setAssigning(null);
    }
  }

  if (measurements.length === 0 && !open) return null;

  return (
    <>
      {/* Floating badge */}
      {!open && measurements.length > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-30 bg-amber-500 text-black px-4 py-2 rounded-full font-medium text-sm shadow-lg hover:bg-amber-400 transition-colors animate-pulse"
        >
          <AlertCircle className="h-4 w-4 inline mr-1" />
          {measurements.length} unassigned
        </button>
      )}

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-zinc-900 border-l border-white/10 overflow-y-auto">
            <div className="sticky top-0 bg-zinc-900 border-b border-white/10 px-4 py-3 flex items-center justify-between">
              <h2 className="text-white font-medium">Unassigned Measurements ({measurements.length})</h2>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-3">
              {measurements.map((m) => (
                <div key={m.id} className="bg-white/5 rounded-lg border border-white/10 p-3 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-white font-mono text-lg">{m.value} {m.unit}</span>
                    <span className="text-white/30 text-xs">
                      {m.sources[0]?.sourceType || "unknown"}
                    </span>
                  </div>
                  <p className="text-white/50 text-sm">{m.parameterName}</p>
                  {m.sources[0]?.rawExcerpt && (
                    <p className="text-white/30 text-xs italic truncate">&ldquo;{m.sources[0].rawExcerpt}&rdquo;</p>
                  )}
                  <p className="text-white/30 text-xs">{new Date(m.createdAt).toLocaleTimeString()}</p>

                  {/* Assignment dropdown */}
                  {!isReadOnly && (
                    <select
                      className="w-full bg-zinc-800 border border-white/10 rounded px-3 py-2 text-white text-sm mt-2"
                      onChange={(e) => {
                        if (e.target.value) handleAssign(m.id, e.target.value);
                      }}
                      disabled={assigning === m.id}
                      defaultValue=""
                    >
                      <option value="" disabled>Assign to...</option>
                      {pendingItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.itemCallout ? `#${item.itemCallout} ` : ""}{item.parameterName}
                          {item.specValueLow != null ? ` (${item.specValueLow}-${item.specValueHigh} ${item.specUnit})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

              {measurements.length === 0 && (
                <p className="text-white/30 text-center py-8">All measurements have been assigned</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
