"use client";

// Add Finding form — minimal capture for non-routine discoveries
// Camera opens immediately, one-line description, severity defaults to "major"

import { useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, X, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  sessionId: string;
  sectionId: string;
  itemId?: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddFindingForm({ sessionId, sectionId, itemId, onClose, onCreated }: Props) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("major");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/findings`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          severity,
          inspectionSectionId: sectionId,
          inspectionItemId: itemId || null,
          photoUrls: [],
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      }
    } catch {
      // Error handling
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 rounded-t-2xl border-t border-white/10 p-4 space-y-4 pb-safe">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Add Finding
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Camera button */}
        <Button variant="outline" className="w-full h-14 border-white/20 text-white/70">
          <Camera className="h-5 w-5 mr-2" /> Capture Photo
        </Button>

        {/* Description */}
        <Input
          placeholder="Describe the finding..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-14 text-lg"
          autoFocus
        />

        {/* Severity */}
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minor">Minor</SelectItem>
            <SelectItem value="major">Major (default)</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        {/* Submit */}
        <Button
          className="w-full h-14 bg-amber-600 hover:bg-amber-700 text-lg font-medium"
          onClick={handleSubmit}
          disabled={!description.trim() || submitting}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Finding"}
        </Button>
      </div>
    </div>
  );
}
