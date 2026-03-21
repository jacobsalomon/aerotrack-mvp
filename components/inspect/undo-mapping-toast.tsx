"use client";

// Undo last auto-mapping button — appears for 5 seconds after auto-map
// One tap to undo: removes mapping and moves measurement to unassigned

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

interface UndoAction {
  sessionId: string;
  itemId: string;
  parameterName: string;
}

interface Props {
  action: UndoAction | null;
  onUndo: () => void;
}

export default function UndoMappingToast({ action, onUndo }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!action) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [action]);

  async function handleUndo() {
    if (!action) return;
    try {
      await fetch(apiUrl(`/api/inspect/sessions/${action.sessionId}/items/${action.itemId}/mapping`), {
        method: "DELETE",
      });
      onUndo();
    } catch (err) {
      console.error("Undo error:", err);
    }
    setVisible(false);
  }

  if (!visible || !action) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-zinc-800 border border-white/20 rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl">
      <span className="text-white text-sm">
        Mapped to <span className="font-medium">{action.parameterName}</span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="border-white/30 text-white hover:bg-white/10"
        onClick={handleUndo}
      >
        <Undo2 className="h-4 w-4 mr-1" /> Undo
      </Button>
    </div>
  );
}
