"use client";

// Full-screen green border flash — the "magic moment" when a measurement auto-maps
// Visible in peripheral vision, no focus required. 300ms duration.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  trigger: number; // increment to flash
}

export default function GreenFlash({ trigger }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger <= 0) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 300);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 pointer-events-none",
        "border-[6px] border-green-500 rounded-lg",
        "animate-in fade-in duration-100"
      )}
    />
  );
}
