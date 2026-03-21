"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AddItemFormProps {
  templateId: string;
  sectionId: string;
  onSaved: () => void;
  onCancel: () => void;
}

export default function AddItemForm({
  templateId,
  sectionId,
  onSaved,
  onCancel,
}: AddItemFormProps) {
  const [saving, setSaving] = useState(false);
  const [parameterName, setParameterName] = useState("");
  const [specification, setSpecification] = useState("");
  const [itemType, setItemType] = useState("torque_spec");
  const [itemCallout, setItemCallout] = useState("");

  async function handleSave() {
    if (!parameterName.trim()) {
      toast.error("Parameter name is required");
      return;
    }

    setSaving(true);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    const res = await fetch(
      `${basePath}/api/library/${templateId}/sections/${sectionId}/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parameterName: parameterName.trim(),
          specification: specification.trim(),
          itemType,
          itemCallout: itemCallout.trim() || null,
        }),
      }
    );

    if (res.ok) {
      toast.success("Item added");
      onSaved();
    } else {
      toast.error("Failed to add item");
    }
    setSaving(false);
  }

  return (
    <div className="border border-emerald-200 rounded-lg px-3 py-3 bg-emerald-50/30">
      <p className="text-xs font-medium text-emerald-700 mb-2">Add New Item</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Label className="text-[10px] text-slate-500">Parameter Name</Label>
          <Input
            value={parameterName}
            onChange={(e) => setParameterName(e.target.value)}
            className="h-7 text-sm"
            placeholder="e.g., End Housing Bolt Torque"
            autoFocus
          />
        </div>
        <div className="col-span-2">
          <Label className="text-[10px] text-slate-500">Specification</Label>
          <Input
            value={specification}
            onChange={(e) => setSpecification(e.target.value)}
            className="h-7 text-sm font-mono"
            placeholder="e.g., 51-56 LB-IN (5.8-6.3 N-m)"
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
          <Label className="text-[10px] text-slate-500">Callout #</Label>
          <Input
            value={itemCallout}
            onChange={(e) => setItemCallout(e.target.value)}
            className="h-7 text-sm"
            placeholder="e.g., 290"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Add
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
