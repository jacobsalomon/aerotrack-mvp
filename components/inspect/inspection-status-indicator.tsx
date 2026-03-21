"use client";

// Three visual states: empty circle (NOT DONE), green check (DONE/OK), red X (PROBLEM), gray slash (skipped)

import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  status: string; // pending, done, problem, skipped
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-10 h-10",
};

const iconSizeMap = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export default function InspectionStatusIndicator({ status, size = "md", className }: Props) {
  const sizeClass = sizeMap[size];
  const iconSize = iconSizeMap[size];

  switch (status) {
    case "done":
      return (
        <div className={cn("rounded-full bg-green-500 flex items-center justify-center", sizeClass, className)}>
          <Check className={cn("text-white", iconSize)} strokeWidth={3} />
        </div>
      );
    case "problem":
      return (
        <div className={cn("rounded-full bg-red-500 flex items-center justify-center", sizeClass, className)}>
          <X className={cn("text-white", iconSize)} strokeWidth={3} />
        </div>
      );
    case "skipped":
      return (
        <div className={cn("rounded-full bg-zinc-600 flex items-center justify-center", sizeClass, className)}>
          <Minus className={cn("text-white", iconSize)} strokeWidth={3} />
        </div>
      );
    default: // pending
      return (
        <div className={cn("rounded-full border-2 border-zinc-600", sizeClass, className)} />
      );
  }
}
