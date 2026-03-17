import { prisma } from "@/lib/db";
import { safeParseJson } from "@/lib/utils";

type RawJson = Record<string, unknown>;

export interface ProvenanceEvidenceRecord {
  id: string;
  type: string;
  label: string;
  fileUrl: string | null;
  mimeType: string | null;
  capturedAt: string | null;
  transcriptText: string | null;
  structuredData: unknown | null;
  metadata?: Record<string, unknown>;
}

export interface ProvenanceSource {
  sourceType: string;
  sourceLabel: string;
  evidenceId: string | null;
  fileUrl: string | null;
  timestamp: number | null;
  excerpt: string | null;
  description: string | null;
  confidence: number;
  evidence: ProvenanceEvidenceRecord | null;
}

export interface FieldDiscrepancy {
  field: string;
  description: string;
  values: Array<{
    source: string;
    value: string;
    confidence?: number;
  }>;
  resolution: string | null;
}

export interface FieldProvenance {
  field: string;
  value: unknown;
  sources: ProvenanceSource[];
  corroborationLevel: "single" | "double" | "triple";
  overallConfidence: number;
  discrepancies: FieldDiscrepancy[];
}

export interface DocumentProvenanceResponse {
  id: string;
  sourceModel: "capture_session" | "generated_document";
  documentType: string;
  title: string | null;
  fields: Record<string, unknown>;
  provenanceByField: Record<string, FieldProvenance>;
  discrepancies: FieldDiscrepancy[];
  verification: Record<string, unknown> | null;
  evidenceRecords: ProvenanceEvidenceRecord[];
  sessionId?: string;
  componentId?: string;
  componentPartNumber?: string | null;
  componentSerialNumber?: string | null;
}

type EvidenceRecord = {
  id: string;
  type: string;
  fileUrl: string | null;
  mimeType: string | null;
  capturedAt: string | null;
  transcriptText: string | null;
  structuredData: unknown | null;
  metadata?: Record<string, unknown>;
};

type EvidenceLookup = {
  exact: Map<string, EvidenceRecord>;
  aliases: Map<string, EvidenceRecord>;
  byType: Map<string, EvidenceRecord[]>;
};

function clampScore(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeCorroborationLevel(
  value: unknown,
  sources: ProvenanceSource[]
): "single" | "double" | "triple" {
  if (value === "single" || value === "double" || value === "triple") return value;

  const distinctSources = new Set(sources.map((source) => source.sourceType)).size;
  if (distinctSources >= 3) return "triple";
  if (distinctSources === 2) return "double";
  return "single";
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSourceType(value: unknown): string {
  if (typeof value !== "string") return "unknown";

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "photo":
    case "photo_extraction":
    case "image":
      return "photo";
    case "audio":
    case "audio_transcript":
    case "voice_note":
    case "voice":
      return "audio";
    case "video":
    case "video_analysis":
    case "video_annotation":
      return "video";
    case "cmm":
    case "cmm_reference":
      return "cmm";
    case "measurement":
      return "measurement";
    case "document_scan":
    case "scan":
      return "document_scan";
    case "ai_generated":
    case "ai_inferred":
      return "ai_inferred";
    default:
      return normalized;
  }
}

function sourceLabelForType(sourceType: string): string {
  switch (sourceType) {
    case "photo":
      return "Photo OCR";
    case "audio":
      return "Audio Transcript";
    case "video":
      return "Video Analysis";
    case "cmm":
      return "CMM Reference";
    case "measurement":
      return "Measurement";
    case "document_scan":
      return "Document Scan";
    case "ai_inferred":
      return "AI Inferred";
    default:
      return titleCase(sourceType);
  }
}

function evidenceLabelForType(type: string): string {
  switch (type) {
    case "PHOTO":
    case "photo":
      return "Photo";
    case "VIDEO":
    case "video":
      return "Video";
    case "AUDIO_CHUNK":
    case "voice_note":
    case "audio":
      return "Audio";
    case "measurement":
      return "Measurement";
    case "document_scan":
      return "Document Scan";
    default:
      return titleCase(type);
  }
}

function canonicalizeEvidence(
  evidence: EvidenceRecord | null,
  fallbackId: string | null
): ProvenanceEvidenceRecord | null {
  if (!evidence && !fallbackId) return null;
  if (!evidence) {
    return {
      id: fallbackId as string,
      type: "unknown",
      label: "Unknown",
      fileUrl: null,
      mimeType: null,
      capturedAt: null,
      transcriptText: null,
      structuredData: null,
    };
  }

  return {
    id: evidence.id,
    type: evidence.type,
    label: evidenceLabelForType(evidence.type),
    fileUrl: evidence.fileUrl,
    mimeType: evidence.mimeType,
    capturedAt: evidence.capturedAt,
    transcriptText: evidence.transcriptText,
    structuredData: evidence.structuredData,
    metadata: evidence.metadata,
  };
}

function addAlias(
  map: Map<string, EvidenceRecord>,
  alias: string | null | undefined,
  evidence: EvidenceRecord
): void {
  if (!alias) return;
  map.set(alias.toLowerCase(), evidence);
}

function buildEvidenceLookup(evidenceRecords: EvidenceRecord[]): EvidenceLookup {
  const exact = new Map<string, EvidenceRecord>();
  const aliases = new Map<string, EvidenceRecord>();
  const byType = new Map<string, EvidenceRecord[]>();

  for (const evidence of evidenceRecords) {
    exact.set(evidence.id, evidence);

    const normalizedType = normalizeSourceType(evidence.type);
    const existingByType = byType.get(normalizedType) || [];
    existingByType.push(evidence);
    byType.set(normalizedType, existingByType);

    addAlias(aliases, evidence.id, evidence);
    addAlias(aliases, `${normalizedType}_${existingByType.length}`, evidence);
    addAlias(aliases, `${normalizedType}-${existingByType.length}`, evidence);

    if (normalizedType === "audio") {
      addAlias(aliases, `voice_${existingByType.length}`, evidence);
    }
    if (normalizedType === "document_scan") {
      addAlias(aliases, `scan_${existingByType.length}`, evidence);
      addAlias(aliases, `document_${existingByType.length}`, evidence);
    }
  }

  return { exact, aliases, byType };
}

function resolveEvidenceRecord(
  lookup: EvidenceLookup,
  sourceType: string,
  evidenceId: string | null
): EvidenceRecord | null {
  if (evidenceId) {
    const exact = lookup.exact.get(evidenceId);
    if (exact) return exact;

    const alias = lookup.aliases.get(evidenceId.toLowerCase());
    if (alias) return alias;
  }

  const matches = lookup.byType.get(sourceType);
  if (matches && matches.length > 0) return matches[0];

  if (sourceType === "photo") {
    return lookup.byType.get("document_scan")?.[0] || null;
  }

  return null;
}

function normalizeDiscrepancy(
  field: string,
  rawDiscrepancy: unknown
): FieldDiscrepancy | null {
  if (!rawDiscrepancy || typeof rawDiscrepancy !== "object") return null;

  const discrepancy = rawDiscrepancy as RawJson;
  const values = Array.isArray(discrepancy.values)
    ? discrepancy.values
        .filter((value): value is RawJson => !!value && typeof value === "object")
        .map((value) => ({
          source:
            typeof value.sourceType === "string"
              ? value.sourceType
              : typeof value.source === "string"
              ? value.source
              : "unknown",
          value: value.value === undefined || value.value === null ? "" : String(value.value),
          confidence:
            typeof value.confidence === "number" ? clampScore(value.confidence) : undefined,
        }))
    : [
        discrepancy.sourceA,
        discrepancy.sourceB,
      ]
        .filter((value): value is RawJson => !!value && typeof value === "object")
        .map((value) => ({
          source:
            typeof value.source === "string"
              ? value.source
              : typeof value.type === "string"
              ? value.type
              : "unknown",
          value: value.value === undefined || value.value === null ? "" : String(value.value),
          confidence:
            typeof value.confidence === "number" ? clampScore(value.confidence) : undefined,
        }));

  return {
    field:
      typeof discrepancy.field === "string" && discrepancy.field.trim()
        ? discrepancy.field
        : field,
    description:
      typeof discrepancy.description === "string"
        ? discrepancy.description
        : `Discrepancy detected for ${field}`,
    values,
    resolution:
      typeof discrepancy.resolution === "string" ? discrepancy.resolution : null,
  };
}

function normalizeSource(
  rawSource: unknown,
  lookup: EvidenceLookup
): ProvenanceSource | null {
  if (!rawSource || typeof rawSource !== "object") return null;

  const source = rawSource as RawJson;
  const sourceType = normalizeSourceType(source.sourceType ?? source.source);
  const evidenceId =
    typeof source.evidenceId === "string"
      ? source.evidenceId
      : typeof source.id === "string"
      ? source.id
      : null;
  const resolvedEvidence = resolveEvidenceRecord(lookup, sourceType, evidenceId);

  return {
    sourceType,
    sourceLabel: sourceLabelForType(sourceType),
    evidenceId: resolvedEvidence?.id || evidenceId,
    fileUrl:
      typeof source.fileUrl === "string"
        ? source.fileUrl
        : typeof source.filePath === "string"
        ? source.filePath
        : resolvedEvidence?.fileUrl || null,
    timestamp:
      typeof source.timestamp === "number"
        ? source.timestamp
        : typeof source.relevantTimestamp === "number"
        ? source.relevantTimestamp
        : null,
    excerpt:
      typeof source.excerpt === "string"
        ? source.excerpt
        : typeof source.detail === "string"
        ? source.detail
        : resolvedEvidence?.transcriptText || null,
    description:
      typeof source.description === "string"
        ? source.description
        : typeof source.excerpt === "string"
        ? source.excerpt
        : null,
    confidence: clampScore(source.confidence, 0),
    evidence: canonicalizeEvidence(resolvedEvidence, evidenceId),
  };
}

function normalizeFieldProvenance(
  field: string,
  value: unknown,
  rawEntry: unknown,
  lookup: EvidenceLookup
): FieldProvenance {
  const entry = rawEntry && typeof rawEntry === "object" ? (rawEntry as RawJson) : {};
  const rawSources = Array.isArray(entry.provenance)
    ? entry.provenance
    : Array.isArray(entry.sources)
    ? entry.sources
    : [];
  const sources = rawSources
    .map((source) => normalizeSource(source, lookup))
    .filter((source): source is ProvenanceSource => source !== null)
    .sort((left, right) => right.confidence - left.confidence);

  const discrepancy = normalizeDiscrepancy(field, entry.discrepancy);
  const discrepancies = discrepancy ? [discrepancy] : [];

  return {
    field,
    value: entry.value !== undefined ? entry.value : value,
    sources,
    corroborationLevel: normalizeCorroborationLevel(entry.corroborationLevel, sources),
    overallConfidence:
      typeof entry.overallConfidence === "number"
        ? clampScore(entry.overallConfidence)
        : sources.length > 0
        ? clampScore(
            sources.reduce((sum, source) => sum + source.confidence, 0) / sources.length
          )
        : 0,
    discrepancies,
  };
}

function dedupeDiscrepancies(discrepancies: FieldDiscrepancy[]): FieldDiscrepancy[] {
  const map = new Map<string, FieldDiscrepancy>();

  for (const discrepancy of discrepancies) {
    const key = `${discrepancy.field.toLowerCase()}::${discrepancy.description.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, discrepancy);
    }
  }

  return Array.from(map.values());
}

function parseVerification(value: string | null | undefined): Record<string, unknown> | null {
  return safeParseJson<Record<string, unknown> | null>(value, null);
}

function buildCaptureEvidenceLookup(
  evidence: Array<{
    id: string;
    type: string;
    fileUrl: string;
    mimeType: string;
    capturedAt: Date;
    transcription: string | null;
    aiExtraction: string | null;
  }>
): EvidenceLookup {
  return buildEvidenceLookup(
    evidence.map((item) => ({
      id: item.id,
      type: item.type,
      fileUrl: item.fileUrl,
      mimeType: item.mimeType,
      capturedAt: item.capturedAt.toISOString(),
      transcriptText: item.transcription,
      structuredData: safeParseJson(item.aiExtraction, item.aiExtraction),
    }))
  );
}

function buildLegacyEvidenceLookup(
  evidence: Array<{
    id: string;
    type: string;
    filePath: string;
    mimeType: string;
    capturedAt: Date;
    transcription: string | null;
    structuredData: string | null;
    fileName: string;
  }>
): EvidenceLookup {
  return buildEvidenceLookup(
    evidence.map((item) => ({
      id: item.id,
      type: item.type,
      fileUrl: item.filePath,
      mimeType: item.mimeType,
      capturedAt: item.capturedAt.toISOString(),
      transcriptText: item.transcription,
      structuredData: safeParseJson(item.structuredData, item.structuredData),
      metadata: { fileName: item.fileName },
    }))
  );
}

function buildResponse(opts: {
  id: string;
  sourceModel: "capture_session" | "generated_document";
  documentType: string;
  title: string | null;
  fields: Record<string, unknown>;
  provenanceRaw: Record<string, unknown>;
  verification: Record<string, unknown> | null;
  lookup: EvidenceLookup;
  sessionId?: string;
  componentId?: string;
  componentPartNumber?: string | null;
  componentSerialNumber?: string | null;
}): DocumentProvenanceResponse {
  const provenanceByField: Record<string, FieldProvenance> = {};

  for (const [field, value] of Object.entries(opts.fields)) {
    provenanceByField[field] = normalizeFieldProvenance(
      field,
      value,
      opts.provenanceRaw[field],
      opts.lookup
    );
  }

  for (const field of Object.keys(opts.provenanceRaw)) {
    if (!(field in provenanceByField)) {
      provenanceByField[field] = normalizeFieldProvenance(
        field,
        null,
        opts.provenanceRaw[field],
        opts.lookup
      );
    }
  }

  const discrepancies = dedupeDiscrepancies(
    Object.values(provenanceByField).flatMap((entry) => entry.discrepancies)
  );

  const evidenceRecords = Array.from(
    new Map(
      Object.values(provenanceByField)
        .flatMap((entry) => entry.sources.map((source) => source.evidence))
        .filter((evidence): evidence is ProvenanceEvidenceRecord => evidence !== null)
        .map((evidence) => [evidence.id, evidence])
    ).values()
  );

  return {
    id: opts.id,
    sourceModel: opts.sourceModel,
    documentType: opts.documentType,
    title: opts.title,
    fields: opts.fields,
    provenanceByField,
    discrepancies,
    verification: opts.verification,
    evidenceRecords,
    sessionId: opts.sessionId,
    componentId: opts.componentId,
    componentPartNumber: opts.componentPartNumber,
    componentSerialNumber: opts.componentSerialNumber,
  };
}

export async function getDocumentProvenance(
  documentId: string
): Promise<DocumentProvenanceResponse | null> {
  const captureDocument = await prisma.documentGeneration2.findUnique({
    where: { id: documentId },
    include: {
      session: {
        include: {
          evidence: {
            orderBy: { capturedAt: "asc" },
          },
        },
      },
    },
  });

  if (captureDocument) {
    return buildResponse({
      id: captureDocument.id,
      sourceModel: "capture_session",
      documentType: captureDocument.documentType,
      title: null,
      fields: safeParseJson<Record<string, unknown>>(captureDocument.contentJson, {}),
      provenanceRaw: safeParseJson<Record<string, unknown>>(
        captureDocument.provenanceJson || captureDocument.evidenceLineage,
        {}
      ),
      verification: parseVerification(captureDocument.verificationJson),
      lookup: buildCaptureEvidenceLookup(captureDocument.session.evidence),
      sessionId: captureDocument.sessionId,
      componentId: captureDocument.session.componentId || undefined,
    });
  }

  const generatedDocument = await prisma.generatedDocument.findUnique({
    where: { id: documentId },
    include: {
      event: {
        include: {
          component: true,
          evidence: {
            orderBy: { capturedAt: "asc" },
          },
        },
      },
    },
  });

  if (!generatedDocument) return null;

  return buildResponse({
    id: generatedDocument.id,
    sourceModel: "generated_document",
    documentType: generatedDocument.docType,
    title: generatedDocument.title,
    fields: safeParseJson<Record<string, unknown>>(generatedDocument.content, {}),
    provenanceRaw: safeParseJson<Record<string, unknown>>(generatedDocument.provenanceJson, {}),
    verification: null,
    lookup: buildLegacyEvidenceLookup(generatedDocument.event.evidence),
    componentId: generatedDocument.event.componentId,
    componentPartNumber: generatedDocument.event.component.partNumber,
    componentSerialNumber: generatedDocument.event.component.serialNumber,
  });
}
