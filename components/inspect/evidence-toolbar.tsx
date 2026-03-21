"use client";

// Evidence capture toolbar for inspection workspace
// Camera, Microphone, Video buttons — reuses existing capture infrastructure

import { Button } from "@/components/ui/button";
import { Camera, Mic, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  isReadOnly: boolean;
  keypadOpen: boolean;
  onCapture?: (type: "photo" | "audio" | "video") => void;
}

export default function EvidenceToolbar({ isReadOnly, keypadOpen, onCapture }: Props) {
  if (isReadOnly) return null;

  return (
    <div className={cn(
      "fixed left-0 right-0 z-10 flex items-center justify-center gap-4 p-3 bg-zinc-900/90 border-t border-white/10",
      keypadOpen ? "bottom-[420px]" : "bottom-0 pb-safe"
    )}>
      <Button
        variant="outline"
        size="lg"
        className="h-14 w-14 rounded-full border-white/20 text-white/70 hover:text-white hover:bg-white/10"
        onClick={() => onCapture?.("photo")}
      >
        <Camera className="h-6 w-6" />
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="h-14 w-14 rounded-full border-white/20 text-white/70 hover:text-white hover:bg-white/10"
        onClick={() => onCapture?.("audio")}
      >
        <Mic className="h-6 w-6" />
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="h-14 w-14 rounded-full border-white/20 text-white/70 hover:text-white hover:bg-white/10"
        onClick={() => onCapture?.("video")}
      >
        <Video className="h-6 w-6" />
      </Button>
    </div>
  );
}
