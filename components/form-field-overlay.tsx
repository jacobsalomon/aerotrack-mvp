"use client";

// Form Field Overlay — shows the org document's extracted fields during a capture session.
// Fields fill in as measurements arrive, so the mechanic sees what's been captured
// and what's still needed. Grouped by form section with a progress bar.

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api-url";
import { useSmartPoll, formatTimeSince } from "@/lib/use-smart-poll";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────

interface ExtractedFormField {
  fieldName: string;
  fieldType: string;
  currentValue: string;
  required: boolean;
  section: string;
}

interface FormFieldsResponse {
  fields: ExtractedFormField[];
  sections: string[];
  pageCount: number;
  documentTitle: string;
}

interface Measurement {
  id: string;
  parameterName: string;
  value: number;
  unit: string;
  measuredAt: string;
  updatedAt: string;
}

interface OrgDocument {
  id: string;
  title: string;
  fileUrl: string;
}

interface FormFieldOverlayProps {
  sessionId: string;
  orgDocument: OrgDocument;
}

// ── Measurement-to-field matching ─────────────────────────────────
// Normalize a string for fuzzy matching: lowercase, strip punctuation and units
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")   // strip punctuation
    .replace(/\b(inches|inch|in|mm|cm|ft|lbs|psi|nm|deg|fahrenheit|celsius)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Try to match a measurement's parameterName to a form field's fieldName.
// Returns the matched field name or null.
function findMatchingField(
  parameterName: string,
  fieldNames: string[]
): string | null {
  const normParam = normalize(parameterName);
  if (!normParam) return null;

  // Exact match after normalization
  for (const fn of fieldNames) {
    if (normalize(fn) === normParam) return fn;
  }

  // Containment: field name contains the parameter name or vice versa
  for (const fn of fieldNames) {
    const normField = normalize(fn);
    if (normField.includes(normParam) || normParam.includes(normField)) {
      return fn;
    }
  }

  return null;
}

// ── Component ────────────────────────────────────────────────────

export function FormFieldOverlay({ sessionId, orgDocument }: FormFieldOverlayProps) {
  const [formData, setFormData] = useState<FormFieldsResponse | null>(null);
  const [loadingFields, setLoadingFields] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const lastPoll = useRef<string | null>(null);

  // Track which fields were just filled (for pulse animation via CSS)
  const [justFilled, setJustFilled] = useState<Set<string>>(new Set());
  const prevFilledRef = useRef<Set<string>>(new Set());

  // Fetch the form field structure (once on mount)
  useEffect(() => {
    async function loadFields() {
      try {
        const res = await fetch(apiUrl(`/api/sessions/${sessionId}/form-fields`));
        if (!res.ok) throw new Error("Failed to load form fields");
        const data: FormFieldsResponse = await res.json();
        setFormData(data);
      } catch (err) {
        console.error("Form fields load error:", err);
        setFieldError("Could not load form fields");
      } finally {
        setLoadingFields(false);
      }
    }
    loadFields();
  }, [sessionId]);

  // Poll for measurements (same pattern as MeasurementFeed)
  const pollMeasurements = useCallback(async () => {
    const params = lastPoll.current ? `?since=${encodeURIComponent(lastPoll.current)}` : "";
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/measurements${params}`));
      const data = await res.json();
      if (data.success) {
        if (lastPoll.current && data.data.length > 0) {
          setMeasurements((prev) => {
            const map = new Map(prev.map((m: Measurement) => [m.id, m]));
            for (const m of data.data) map.set(m.id, m);
            return Array.from(map.values());
          });
        } else if (!lastPoll.current) {
          setMeasurements(data.data);
        }
        lastPoll.current = data.polledAt;
      }
    } catch (e) {
      console.error("Measurement poll error:", e);
    }
  }, [sessionId]);

  useEffect(() => {
    void pollMeasurements();
  }, [pollMeasurements]);

  const measurementPoll = useSmartPoll({
    pollFn: pollMeasurements,
    enabled: true,
    initialIntervalMs: 2000,
    maxIntervalMs: 30000,
    backoffFactor: 1.5,
    resetKey: measurements.length,
  });

  // Build the field-to-measurement mapping (memoized so it's stable across renders)
  const fieldValues = useMemo(() => {
    const map = new Map<string, { value: number; unit: string }>();
    if (formData) {
      const fieldNames = formData.fields.map((f) => f.fieldName);
      for (const m of measurements) {
        const match = findMatchingField(m.parameterName, fieldNames);
        if (match && !map.has(match)) {
          map.set(match, { value: m.value, unit: m.unit });
        }
      }
    }
    return map;
  }, [formData, measurements]);

  // Stable key for tracking when filled fields change
  const filledKey = useMemo(
    () => Array.from(fieldValues.keys()).sort().join(","),
    [fieldValues]
  );

  // Detect newly filled fields for the pulse animation
  useEffect(() => {
    const currentFilled = new Set(fieldValues.keys());
    const newlyFilled = new Set<string>();
    for (const key of currentFilled) {
      if (!prevFilledRef.current.has(key)) {
        newlyFilled.add(key);
      }
    }
    if (newlyFilled.size > 0) {
      setJustFilled(newlyFilled);
      const timer = setTimeout(() => setJustFilled(new Set()), 1500);
      prevFilledRef.current = currentFilled;
      return () => clearTimeout(timer);
    }
    prevFilledRef.current = currentFilled;
  }, [filledKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading state ──────────────────────────────────────────────
  if (loadingFields) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "rgb(156, 163, 175)" }} />
        <p className="text-xs mt-2" style={{ color: "rgb(156, 163, 175)" }}>
          Analyzing form structure...
        </p>
      </div>
    );
  }

  if (fieldError || !formData) {
    return (
      <div className="py-12 text-center">
        <FileText className="mx-auto h-8 w-8 mb-2" style={{ color: "rgb(209, 213, 219)" }} />
        <p className="text-sm" style={{ color: "rgb(107, 114, 128)" }}>
          {fieldError || "No form fields found"}
        </p>
      </div>
    );
  }

  // ── Group fields by section ────────────────────────────────────
  const bySection = new Map<string, ExtractedFormField[]>();
  for (const field of formData.fields) {
    const section = field.section || "General";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push(field);
  }

  // Use the sections array from the API for ordering (fall back to map keys)
  const orderedSections =
    formData.sections.length > 0
      ? formData.sections.filter((s) => bySection.has(s))
      : Array.from(bySection.keys());

  const totalFields = formData.fields.length;
  const filledCount = fieldValues.size;
  const progressPct = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header with doc title and "View Original" link */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium truncate" style={{ color: "rgb(107, 114, 128)" }}>
          {formData.documentTitle || orgDocument.title}
        </p>
        <a
          href={orgDocument.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs shrink-0 hover:underline"
          style={{ color: "rgb(59, 130, 246)" }}
        >
          View Original PDF
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Live update indicator */}
      <div className="flex items-center justify-end gap-1.5 text-xs pb-2" style={{ color: "rgb(156, 163, 175)" }}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
        <span>Updated {formatTimeSince(measurementPoll.secondsSinceUpdate)}</span>
      </div>

      {/* Scrollable field list grouped by section */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {orderedSections.map((sectionName) => {
          const fields = bySection.get(sectionName) || [];
          return (
            <div key={sectionName}>
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: "rgb(107, 114, 128)" }}
              >
                {sectionName}
              </p>
              <div className="space-y-1.5">
                {fields.map((field) => {
                  const matched = fieldValues.get(field.fieldName);
                  const isFilled = !!matched;
                  const isJustFilled = justFilled.has(field.fieldName);

                  return (
                    <div
                      key={field.fieldName}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all duration-300"
                      style={{
                        backgroundColor: isJustFilled
                          ? "rgba(34, 197, 94, 0.15)"    // brief green pulse
                          : isFilled
                            ? "rgba(34, 197, 94, 0.06)"  // subtle green tint
                            : "rgb(249, 250, 251)",       // neutral gray
                        border: isFilled
                          ? "1px solid rgba(34, 197, 94, 0.25)"
                          : "1px dashed rgb(229, 231, 235)",
                      }}
                    >
                      {/* Status icon */}
                      {isFilled ? (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0"
                          style={{ color: "rgb(34, 197, 94)" }}
                        />
                      ) : (
                        <Circle
                          className="h-4 w-4 shrink-0"
                          style={{ color: "rgb(209, 213, 219)" }}
                        />
                      )}

                      {/* Field name and value */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs font-medium truncate"
                          style={{ color: isFilled ? "rgb(17, 24, 39)" : "rgb(156, 163, 175)" }}
                        >
                          {field.fieldName}
                          {field.required && (
                            <span style={{ color: "rgb(239, 68, 68)" }}> *</span>
                          )}
                        </p>
                        {isFilled && matched && (
                          <p
                            className="text-xs mt-0.5 font-semibold"
                            style={{ color: "rgb(21, 128, 61)" }}
                          >
                            {matched.value} {matched.unit}
                          </p>
                        )}
                      </div>

                      {/* Field type badge */}
                      <span
                        className="text-[10px] shrink-0 rounded px-1.5 py-0.5"
                        style={{
                          backgroundColor: "rgb(243, 244, 246)",
                          color: "rgb(156, 163, 175)",
                        }}
                      >
                        {field.fieldType}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar pinned at the bottom */}
      <div className="pt-3 mt-3 border-t" style={{ borderColor: "rgb(243, 244, 246)" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" style={{ color: "rgb(107, 114, 128)" }}>
            {filledCount} of {totalFields} fields filled
          </span>
          <span className="text-xs font-semibold" style={{ color: "rgb(17, 24, 39)" }}>
            {progressPct}%
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: "rgb(243, 244, 246)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              backgroundColor: progressPct === 100 ? "rgb(34, 197, 94)" : "rgb(59, 130, 246)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
