"use client";

// Floating button that jumps to the next pending inspection item.
// Shows the callout number of the next item. Hidden when all items are done.

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { progressKey } from "@/lib/inspect/cmm-config";

interface InspectionItem {
  id: string;
  itemCallout: string | null;
  parameterName: string;
  sortOrder: number;
  instanceCount: number;
}

interface Section {
  id: string;
  sortOrder: number;
  items: InspectionItem[];
}

interface Props {
  // All sections with their items (filtered by config variant already)
  sections: Section[];
  activeSectionId: string;
  // Progress map: itemId → status string
  progressMap: Map<string, { status: string }>;
  // Called when the button is tapped — switches section if needed
  onNavigate: (sectionId: string, itemId: string) => void;
  disabled?: boolean;
}

export default function NextItemButton({
  sections,
  activeSectionId,
  progressMap,
  onNavigate,
  disabled,
}: Props) {
  // Find the next pending item, starting from the active section
  function findNextPending(): { sectionId: string; item: InspectionItem } | null {
    // Sort sections by sortOrder
    const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
    const activeIdx = sorted.findIndex((s) => s.id === activeSectionId);
    if (activeIdx === -1) return null;

    // Check active section first, then wrap around
    for (let offset = 0; offset < sorted.length; offset++) {
      const idx = (activeIdx + offset) % sorted.length;
      const section = sorted[idx];

      for (const item of [...section.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
        // Check all instances — item is "next" if any instance is pending
        const count = item.instanceCount || 1;
        for (let i = 0; i < count; i++) {
          const progress = progressMap.get(progressKey(item.id, i));
          if (!progress || progress.status === "pending") {
            return { sectionId: section.id, item };
          }
        }
      }
    }
    return null;
  }

  const next = findNextPending();

  // All done — hide the button
  if (!next) return null;

  const label = next.item.itemCallout
    ? `Next: #${next.item.itemCallout}`
    : "Next item";

  return (
    <Button
      onClick={() => onNavigate(next.sectionId, next.item.id)}
      disabled={disabled}
      className="fixed bottom-6 right-6 z-30 h-16 px-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 text-lg font-medium"
    >
      <ChevronDown className="h-5 w-5 mr-1" />
      {label}
    </Button>
  );
}
