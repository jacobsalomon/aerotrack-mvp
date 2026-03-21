"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import ItemEditor from "./item-editor";
import AddItemForm from "./add-item-form";
import { toast } from "sonner";

export interface InspectionItemData {
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
  specialAssemblyRef: string | null;
  configurationApplicability: string[];
  notes: string | null;
  confidence: number;
  sortOrder: number;
}

// Item type display labels and colors
const ITEM_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  torque_spec: { label: "Torque", color: "bg-blue-100 text-blue-700" },
  dimension_check: { label: "Dimension", color: "bg-purple-100 text-purple-700" },
  dimensional_spec: { label: "Dimension", color: "bg-purple-100 text-purple-700" },
  visual_check: { label: "Visual", color: "bg-green-100 text-green-700" },
  procedural_check: { label: "Procedure", color: "bg-teal-100 text-teal-700" },
  safety_wire: { label: "Safety Wire", color: "bg-orange-100 text-orange-700" },
  tool_requirement: { label: "Tool", color: "bg-slate-100 text-slate-700" },
  matched_set: { label: "Matched Set", color: "bg-pink-100 text-pink-700" },
  general_note: { label: "Note", color: "bg-slate-100 text-slate-500" },
  replace_if_disturbed: { label: "Replace If Disturbed", color: "bg-red-100 text-red-700" },
};

interface ItemListProps {
  items: InspectionItemData[];
  templateId: string;
  sectionId: string;
  isAdmin: boolean;
  onItemsChanged: () => void;
}

export default function ItemList({
  items,
  templateId,
  sectionId,
  isAdmin,
  onItemsChanged,
}: ItemListProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(
    Object.keys(ITEM_TYPE_LABELS)
  ));

  // Group items by type
  const groupedItems = new Map<string, InspectionItemData[]>();
  for (const item of items) {
    const group = groupedItems.get(item.itemType) || [];
    group.push(item);
    groupedItems.set(item.itemType, group);
  }

  function toggleType(type: string) {
    const next = new Set(expandedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setExpandedTypes(next);
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Delete this item?")) return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const res = await fetch(
      `${basePath}/api/library/${templateId}/sections/${sectionId}/items`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId }),
      }
    );

    if (res.ok) {
      toast.success("Item deleted");
      onItemsChanged();
    } else {
      toast.error("Failed to delete item");
    }
  }

  const lowConfidenceCount = items.filter((i) => i.confidence < 0.7).length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-slate-500 px-1">
        <span>{items.length} items</span>
        {lowConfidenceCount > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            {lowConfidenceCount} need review
          </span>
        )}
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Item
          </Button>
        )}
      </div>

      {/* Add item form */}
      {showAddForm && (
        <AddItemForm
          templateId={templateId}
          sectionId={sectionId}
          onSaved={() => {
            setShowAddForm(false);
            onItemsChanged();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Grouped items */}
      {Array.from(groupedItems.entries()).map(([type, typeItems]) => {
        const typeInfo = ITEM_TYPE_LABELS[type] || {
          label: type,
          color: "bg-slate-100 text-slate-600",
        };
        const expanded = expandedTypes.has(type);

        return (
          <div key={type} className="border border-slate-100 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleType(type)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              )}
              <Badge className={`text-[10px] ${typeInfo.color} border-0`}>
                {typeInfo.label}
              </Badge>
              <span className="text-xs text-slate-400">
                {typeItems.length}
              </span>
            </button>

            {expanded && (
              <div className="divide-y divide-slate-50">
                {typeItems.map((item) => (
                  <div key={item.id}>
                    {editingItemId === item.id ? (
                      <ItemEditor
                        item={item}
                        templateId={templateId}
                        sectionId={sectionId}
                        onSaved={() => {
                          setEditingItemId(null);
                          onItemsChanged();
                        }}
                        onCancel={() => setEditingItemId(null)}
                      />
                    ) : (
                      <div
                        className={`px-3 py-2.5 group ${
                          item.confidence < 0.7
                            ? "border-l-2 border-l-amber-400 bg-amber-50/30"
                            : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {/* Callout number */}
                          {item.itemCallout && (
                            <span className="shrink-0 text-[10px] font-mono bg-slate-200 text-slate-600 rounded px-1.5 py-0.5 mt-0.5">
                              {item.itemCallout}
                            </span>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">
                              {item.parameterName}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5 font-mono">
                              {item.specification}
                            </p>

                            {/* Tools */}
                            {item.toolsRequired.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <Wrench className="h-3 w-3 text-slate-400" />
                                {item.toolsRequired.map((tool) => (
                                  <span
                                    key={tool}
                                    className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded"
                                  >
                                    {tool}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* References */}
                            {(item.checkReference || item.repairReference) && (
                              <p className="text-[10px] text-slate-400 mt-1">
                                {item.checkReference && `Ref: ${item.checkReference}`}
                                {item.checkReference && item.repairReference && " · "}
                                {item.repairReference && `Repair: ${item.repairReference}`}
                              </p>
                            )}

                            {/* Notes */}
                            {item.notes && (
                              <p className="text-[10px] text-amber-600 mt-1 italic">
                                {item.notes}
                              </p>
                            )}
                          </div>

                          {/* Confidence + actions */}
                          <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.confidence < 0.7 && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            )}
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => setEditingItemId(item.id)}
                                  className="p-1 hover:bg-slate-100 rounded"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-slate-400" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-1 hover:bg-red-50 rounded"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
