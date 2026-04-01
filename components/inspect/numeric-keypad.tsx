"use client";

// Custom numeric keypad for gloved tablet use
// 72px buttons, bottom ~40% of screen, suppresses native keyboard
// Supports: digits 0-9, decimal, +/-, backspace, Done
// Unit toggle: convert between imperial/metric units with value safety

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Delete, ArrowLeftRight } from "lucide-react";

// Conversion factors: multiply imperial value by factor to get metric
const CONVERSION_MAP: Record<string, { metric: string; factor: number }> = {
  "LB-IN": { metric: "N-m", factor: 0.113 },
  "N-m": { metric: "LB-IN", factor: 1 / 0.113 },
  "IN": { metric: "mm", factor: 25.4 },
  "mm": { metric: "IN", factor: 1 / 25.4 },
  "LB": { metric: "N", factor: 4.448 },
  "N": { metric: "LB", factor: 1 / 4.448 },
  "FT-LB": { metric: "N-m", factor: 1.356 },
  "PSI": { metric: "kPa", factor: 6.895 },
  "kPa": { metric: "PSI", factor: 1 / 6.895 },
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  unit: string | null;
  specLow: number | null;
  specHigh: number | null;
  // Optional: parent provides explicit metric values (bypass factor calculation)
  unitMetric?: string;
  specLowMetric?: number;
  specHighMetric?: number;
}

export default function NumericKeypad({ value, onChange, onDone, unit, specLow, specHigh, unitMetric, specLowMetric, specHighMetric }: Props) {
  // Track whether the user is currently viewing/entering in the alternate unit
  const [showingAltUnit, setShowingAltUnit] = useState(false);

  // Determine if unit conversion is available
  const primaryUnit = unit?.toUpperCase() || "";
  const conversion = CONVERSION_MAP[primaryUnit];
  // If the parent provides explicit metric info, use that; otherwise use the conversion map
  const hasAltUnit = !!(unitMetric || conversion);
  const altUnitLabel = unitMetric || conversion?.metric || "";
  const conversionFactor = conversion?.factor ?? (unitMetric ? null : null);

  // Currently active unit and spec range (depends on toggle state)
  const activeUnit = showingAltUnit ? altUnitLabel : (unit || "");
  const activeSpecLow = showingAltUnit
    ? (specLowMetric ?? (specLow != null && conversionFactor != null ? parseFloat((specLow * conversionFactor).toFixed(4)) : null))
    : specLow;
  const activeSpecHigh = showingAltUnit
    ? (specHighMetric ?? (specHigh != null && conversionFactor != null ? parseFloat((specHigh * conversionFactor).toFixed(4)) : null))
    : specHigh;

  // The other unit (for secondary display)
  const secondaryUnit = showingAltUnit ? (unit || "") : altUnitLabel;

  // Tolerance indicator color based on current active spec range
  const numVal = parseFloat(value);
  let toleranceColor = "bg-zinc-800"; // neutral when empty or no spec
  if (value && !isNaN(numVal) && activeSpecLow != null && activeSpecHigh != null) {
    if (numVal >= activeSpecLow && numVal <= activeSpecHigh) {
      toleranceColor = "bg-green-900/50 border-green-500/30";
    } else if (numVal >= activeSpecLow * 0.95 && numVal <= activeSpecHigh * 1.05) {
      toleranceColor = "bg-yellow-900/50 border-yellow-500/30"; // near boundary
    } else {
      toleranceColor = "bg-red-900/50 border-red-500/30";
    }
  }

  // Convert a value string between units
  function convertValue(val: string, toAlt: boolean): string {
    const parsed = parseFloat(val);
    if (!val || isNaN(parsed)) return val; // keep empty/invalid as-is

    if (unitMetric && specLow != null && specHigh != null && specLowMetric != null && specHighMetric != null) {
      // Use explicit metric values to derive ratio
      const ratio = (specHighMetric - specLowMetric) / (specHigh - specLow);
      if (toAlt) {
        return parseFloat((parsed * ratio).toFixed(4)).toString();
      } else {
        return parseFloat((parsed / ratio).toFixed(4)).toString();
      }
    }

    if (!conversionFactor) return val;

    if (toAlt) {
      return parseFloat((parsed * conversionFactor).toFixed(4)).toString();
    } else {
      return parseFloat((parsed / conversionFactor).toFixed(4)).toString();
    }
  }

  // Toggle between primary and alt unit — converts the entered value
  function handleUnitToggle() {
    if (!hasAltUnit) return;
    const newShowingAlt = !showingAltUnit;
    const convertedValue = convertValue(value, newShowingAlt);
    onChange(convertedValue);
    setShowingAltUnit(newShowingAlt);
  }

  // Wrap onDone: if showing alt unit, convert back to primary before submitting
  function handleDone() {
    if (showingAltUnit) {
      const primaryValue = convertValue(value, false);
      onChange(primaryValue);
      // Use setTimeout to let state propagate before calling onDone
      setTimeout(() => onDone(), 0);
    } else {
      onDone();
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
        <div className="flex items-baseline gap-1.5 ml-2">
          <span className="text-white/50 text-lg">{activeUnit}</span>
          {hasAltUnit && secondaryUnit && (
            <span className="text-white/25 text-sm">({secondaryUnit})</span>
          )}
        </div>
      </div>

      {/* Spec range hint + unit toggle button */}
      <div className="flex items-center justify-center gap-3 mb-2">
        {activeSpecLow != null && activeSpecHigh != null && (
          <p className="text-white/30 text-xs">
            Spec: {activeSpecLow} – {activeSpecHigh} {activeUnit}
          </p>
        )}
        {hasAltUnit && (
          <button
            onClick={handleUnitToggle}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-400/10 rounded px-2 py-1 transition-colors"
            title={`Switch to ${secondaryUnit}`}
          >
            <ArrowLeftRight className="h-3 w-3" />
            {secondaryUnit}
          </button>
        )}
      </div>

      {/* Keypad grid */}
      <div className="px-3 pb-3 space-y-2">
        {keys.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-2">
            {row.map((key) => {
              if (key === "done") {
                return (
                  <button
                    key={key}
                    onClick={handleDone}
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
