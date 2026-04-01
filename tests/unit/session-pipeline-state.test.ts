import { describe, expect, it } from "vitest";
import {
  assessEvidenceReadiness,
  getSessionPipelineState,
  markSessionNeedsRefreshInSummary,
  selectEvidenceForProcessing,
  setEvidenceAnalysisStateInSummary,
  setProcessingSnapshotInSummary,
} from "@/lib/session-pipeline-state";

describe("session pipeline state helpers", () => {
  it("blocks readiness while required evidence analysis is still pending", () => {
    const summary = setEvidenceAnalysisStateInSummary({}, "photo-1", {
      status: "completed",
      updatedAt: "2026-04-01T15:00:00.000Z",
      processor: "photo_ocr",
      empty: false,
      metrics: { extractedFieldCount: 2 },
    });

    const readiness = assessEvidenceReadiness({
      completedAt: "2026-04-01T15:05:00.000Z",
      summary,
      evidence: [
        {
          id: "photo-1",
          type: "PHOTO",
          capturedAt: "2026-04-01T15:00:00.000Z",
          createdAt: "2026-04-01T15:00:01.000Z",
          aiExtraction: { partNumber: "881700-1001" },
          transcription: null,
          videoAnnotationCount: 0,
        },
        {
          id: "audio-1",
          type: "AUDIO_CHUNK",
          capturedAt: "2026-04-01T15:01:00.000Z",
          createdAt: "2026-04-01T15:01:01.000Z",
          aiExtraction: null,
          transcription: null,
          videoAnnotationCount: 0,
        },
      ],
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.pendingEvidenceIds).toEqual(["audio-1"]);
    expect(readiness.snapshot.evidenceIds).toEqual(["photo-1", "audio-1"]);
  });

  it("includes late-registered evidence captured before session completion", () => {
    const selected = selectEvidenceForProcessing(
      [
        {
          id: "photo-early",
          type: "PHOTO",
          capturedAt: "2026-04-01T15:00:00.000Z",
          createdAt: "2026-04-01T15:00:01.000Z",
          aiExtraction: null,
          transcription: null,
          videoAnnotationCount: 0,
        },
        {
          id: "audio-late-upload",
          type: "AUDIO_CHUNK",
          capturedAt: "2026-04-01T15:04:00.000Z",
          createdAt: "2026-04-01T15:10:00.000Z",
          aiExtraction: null,
          transcription: null,
          videoAnnotationCount: 0,
        },
      ],
      "2026-04-01T15:05:00.000Z"
    );

    expect(selected.map((item) => item.id)).toEqual([
      "photo-early",
      "audio-late-upload",
    ]);
  });

  it("tracks refresh requests until a new snapshot is committed", () => {
    const flagged = markSessionNeedsRefreshInSummary({}, "video-2");
    expect(getSessionPipelineState(flagged)).toMatchObject({
      needsRefresh: true,
      lateEvidenceIds: ["video-2"],
    });

    const resolved = setProcessingSnapshotInSummary(flagged, {
      evidenceIds: ["photo-1", "video-2"],
      createdAt: "2026-04-01T16:00:00.000Z",
      completedAtCutoff: "2026-04-01T15:55:00.000Z",
    });

    expect(getSessionPipelineState(resolved)).toMatchObject({
      needsRefresh: false,
      lateEvidenceIds: [],
      activeSnapshot: {
        evidenceIds: ["photo-1", "video-2"],
      },
    });
  });
});
