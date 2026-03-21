"use client";

// Custom numeric keypad for gloved tablet use
// 72px buttons, bottom ~40% of screen, suppresses native keyboard
// Supports: digits 0-9, decimal, +/-, backspace, Done

import { cn } from "@/lib/utils";
import { Delete } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  unit: string | null;
  specLow: number | null;
  specHigh: number | null;
}

export default function NumericKeypad({ value, onChange, onDone, unit, specLow, specHigh }: Props) {
  // Tolerance indicator color
  const numVal = parseFloat(value);
  let toleranceColor = "bg-zinc-800"; // neutral when empty or no spec
  if (value && !isNaN(numVal) && specLow != null && specHigh != null) {
    if (numVal >= specLow && numVal <= specHigh) {
      toleranceColor = "bg-green-900/50 border-green-500/30";
    } else if (numVal >= specLow * 0.95 && numVal <= specHigh * 1.05) {
      toleranceColor = "bg-yellow-900/50 border-yellow-500/30"; // near boundary
    } else {
      toleranceColor = "bg-red-900/50 border-red-500/30";
    }
  }

  function handleKey(key: string) {
    switch (key) {
      case "backspace":
        onChange(value.slice(0, -1));
        break;
      case "+/-":
        if (value.startsWith("-")) {
          onChange(value.slice(1));
        } else if (value && value !== "0") {
          onChange("-" + value);
        }
        break;
      case ".":
        if (!value.includes(".")) {
          onChange(value ? value + "." : "0.");
        }
        break;
      default:
        // Digit
        onChange(value + key);
    }
  }

  const keys = [
    ["7", "8", "9", "backspace"],
    ["4", "5", "6", "+/-"],
    ["1", "2", "3", "."],
    ["0", "done"],
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-white/10 z-30 pb-safe">
      {/* Value display with tolerance indicator */}
      <div className={cn("mx-4 mt-3 mb-2 rounded-lg border p-3 flex items-baseline justify-between", toleranceColor)}>
        <span className="text-white text-3xl font-mono tabular-nums">
          {value || "0"}
        </span>
        {unit && (
          <span className="text-white/50 text-lg ml-2">{unit}</span>
        )}
      </div>

      {/* Spec range hint */}
      {specLow != null && specHigh != null && (
        <p className="text-white/30 text-xs text-center mb-2">
          Spec: {specLow} – {specHigh} {unit}
        </p>
      )}

      {/* Keypad grid */}
      <div className="px-3 pb-3 space-y-2">
        {keys.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-2">
            {row.map((key) => {
              if (key === "done") {
                return (
                  <button
                    key={key}
                    onClick={onDone}
                    disabled={!value || isNaN(parseFloat(value))}
                    className={cn(
                      "flex-[2] h-[72px] rounded-xl text-xl font-medium transition-colors",
                      value && !isNaN(parseFloat(value))
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-zinc-700 text-white/30 cursor-not-allowed"
                    )}
                  >
                    Done
                  </button>
                );
              }
              if (key === "backspace") {
                return (
                  <button
                    key={key}
                    onClick={() => handleKey(key)}
                    className="flex-1 h-[72px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-colors"
                  >
                    <Delete className="h-6 w-6" />
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  className="flex-1 h-[72px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-2xl font-medium transition-colors"
                >
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
