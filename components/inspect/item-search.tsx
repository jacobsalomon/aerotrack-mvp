"use client";

// Search bar for inspection items — filters by callout number or parameter name.
// Results span all sections. Tapping a result switches to that section and item.

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import InspectionStatusIndicator from "./inspection-status-indicator";

interface InspectionItem {
  id: string;
  itemCallout: string | null;
  parameterName: string;
}

interface Section {
  id: string;
  title: string;
  figureNumber: string;
  items: InspectionItem[];
}

interface Props {
  sections: Section[];
  progressMap: Map<string, { status: string }>;
  onSelect: (sectionId: string, itemId: string) => void;
}

export default function ItemSearch({ sections, progressMap, onSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Build a flat list of all items with their section info
  const allItems = sections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionFigure: section.figureNumber,
    }))
  );

  // Filter by query (case-insensitive match on callout or parameter name)
  const q = query.toLowerCase().trim();
  const results = q
    ? allItems.filter(
        (item) =>
          (item.itemCallout && item.itemCallout.toLowerCase().includes(q)) ||
          item.parameterName.toLowerCase().includes(q)
      )
    : [];

  function handleSelect(sectionId: string, itemId: string) {
    onSelect(sectionId, itemId);
    setIsOpen(false);
    setQuery("");
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-white/40 hover:text-white/70 p-2"
        title="Search items"
      >
        <Search className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="relative">
      {/* Search input */}
      <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
        <Search className="h-4 w-4 text-white/40 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by callout # or name..."
          className="bg-transparent text-white text-sm outline-none flex-1 placeholder:text-white/30"
        />
        <button onClick={() => { setIsOpen(false); setQuery(""); }} className="text-white/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Results dropdown */}
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-white/10 rounded-lg shadow-xl max-h-64 overflow-y-auto z-50">
          {results.slice(0, 20).map((item) => {
            const progress = progressMap.get(item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.sectionId, item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 text-left border-b border-white/5 last:border-0"
              >
                <InspectionStatusIndicator status={progress?.status || "pending"} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-white text-sm truncate block">
                    {item.itemCallout && <span className="text-white/40 font-mono mr-2">#{item.itemCallout}</span>}
                    {item.parameterName}
                  </span>
                  <span className="text-white/30 text-xs">Fig {item.sectionFigure} — {item.sectionTitle}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No results message */}
      {q && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-white/10 rounded-lg p-3 text-white/40 text-sm text-center z-50">
          No items match &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
