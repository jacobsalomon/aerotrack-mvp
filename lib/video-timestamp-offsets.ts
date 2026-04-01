// Compute session-global timestamps for video evidence chunks.
//
// Video is recorded in 2-minute chunks. Annotations store timestamps
// relative to each chunk (0–120s). This utility computes cumulative
// offsets so we can display "4:30 into session" instead of "0:30 into chunk 3".
//
// Mirrors the audio pattern in toTimestampedTranscript() which accumulates
// durationSeconds across audio chunks for the same purpose.

interface VideoChunk {
  id: string;
  durationSeconds: number | null;
}

/**
 * Build a map from evidenceId → cumulative offset (seconds) for each video chunk.
 *
 * Input must be sorted by capturedAt ASC (the order from the DB query).
 * Example: 3 chunks of [120s, 120s, 120s] → { chunk1: 0, chunk2: 120, chunk3: 240 }
 */
export function buildVideoChunkOffsets(
  videoEvidence: VideoChunk[]
): Map<string, number> {
  const offsets = new Map<string, number>();
  let cumulative = 0;

  for (const chunk of videoEvidence) {
    offsets.set(chunk.id, cumulative);
    // Default to 120s (standard 2-minute chunk) if duration is missing.
    // Matches the audio accumulation pattern in pipeline-stages.ts.
    cumulative += chunk.durationSeconds ?? 120;
  }

  return offsets;
}

/**
 * Convert a chunk-relative timestamp to a session-global timestamp.
 * Returns the original timestamp if no offset is found (single-chunk sessions
 * or missing evidence link — graceful fallback).
 */
export function toSessionTimestamp(
  chunkRelativeSeconds: number,
  evidenceId: string,
  offsets: Map<string, number>
): number {
  const offset = offsets.get(evidenceId);
  if (offset === undefined) return chunkRelativeSeconds;
  return offset + chunkRelativeSeconds;
}

/**
 * Add `sessionTimestamp` (session-global) to each video annotation
 * while preserving the original `timestamp` (chunk-relative) for video seeking.
 */
export function addSessionTimestamps<
  T extends {
    evidence: Array<{
      id: string;
      type: string;
      durationSeconds: number | null;
      videoAnnotations: Array<{ timestamp: number; [k: string]: unknown }>;
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  },
>(session: T): T {
  const videoChunks = session.evidence
    .filter((e) => e.type === "VIDEO")
    .map((e) => ({ id: e.id, durationSeconds: e.durationSeconds }));
  const offsets = buildVideoChunkOffsets(videoChunks);

  return {
    ...session,
    evidence: session.evidence.map((e) => ({
      ...e,
      videoAnnotations: e.videoAnnotations.map((ann) => ({
        ...ann,
        sessionTimestamp: offsets.has(e.id)
          ? (offsets.get(e.id)! + ann.timestamp)
          : ann.timestamp,
      })),
    })),
  };
}
