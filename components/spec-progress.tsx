"use client";

// Spec progress component — shows a checklist of expected measurements
// Green = captured, gray = remaining, red = out of tolerance

import { CheckCircle2, Circle, XCircle } from "lucide-react";

interface SpecProgressItem {
  parameterName: string;
  measurementType: string;
  unit: string;
  required?: boolean;
  index: number;
  captured: boolean;
  measurement: { status: string; inTolerance: boolean | null } | null;
}

interface SpecProgressProps {
  specName: string;
  totalRequired: number;
  capturedRequired: number;
  items: SpecProgressItem[];
}

export function SpecProgress({ specName, totalRequired, capturedRequired, items }: SpecProgressProps) {
  const percent = totalRequired > 0 ? Math.round((capturedRequired / totalRequired) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Header with progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-slate-700">{specName}</p>
          <p className="text-sm text-slate-500">
            {capturedRequired}/{totalRequired} required
          </p>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {items.map((item) => {
          const isOutOfTol = item.measurement?.inTolerance === false;
          return (
            <div
              key={item.index}
              className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${
                item.captured
                  ? isOutOfTol
                    ? "bg-red-50"
                    : "bg-green-50"
                  : ""
              }`}
            >
              {item.captured ? (
                isOutOfTol ? (
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                )
              ) : (
                <Circle className="h-4 w-4 text-slate-300 flex-shrink-0" />
              )}
              <span className={item.captured ? "text-slate-700" : "text-slate-400"}>
                {item.parameterName}
              </span>
              {item.required === false && (
                <span className="text-xs text-slate-400">(optional)</span>
              )}
              <span className="text-xs text-slate-400 ml-auto">{item.unit}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
