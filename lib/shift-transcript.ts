export const SHIFT_TRANSCRIPT_REVIEW_STATUS_VALUES = [
  "capturing",
  "review_required",
  "approved",
] as const;

export const SHIFT_TRANSCRIPT_SOURCE_VALUES = [
  "desk_mic",
  "glasses_capture",
  "phone_capture",
  "unknown",
] as const;

export const SHIFT_TRANSCRIPT_CONFLICT_MARKER_PREFIX = "[Conflict review required:";

export type ShiftTranscriptReviewStatus =
  (typeof SHIFT_TRANSCRIPT_REVIEW_STATUS_VALUES)[number];

export type ShiftTranscriptSource =
  (typeof SHIFT_TRANSCRIPT_SOURCE_VALUES)[number];

export interface ShiftTranscriptChunkInput {
  transcript: string;
  source?: string | null;
  startedAt?: Date | null;
  createdAt?: Date;
  durationSeconds?: number | null;
}

export interface ShiftTranscriptSourceSummary {
  source: ShiftTranscriptSource;
  label: string;
  chunkCount: number;
  transcriptText: string;
  latestAt: string | null;
}

export interface ShiftTranscriptSegmentContribution {
  source: ShiftTranscriptSource;
  label: string;
  transcript: string;
}

export interface ShiftTranscriptSegment {
  id: string;
  startedAt: string | null;
  endedAt: string | null;
  status: "single_source" | "agreed" | "conflict";
  displayText: string;
  sources: ShiftTranscriptSource[];
  contributions: ShiftTranscriptSegmentContribution[];
}

export interface ShiftTranscriptValidationSummary {
  distinctSources: number;
  totalSegments: number;
  multiSourceSegments: number;
  agreedSegments: number;
  conflictingSegments: number;
  singleSourceSegments: number;
}

export function normalizeShiftTranscript(transcript: string): string {
  return transcript
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeShiftTranscriptSource(source?: string | null): ShiftTranscriptSource {
  const normalized = (source || "").trim().toLowerCase();

  if (!normalized || normalized === "desk_mic" || normalized.includes("desk")) {
    return "desk_mic";
  }
  if (
    normalized.includes("glasses") ||
    normalized.includes("ray-ban") ||
    normalized.includes("rayban") ||
    normalized.includes("wearable")
  ) {
    return "glasses_capture";
  }
  if (normalized.includes("phone")) {
    return "phone_capture";
  }

  return "unknown";
}

export function getShiftTranscriptSourceLabel(source: string): string {
  switch (normalizeShiftTranscriptSource(source)) {
    case "desk_mic":
      return "Desk Mic";
    case "glasses_capture":
      return "Ray-Ban Capture";
    case "phone_capture":
      return "Phone Capture";
    default:
      return "Other Source";
  }
}

function toDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function getChunkStart(chunk: ShiftTranscriptChunkInput): Date {
  return toDate(chunk.startedAt) ?? toDate(chunk.createdAt) ?? new Date(0);
}

function getChunkEnd(chunk: ShiftTranscriptChunkInput): Date {
  const start = getChunkStart(chunk);
  const durationMs =
    typeof chunk.durationSeconds === "number" && Number.isFinite(chunk.durationSeconds)
      ? Math.max(chunk.durationSeconds, 0) * 1000
      : 0;

  return new Date(start.getTime() + durationMs);
}

function compactTranscriptLine(transcript: string): string {
  return normalizeShiftTranscript(transcript).replace(/\n+/g, " ").trim();
}

function isNumericToken(token: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(token);
}

function transcriptTokens(transcript: string): string[] {
  return compactTranscriptLine(transcript)
    .toLowerCase()
    .replace(/[^a-z0-9.\s/-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeNumericToken(token: string): string {
  const parsed = Number(token);
  if (Number.isFinite(parsed)) {
    return parsed.toString();
  }

  return token.replace(/^0+(?=\d)/, "");
}

function transcriptNumbers(transcript: string): string[] {
  return (compactTranscriptLine(transcript).match(/\d+(?:\.\d+)?/g) ?? []).map(
    normalizeNumericToken
  );
}

function numericTokenSetsMatch(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;

  for (const token of left) {
    if (!right.has(token)) {
      return false;
    }
  }

  return true;
}

function buildConflictMarker(contributions: ShiftTranscriptSegmentContribution[]): string {
  const labels = contributions.map((contribution) => contribution.label).join(" vs ");
  return `${SHIFT_TRANSCRIPT_CONFLICT_MARKER_PREFIX} ${labels} disagree in this note window.]`;
}

export function transcriptHasUnresolvedConflictMarkers(transcript: string): boolean {
  return normalizeShiftTranscript(transcript)
    .split("\n")
    .some((line) => line.trim().startsWith(SHIFT_TRANSCRIPT_CONFLICT_MARKER_PREFIX));
}

function transcriptTextsAgree(left: string, right: string): boolean {
  const leftText = compactTranscriptLine(left).toLowerCase();
  const rightText = compactTranscriptLine(right).toLowerCase();

  if (!leftText || !rightText) return false;

  const leftTokens = new Set(transcriptTokens(leftText));
  const rightTokens = new Set(transcriptTokens(rightText));
  const leftNumericTokens = new Set(transcriptNumbers(leftText));
  const rightNumericTokens = new Set(transcriptNumbers(rightText));
  const hasNumericTokens = leftNumericTokens.size > 0 || rightNumericTokens.size > 0;

  if (hasNumericTokens && !numericTokenSetsMatch(leftNumericTokens, rightNumericTokens)) {
    return false;
  }

  if (leftText === rightText) return true;
  if (leftText.includes(rightText) || rightText.includes(leftText)) return true;

  const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const minTokenCount = Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  const tokenOverlap = sharedTokens / minTokenCount;

  if (hasNumericTokens) {
    const leftNonNumericTokens = new Set([...leftTokens].filter((token) => !isNumericToken(token)));
    const rightNonNumericTokens = new Set([...rightTokens].filter((token) => !isNumericToken(token)));
    const sharedNonNumericTokens = [...leftNonNumericTokens].filter((token) =>
      rightNonNumericTokens.has(token)
    ).length;

    return sharedNonNumericTokens > 0 && tokenOverlap >= 0.35;
  }

  return tokenOverlap >= 0.6;
}

export function buildShiftTranscriptReviewData(args: {
  transcriptDraft?: string | null;
  transcriptChunks?: ShiftTranscriptChunkInput[];
}): {
  transcriptText: string;
  autoTranscriptText: string;
  sourceSummaries: ShiftTranscriptSourceSummary[];
  segments: ShiftTranscriptSegment[];
  validationSummary: ShiftTranscriptValidationSummary;
} {
  const preparedChunks = (args.transcriptChunks ?? [])
    .map((chunk, index) => {
      const transcript = normalizeShiftTranscript(chunk.transcript);
      if (!transcript) return null;

      const source = normalizeShiftTranscriptSource(chunk.source);
      const startedAt = getChunkStart(chunk);
      const endedAt = getChunkEnd(chunk);

      return {
        id: `chunk-${index}`,
        source,
        label: getShiftTranscriptSourceLabel(source),
        transcript,
        startedAt,
        endedAt,
      };
    })
    .filter((chunk): chunk is NonNullable<typeof chunk> => Boolean(chunk))
    .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());

  const sourceSummaries = SHIFT_TRANSCRIPT_SOURCE_VALUES
    .map((source) => {
      const chunks = preparedChunks.filter((chunk) => chunk.source === source);
      if (chunks.length === 0) return null;

      const latestAt = chunks.reduce<Date | null>(
        (latest, chunk) =>
          !latest || chunk.endedAt.getTime() > latest.getTime() ? chunk.endedAt : latest,
        null
      );

      return {
        source,
        label: getShiftTranscriptSourceLabel(source),
        chunkCount: chunks.length,
        transcriptText: normalizeShiftTranscript(chunks.map((chunk) => chunk.transcript).join("\n\n")),
        latestAt: latestAt?.toISOString() ?? null,
      } satisfies ShiftTranscriptSourceSummary;
    })
    .filter((summary): summary is ShiftTranscriptSourceSummary => Boolean(summary));

  const windows: Array<{
    id: string;
    startedAt: Date;
    endedAt: Date;
    contributions: typeof preparedChunks;
  }> = [];

  for (const chunk of preparedChunks) {
    let window:
      | {
          id: string;
          startedAt: Date;
          endedAt: Date;
          contributions: typeof preparedChunks;
        }
      | undefined;

    for (let index = windows.length - 1; index >= 0; index -= 1) {
      const candidate = windows[index];
      const toleranceMs = 15_000;
      const overlaps =
        chunk.startedAt.getTime() <= candidate.endedAt.getTime() + toleranceMs &&
        chunk.endedAt.getTime() >= candidate.startedAt.getTime() - toleranceMs;

      if (overlaps) {
        window = candidate;
        break;
      }
    }

    if (window) {
      window.contributions.push(chunk);
      if (chunk.startedAt.getTime() < window.startedAt.getTime()) {
        window.startedAt = chunk.startedAt;
      }
      if (chunk.endedAt.getTime() > window.endedAt.getTime()) {
        window.endedAt = chunk.endedAt;
      }
      continue;
    }

    windows.push({
      id: `segment-${windows.length + 1}`,
      startedAt: chunk.startedAt,
      endedAt: chunk.endedAt,
      contributions: [chunk],
    });
  }

  const segments = windows.map<ShiftTranscriptSegment>((window) => {
    const groupedBySource = new Map<ShiftTranscriptSource, ShiftTranscriptSegmentContribution>();

    for (const contribution of window.contributions) {
      const existing = groupedBySource.get(contribution.source);
      if (existing) {
        existing.transcript = normalizeShiftTranscript(
          `${existing.transcript}\n\n${contribution.transcript}`
        );
      } else {
        groupedBySource.set(contribution.source, {
          source: contribution.source,
          label: contribution.label,
          transcript: contribution.transcript,
        });
      }
    }

    const contributions = [...groupedBySource.values()];
    let status: ShiftTranscriptSegment["status"] = "single_source";

    if (contributions.length > 1) {
      const comparisons: boolean[] = [];
      for (let leftIndex = 0; leftIndex < contributions.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < contributions.length; rightIndex += 1) {
          comparisons.push(
            transcriptTextsAgree(
              contributions[leftIndex].transcript,
              contributions[rightIndex].transcript
            )
          );
        }
      }

      status = comparisons.every(Boolean) ? "agreed" : "conflict";
    }

    const displayText =
      contributions.length === 0
        ? ""
        : status === "conflict"
          ? contributions
              .map((contribution) => `${contribution.label}: ${contribution.transcript}`)
              .join("\n\n")
          : contributions
              .slice()
              .sort((left, right) => right.transcript.length - left.transcript.length)[0]
              .transcript;

    return {
      id: window.id,
      startedAt: window.startedAt.toISOString(),
      endedAt: window.endedAt.toISOString(),
      status,
      displayText,
      sources: contributions.map((contribution) => contribution.source),
      contributions,
    };
  });

  const validationSummary: ShiftTranscriptValidationSummary = {
    distinctSources: sourceSummaries.length,
    totalSegments: segments.length,
    multiSourceSegments: segments.filter((segment) => segment.sources.length > 1).length,
    agreedSegments: segments.filter((segment) => segment.status === "agreed").length,
    conflictingSegments: segments.filter((segment) => segment.status === "conflict").length,
    singleSourceSegments: segments.filter((segment) => segment.status === "single_source").length,
  };

  const autoTranscriptText = normalizeShiftTranscript(
    segments
      .map((segment) =>
        segment.status === "conflict"
          ? buildConflictMarker(segment.contributions)
          : segment.displayText
      )
      .filter(Boolean)
      .join("\n\n")
  );
  const draft = args.transcriptDraft ? normalizeShiftTranscript(args.transcriptDraft) : "";

  return {
    transcriptText: draft || autoTranscriptText,
    autoTranscriptText,
    sourceSummaries,
    segments,
    validationSummary,
  };
}

export function buildShiftTranscript(args: {
  transcriptDraft?: string | null;
  transcriptChunks?: ShiftTranscriptChunkInput[];
}): string {
  return buildShiftTranscriptReviewData(args).transcriptText;
}

export function canExportShiftToQuantum(args: {
  status: string;
  transcriptReviewStatus: string;
  transcriptText?: string | null;
}): boolean {
  return (
    args.status === "completed" &&
    args.transcriptReviewStatus === "approved" &&
    Boolean(args.transcriptText && normalizeShiftTranscript(args.transcriptText))
  );
}

export function getShiftTranscriptReviewLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "review_required":
      return "Review required";
    default:
      return "Capturing";
  }
}
