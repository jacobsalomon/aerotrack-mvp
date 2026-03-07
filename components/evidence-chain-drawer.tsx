"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Camera,
  ExternalLink,
  FileText,
  Gauge,
  Loader2,
  Mic,
  Sparkles,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface EvidenceChainEvidenceRecord {
  id: string;
  type: string;
  label: string;
  fileUrl: string | null;
  mimeType: string | null;
  capturedAt: string | null;
  transcriptText: string | null;
  structuredData: unknown | null;
}

export interface EvidenceChainSource {
  sourceType: string;
  sourceLabel: string;
  evidenceId: string | null;
  fileUrl: string | null;
  timestamp: number | null;
  excerpt: string | null;
  description: string | null;
  confidence: number;
  evidence: EvidenceChainEvidenceRecord | null;
}

export interface EvidenceChainDiscrepancy {
  field: string;
  description: string;
  values: Array<{
    source: string;
    value: string;
    confidence?: number;
  }>;
  resolution: string | null;
}

export interface EvidenceChainFieldData {
  field: string;
  value: unknown;
  sources: EvidenceChainSource[];
  corroborationLevel: "single" | "double" | "triple";
  overallConfidence: number;
  discrepancies: EvidenceChainDiscrepancy[];
}

export interface DocumentProvenancePayload {
  id: string;
  sourceModel: "capture_session" | "generated_document";
  documentType: string;
  title: string | null;
  fields: Record<string, unknown>;
  provenanceByField: Record<string, EvidenceChainFieldData>;
  discrepancies: EvidenceChainDiscrepancy[];
  verification: Record<string, unknown> | null;
  evidenceRecords: EvidenceChainEvidenceRecord[];
  sessionId?: string;
  componentId?: string;
  componentPartNumber?: string | null;
  componentSerialNumber?: string | null;
}

interface EvidenceChainDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  documentLabel?: string | null;
  fieldLabel?: string | null;
  fieldValue?: unknown;
  fieldData?: EvidenceChainFieldData | null;
}

function formatTimestamp(seconds: number | null): string | null {
  if (seconds === null || Number.isNaN(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function confidenceTone(score: number): string {
  if (score >= 0.9) return "text-green-700 bg-green-50 border-green-200";
  if (score >= 0.7) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function corroborationBadge(fieldData: EvidenceChainFieldData | null | undefined): {
  label: string;
  className: string;
} {
  const count = fieldData?.sources.length || 0;
  switch (fieldData?.corroborationLevel) {
    case "triple":
      return {
        label: `Verified by ${count || 3} sources`,
        className: "bg-green-100 text-green-800 border-green-200",
      };
    case "double":
      return {
        label: `${count || 2} sources`,
        className: "bg-blue-100 text-blue-800 border-blue-200",
      };
    default:
      return {
        label: `${Math.max(count, 1)} source`,
        className: "bg-amber-100 text-amber-800 border-amber-200",
      };
  }
}

function sourceAccent(sourceType: string): {
  icon: ReactNode;
  border: string;
} {
  switch (sourceType) {
    case "video":
      return { icon: <Video className="h-4 w-4" />, border: "border-l-blue-500" };
    case "audio":
      return { icon: <Mic className="h-4 w-4" />, border: "border-l-emerald-500" };
    case "photo":
      return { icon: <Camera className="h-4 w-4" />, border: "border-l-amber-500" };
    case "cmm":
      return { icon: <BookOpen className="h-4 w-4" />, border: "border-l-violet-500" };
    case "measurement":
      return { icon: <Gauge className="h-4 w-4" />, border: "border-l-cyan-500" };
    case "ai_inferred":
      return { icon: <Sparkles className="h-4 w-4" />, border: "border-l-slate-400" };
    default:
      return { icon: <FileText className="h-4 w-4" />, border: "border-l-slate-400" };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedExcerpt({
  text,
  highlight,
}: {
  text: string;
  highlight: string | null;
}) {
  if (!highlight || !text.toLowerCase().includes(highlight.toLowerCase())) {
    return <span>{text}</span>;
  }

  const matcher = new RegExp(`(${escapeRegExp(highlight)})`, "ig");
  const parts = text.split(matcher);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <strong key={`${part}-${index}`} className="font-semibold text-slate-900">
            {part}
          </strong>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

function renderStructuredData(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const objectValue = value as Record<string, unknown>;
  return Object.entries(objectValue)
    .slice(0, 3)
    .map(([key, entry]) => {
      if (entry && typeof entry === "object") {
        return `${key}: ${JSON.stringify(entry)}`;
      }
      return `${key}: ${String(entry)}`;
    })
    .join(" • ");
}

export function EvidenceChainDrawer({
  open,
  onOpenChange,
  loading = false,
  documentLabel,
  fieldLabel,
  fieldValue,
  fieldData,
}: EvidenceChainDrawerProps) {
  const badge = corroborationBadge(fieldData);
  const confidencePercent = Math.round((fieldData?.overallConfidence || 0) * 100);
  const discrepancy = fieldData?.discrepancies?.[0] || null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92vw] sm:max-w-xl p-0">
        <SheetHeader className="border-b border-slate-200 bg-slate-50 pr-12">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-left text-lg text-slate-950">
                {fieldLabel || "Evidence Chain"}
              </SheetTitle>
              <SheetDescription className="mt-1 text-left text-slate-600">
                {documentLabel || "Generated document"}{fieldValue ? ` • ${String(fieldValue)}` : ""}
              </SheetDescription>
            </div>
            {!loading && fieldData && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge className={`border ${badge.className}`}>{badge.label}</Badge>
                <Badge className={`border ${confidenceTone(fieldData.overallConfidence)}`}>
                  {confidencePercent}% confidence
                </Badge>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading provenance...
            </div>
          ) : !fieldData ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No provenance is available for this field.
            </div>
          ) : (
            <div className="space-y-4">
              {discrepancy && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    Discrepancy Detected
                  </div>
                  <p className="text-sm text-red-700">{discrepancy.description}</p>
                  {discrepancy.values.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {discrepancy.values.map((value, index) => (
                        <div
                          key={`${value.source}-${index}`}
                          className="rounded-lg border border-red-200 bg-white p-3 text-xs text-slate-700"
                        >
                          <p className="font-semibold text-slate-900">{value.source}</p>
                          <p className="mt-1">{value.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {discrepancy.resolution && (
                    <p className="mt-3 text-xs font-medium uppercase tracking-wide text-red-600">
                      {discrepancy.resolution}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {fieldData.sources.map((source, index) => {
                  const accent = sourceAccent(source.sourceType);
                  const imageUrl =
                    source.fileUrl &&
                    (source.fileUrl.match(/\.(png|jpe?g|gif|webp)$/i) ||
                      source.evidence?.mimeType?.startsWith("image/"))
                      ? source.fileUrl
                      : null;

                  return (
                    <div
                      key={`${source.sourceType}-${source.evidenceId || index}`}
                      className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${accent.border}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 p-2 text-slate-600">
                            {accent.icon}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {source.sourceLabel}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              {source.timestamp !== null && (
                                <span>at {formatTimestamp(source.timestamp)}</span>
                              )}
                              {source.evidence?.capturedAt && (
                                <span>{new Date(source.evidence.capturedAt).toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge className={`border ${confidenceTone(source.confidence)}`}>
                          {Math.round(source.confidence * 100)}%
                        </Badge>
                      </div>

                      {imageUrl && (
                        <a
                          href={imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 block overflow-hidden rounded-lg border border-slate-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageUrl}
                            alt={source.description || source.sourceLabel}
                            className="h-32 w-full object-cover"
                          />
                        </a>
                      )}

                      {(source.excerpt || source.description) && (
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                          <HighlightedExcerpt
                            text={source.excerpt || source.description || ""}
                            highlight={typeof fieldValue === "string" ? fieldValue : null}
                          />
                        </p>
                      )}

                      {!source.excerpt && !source.description && source.evidence?.transcriptText && (
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                          <HighlightedExcerpt
                            text={source.evidence.transcriptText}
                            highlight={typeof fieldValue === "string" ? fieldValue : null}
                          />
                        </p>
                      )}

                      {source.evidence?.structuredData != null && (
                        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                          {renderStructuredData(source.evidence.structuredData)}
                        </p>
                      )}

                      {(source.fileUrl || source.evidence?.fileUrl) && (
                        <div className="mt-3">
                          <a
                            href={source.fileUrl || source.evidence?.fileUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open evidence
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
