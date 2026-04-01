import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

const PIPELINE_SUMMARY_KEY = "mobileCapturePipeline";
const MAX_SUMMARY_UPDATE_RETRIES = 5;

export type EvidenceAnalysisStatus =
  | "pending"
  | "completed"
  | "failed"
  | "skipped";

export interface EvidenceAnalysisState {
  status: EvidenceAnalysisStatus;
  updatedAt: string;
  processor?: string;
  error?: string | null;
  empty?: boolean;
  metrics?: Record<string, number>;
}

export interface EvidenceProcessingSnapshot {
  evidenceIds: string[];
  createdAt: string;
  completedAtCutoff: string | null;
}

export interface SessionPipelineState {
  evidenceAnalysis: Record<string, EvidenceAnalysisState>;
  activeSnapshot: EvidenceProcessingSnapshot | null;
  needsRefresh: boolean;
  lateEvidenceIds: string[];
}

export interface EvidenceForPipeline {
  id: string;
  type: string;
  capturedAt: Date | string | null;
  createdAt: Date | string | null;
  aiExtraction: unknown;
  transcription: string | null;
  videoAnnotationCount: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function toIsoString(value?: Date | string | null): string {
  if (typeof value === "string") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

function toEpoch(value?: Date | string | null): number {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEvidenceAnalysisState(
  value: unknown
): EvidenceAnalysisState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const status = record.status;
  if (
    status !== "pending" &&
    status !== "completed" &&
    status !== "failed" &&
    status !== "skipped"
  ) {
    return null;
  }

  const normalized: EvidenceAnalysisState = {
    status,
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : new Date().toISOString(),
  };

  if (typeof record.processor === "string" && record.processor.trim()) {
    normalized.processor = record.processor.trim();
  }
  if (
    record.error === null ||
    (typeof record.error === "string" && record.error.trim())
  ) {
    normalized.error = record.error as string | null;
  }
  if (typeof record.empty === "boolean") {
    normalized.empty = record.empty;
  }
  if (record.metrics && typeof record.metrics === "object" && !Array.isArray(record.metrics)) {
    const metrics = Object.entries(record.metrics as Record<string, unknown>).reduce<
      Record<string, number>
    >((acc, [key, metricValue]) => {
      if (typeof metricValue === "number" && Number.isFinite(metricValue)) {
        acc[key] = metricValue;
      }
      return acc;
    }, {});
    if (Object.keys(metrics).length > 0) {
      normalized.metrics = metrics;
    }
  }

  return normalized;
}

export function getSessionPipelineState(summary: unknown): SessionPipelineState {
  const root = asRecord(summary);
  const pipeline = asRecord(root[PIPELINE_SUMMARY_KEY]);
  const evidenceAnalysisRaw = asRecord(pipeline.evidenceAnalysis);

  const evidenceAnalysis = Object.entries(evidenceAnalysisRaw).reduce<
    Record<string, EvidenceAnalysisState>
  >((acc, [evidenceId, value]) => {
    const normalized = normalizeEvidenceAnalysisState(value);
    if (normalized) acc[evidenceId] = normalized;
    return acc;
  }, {});

  let activeSnapshot: EvidenceProcessingSnapshot | null = null;
  const snapshot = pipeline.activeSnapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const record = snapshot as Record<string, unknown>;
    const evidenceIds = Array.isArray(record.evidenceIds)
      ? record.evidenceIds
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
      : [];
    activeSnapshot = {
      evidenceIds,
      createdAt:
        typeof record.createdAt === "string"
          ? record.createdAt
          : new Date().toISOString(),
      completedAtCutoff:
        typeof record.completedAtCutoff === "string"
          ? record.completedAtCutoff
          : null,
    };
  }

  return {
    evidenceAnalysis,
    activeSnapshot,
    needsRefresh: pipeline.needsRefresh === true,
    lateEvidenceIds: Array.isArray(pipeline.lateEvidenceIds)
      ? pipeline.lateEvidenceIds.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [],
  };
}

function setSessionPipelineState(
  summary: unknown,
  pipelineState: SessionPipelineState
): Record<string, unknown> {
  const root = asRecord(summary);
  root[PIPELINE_SUMMARY_KEY] = {
    evidenceAnalysis: pipelineState.evidenceAnalysis,
    activeSnapshot: pipelineState.activeSnapshot,
    needsRefresh: pipelineState.needsRefresh,
    lateEvidenceIds: pipelineState.lateEvidenceIds,
  };
  return root;
}

function countPhotoExtractionFields(payload: unknown): number {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 0;
  const record = payload as Record<string, unknown>;
  let count = 0;
  const scalarKeys = ["partNumber", "serialNumber", "description", "manufacturer"];
  for (const key of scalarKeys) {
    if (typeof record[key] === "string" && record[key]!.toString().trim().length > 0) {
      count++;
    }
  }
  if (Array.isArray(record.allText)) {
    count += record.allText.filter(
      (item) => typeof item === "string" && item.trim().length > 0
    ).length;
  }
  return count;
}

export function deriveEvidenceAnalysisState(
  evidence: EvidenceForPipeline,
  persisted?: EvidenceAnalysisState | null
): EvidenceAnalysisState {
  if (persisted) return persisted;

  if (evidence.type === "PHOTO" && evidence.aiExtraction !== null && evidence.aiExtraction !== undefined) {
    const extractedFieldCount = countPhotoExtractionFields(evidence.aiExtraction);
    return {
      status: "completed",
      updatedAt: toIsoString(evidence.createdAt ?? evidence.capturedAt),
      processor: "photo_ocr",
      empty: extractedFieldCount === 0,
      metrics: { extractedFieldCount },
    };
  }

  if (evidence.type === "AUDIO_CHUNK" && evidence.transcription !== null) {
    const transcriptLength = evidence.transcription.trim().length;
    return {
      status: "completed",
      updatedAt: toIsoString(evidence.createdAt ?? evidence.capturedAt),
      processor: "audio_transcription",
      empty: transcriptLength === 0,
      metrics: { transcriptLength },
    };
  }

  if (evidence.type === "VIDEO" && evidence.videoAnnotationCount > 0) {
    return {
      status: "completed",
      updatedAt: toIsoString(evidence.createdAt ?? evidence.capturedAt),
      processor: "video_annotation",
      empty: false,
      metrics: { annotationCount: evidence.videoAnnotationCount },
    };
  }

  if (
    evidence.type !== "PHOTO" &&
    evidence.type !== "AUDIO_CHUNK" &&
    evidence.type !== "VIDEO"
  ) {
    return {
      status: "skipped",
      updatedAt: toIsoString(evidence.createdAt ?? evidence.capturedAt),
      processor: "unsupported_evidence_type",
      empty: true,
    };
  }

  return {
    status: "pending",
    updatedAt: toIsoString(evidence.createdAt ?? evidence.capturedAt),
  };
}

export function selectEvidenceForProcessing(
  evidence: EvidenceForPipeline[],
  completedAt: Date | string | null
): EvidenceForPipeline[] {
  if (!completedAt) {
    return [...evidence].sort(sortEvidenceForSnapshot);
  }

  const cutoffMs = toEpoch(completedAt);
  return [...evidence]
    .filter((item) => {
      const capturedAtMs = toEpoch(item.capturedAt);
      const createdAtMs = toEpoch(item.createdAt);
      return capturedAtMs <= cutoffMs || createdAtMs > cutoffMs;
    })
    .sort(sortEvidenceForSnapshot);
}

function sortEvidenceForSnapshot(a: EvidenceForPipeline, b: EvidenceForPipeline): number {
  const capturedDelta = toEpoch(a.capturedAt) - toEpoch(b.capturedAt);
  if (capturedDelta !== 0) return capturedDelta;
  const createdDelta = toEpoch(a.createdAt) - toEpoch(b.createdAt);
  if (createdDelta !== 0) return createdDelta;
  return a.id.localeCompare(b.id);
}

export function createEvidenceProcessingSnapshot(
  evidence: EvidenceForPipeline[],
  completedAt: Date | string | null,
  createdAt = new Date()
): EvidenceProcessingSnapshot {
  return {
    evidenceIds: [...evidence]
      .sort(sortEvidenceForSnapshot)
      .map((item) => item.id),
    createdAt: createdAt.toISOString(),
    completedAtCutoff: completedAt ? toIsoString(completedAt) : null,
  };
}

export function assessEvidenceReadiness(args: {
  evidence: EvidenceForPipeline[];
  summary: unknown;
  completedAt: Date | string | null;
}) {
  const selectedEvidence = selectEvidenceForProcessing(args.evidence, args.completedAt);
  const pipelineState = getSessionPipelineState(args.summary);

  const evidenceStates = selectedEvidence.map((item) => ({
    evidenceId: item.id,
    state: deriveEvidenceAnalysisState(
      item,
      pipelineState.evidenceAnalysis[item.id] ?? null
    ),
  }));

  const pendingEvidenceIds = evidenceStates
    .filter((item) => item.state.status === "pending")
    .map((item) => item.evidenceId);

  return {
    ready: pendingEvidenceIds.length === 0,
    pendingEvidenceIds,
    evidenceIds: selectedEvidence.map((item) => item.id),
    snapshot: createEvidenceProcessingSnapshot(selectedEvidence, args.completedAt),
  };
}

export function setEvidenceAnalysisStateInSummary(
  summary: unknown,
  evidenceId: string,
  state: EvidenceAnalysisState
): Record<string, unknown> {
  const pipelineState = getSessionPipelineState(summary);
  pipelineState.evidenceAnalysis[evidenceId] = state;
  return setSessionPipelineState(summary, pipelineState);
}

export function markSessionNeedsRefreshInSummary(
  summary: unknown,
  evidenceId: string
): Record<string, unknown> {
  const pipelineState = getSessionPipelineState(summary);
  if (!pipelineState.lateEvidenceIds.includes(evidenceId)) {
    pipelineState.lateEvidenceIds = [...pipelineState.lateEvidenceIds, evidenceId];
  }
  pipelineState.needsRefresh = true;
  return setSessionPipelineState(summary, pipelineState);
}

export function clearSessionRefreshInSummary(summary: unknown): Record<string, unknown> {
  const pipelineState = getSessionPipelineState(summary);
  pipelineState.needsRefresh = false;
  pipelineState.lateEvidenceIds = [];
  return setSessionPipelineState(summary, pipelineState);
}

export function setProcessingSnapshotInSummary(
  summary: unknown,
  snapshot: EvidenceProcessingSnapshot
): Record<string, unknown> {
  const pipelineState = getSessionPipelineState(summary);
  pipelineState.activeSnapshot = snapshot;
  pipelineState.needsRefresh = false;
  pipelineState.lateEvidenceIds = [];
  return setSessionPipelineState(summary, pipelineState);
}

export function clearProcessingSnapshotInSummary(
  summary: unknown
): Record<string, unknown> {
  const pipelineState = getSessionPipelineState(summary);
  pipelineState.activeSnapshot = null;
  return setSessionPipelineState(summary, pipelineState);
}

export function clearRefreshAndProcessingSnapshotInSummary(
  summary: unknown
): Record<string, unknown> {
  const pipelineState = getSessionPipelineState(summary);
  pipelineState.activeSnapshot = null;
  pipelineState.needsRefresh = false;
  pipelineState.lateEvidenceIds = [];
  return setSessionPipelineState(summary, pipelineState);
}

async function updateSessionSummary(
  sessionId: string,
  mutator: (summary: unknown) => Record<string, unknown>
) {
  for (let attempt = 0; attempt < MAX_SUMMARY_UPDATE_RETRIES; attempt++) {
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: {
        reconciliationSummary: true,
        updatedAt: true,
      },
    });

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const nextSummary = mutator(session.reconciliationSummary);

    const updated = await prisma.captureSession.updateMany({
      where: {
        id: sessionId,
        updatedAt: session.updatedAt,
      },
      data: {
        reconciliationSummary:
          nextSummary as unknown as Prisma.InputJsonValue,
      },
    });

    if (updated.count > 0) {
      return nextSummary;
    }
  }

  throw new Error(
    `Failed to update reconciliationSummary after ${MAX_SUMMARY_UPDATE_RETRIES} attempts`
  );
}

export async function upsertEvidenceAnalysisState(
  sessionId: string,
  evidenceId: string,
  state: EvidenceAnalysisState
) {
  return updateSessionSummary(sessionId, (summary) =>
    setEvidenceAnalysisStateInSummary(summary, evidenceId, state)
  );
}

export async function markSessionNeedsRefresh(
  sessionId: string,
  evidenceId: string
) {
  return updateSessionSummary(sessionId, (summary) =>
    markSessionNeedsRefreshInSummary(summary, evidenceId)
  );
}

export async function clearSessionRefresh(sessionId: string) {
  return updateSessionSummary(sessionId, (summary) =>
    clearSessionRefreshInSummary(summary)
  );
}

export async function setProcessingSnapshot(
  sessionId: string,
  snapshot: EvidenceProcessingSnapshot
) {
  return updateSessionSummary(sessionId, (summary) =>
    setProcessingSnapshotInSummary(summary, snapshot)
  );
}

export async function clearProcessingSnapshot(sessionId: string) {
  return updateSessionSummary(sessionId, (summary) =>
    clearProcessingSnapshotInSummary(summary)
  );
}

export async function clearRefreshAndProcessingSnapshot(sessionId: string) {
  return updateSessionSummary(sessionId, (summary) =>
    clearRefreshAndProcessingSnapshotInSummary(summary)
  );
}
