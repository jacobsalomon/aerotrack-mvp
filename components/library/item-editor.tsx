"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { InspectionItemData } from "./item-list";

interface ItemEditorProps {
  item: InspectionItemData;
  templateId: string;
  sectionId: string;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ItemEditor({
  item,
  templateId,
  sectionId,
  onSaved,
  onCancel,
}: ItemEditorProps) {
  const [saving, setSaving] = useState(false);
  const [parameterName, setParameterName] = useState(item.parameterName);
  const [specification, setSpecification] = useState(item.specification);
  const [specValueLow, setSpecValueLow] = useState(item.specValueLow?.toString() ?? "");
  const [specValueHigh, setSpecValueHigh] = useState(item.specValueHigh?.toString() ?? "");
  const [specUnit, setSpecUnit] = useState(item.specUnit ?? "");
  const [specValueLowMetric, setSpecValueLowMetric] = useState(item.specValueLowMetric?.toString() ?? "");
  const [specValueHighMetric, setSpecValueHighMetric] = useState(item.specValueHighMetric?.toString() ?? "");
  const [specUnitMetric, setSpecUnitMetric] = useState(item.specUnitMetric ?? "");
  const [toolsRequired, setToolsRequired] = useState(item.toolsRequired.join(", "));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [itemType, setItemType] = useState(item.itemType);

  async function handleSave() {
    setSaving(true);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    const res = await fetch(
      `${basePath}/api/library/${templateId}/sections/${sectionId}/items`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          parameterName,
          specification,
          specValueLow: specValueLow ? parseFloat(specValueLow) : null,
          specValueHigh: specValueHigh ? parseFloat(specValueHigh) : null,
          specUnit: specUnit || null,
          specValueLowMetric: specValueLowMetric ? parseFloat(specValueLowMetric) : null,
          specValueHighMetric: specValueHighMetric ? parseFloat(specValueHighMetric) : null,
          specUnitMetric: specUnitMetric || null,
          toolsRequired: toolsRequired.split(",").map((s) => s.trim()).filter(Boolean),
          notes: notes || null,
          itemType,
        }),
      }
    );

    if (res.ok) {
      toast.success("Item updated");
      onSaved();
    } else {
      toast.error("Failed to update item");
    }
    setSaving(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div className="px-3 py-3 bg-blue-50/50 border-l-2 border-l-blue-400" onKeyDown={handleKeyDown}>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Label className="text-[10px] text-slate-500">Parameter Name</Label>
          <Input
            value={parameterName}
            onChange={(e) => setParameterName(e.target.value)}
            className="h-7 text-sm"
            autoFocus
          />
        </div>
        <div className="col-span-2">
          <Label className="text-[10px] text-slate-500">Specification</Label>
          <Input
            value={specification}
            onChange={(e) => setSpecification(e.target.value)}
            className="h-7 text-sm font-mono"
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">Low Value</Label>
          <Input
            value={specValueLow}
            onChange={(e) => setSpecValueLow(e.target.value)}
            className="h-7 text-sm"
            type="number"
            step="any"
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">High Value</Label>
          <Input
            value={specValueHigh}
            onChange={(e) => setSpecValueHigh(e.target.value)}
            className="h-7 text-sm"
            type="number"
            step="any"
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">Unit</Label>
          <Input
            value={specUnit}
            onChange={(e) => setSpecUnit(e.target.value)}
            className="h-7 text-sm"
            placeholder="LB-IN"
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">Type</Label>
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            className="w-full h-7 text-sm rounded-md border border-slate-200 px-2"
          >
            <option value="torque_spec">Torque Spec</option>
            <option value="dimension_check">Dimension Check</option>
            <option value="dimensional_spec">Dimensional Spec</option>
            <option value="visual_check">Visual Check</option>
            <option value="procedural_check">Procedural Check</option>
            <option value="safety_wire">Safety Wire</option>
            <option value="tool_requirement">Tool Requirement</option>
            <option value="matched_set">Matched Set</option>
            <option value="general_note">General Note</option>
            <option value="replace_if_disturbed">Replace If Disturbed</option>
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">Low (Metric)</Label>
          <Input
            value={specValueLowMetric}
            onChange={(e) => setSpecValueLowMetric(e.target.value)}
            className="h-7 text-sm"
            type="number"
            step="any"
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">High (Metric)</Label>
          <Input
            value={specValueHighMetric}
            onChange={(e) => setSpecValueHighMetric(e.target.value)}
            className="h-7 text-sm"
            type="number"
            step="any"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-[10px] text-slate-500">Metric Unit</Label>
          <Input
            value={specUnitMetric}
            onChange={(e) => setSpecUnitMetric(e.target.value)}
            className="h-7 text-sm"
            placeholder="N-m"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-[10px] text-slate-500">Tools Required (comma-separated)</Label>
          <Input
            value={toolsRequired}
            onChange={(e) => setToolsRequired(e.target.value)}
            className="h-7 text-sm font-mono"
            placeholder="AGE10037, BLS-34347"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-[10px] text-slate-500">Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-7 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
