import { describe, expect, it } from "vitest";
import {
  buildShiftTranscriptReviewData,
  transcriptHasUnresolvedConflictMarkers,
} from "@/lib/shift-transcript";

describe("shift transcript review data", () => {
  it("treats conflicting numeric values as a conflict instead of corroboration", () => {
    const reviewData = buildShiftTranscriptReviewData({
      transcriptChunks: [
        {
          transcript: "Torque set to 45 foot-pounds on the mounting bolts.",
          source: "desk_mic",
          startedAt: new Date("2026-03-15T12:00:00.000Z"),
          durationSeconds: 8,
        },
        {
          transcript: "Torque set to 54 foot-pounds on the mounting bolts.",
          source: "glasses_capture",
          startedAt: new Date("2026-03-15T12:00:02.000Z"),
          durationSeconds: 8,
        },
      ],
    });

    expect(reviewData.validationSummary.conflictingSegments).toBe(1);
    expect(reviewData.validationSummary.agreedSegments).toBe(0);
    expect(reviewData.segments[0]?.status).toBe("conflict");
    expect(reviewData.autoTranscriptText).toContain("[Conflict review required:");
  });

  it("keeps corroborated numeric statements agreed when the value matches", () => {
    const reviewData = buildShiftTranscriptReviewData({
      transcriptChunks: [
        {
          transcript: "Final torque 45 foot-pounds on the mounting bolts.",
          source: "desk_mic",
          startedAt: new Date("2026-03-15T12:00:00.000Z"),
          durationSeconds: 8,
        },
        {
          transcript: "Mounting bolts verified at 45 foot-pounds final torque.",
          source: "glasses_capture",
          startedAt: new Date("2026-03-15T12:00:01.000Z"),
          durationSeconds: 8,
        },
      ],
    });

    expect(reviewData.validationSummary.conflictingSegments).toBe(0);
    expect(reviewData.validationSummary.agreedSegments).toBe(1);
    expect(reviewData.segments[0]?.status).toBe("agreed");
  });

  it("flags unresolved conflict placeholders in the transcript editor text", () => {
    const reviewData = buildShiftTranscriptReviewData({
      transcriptChunks: [
        {
          transcript: "Serial number ends in 2451.",
          source: "desk_mic",
          startedAt: new Date("2026-03-15T12:00:00.000Z"),
          durationSeconds: 4,
        },
        {
          transcript: "Serial number ends in 2457.",
          source: "phone_capture",
          startedAt: new Date("2026-03-15T12:00:02.000Z"),
          durationSeconds: 4,
        },
      ],
    });

    expect(transcriptHasUnresolvedConflictMarkers(reviewData.autoTranscriptText)).toBe(true);
    expect(
      transcriptHasUnresolvedConflictMarkers("Serial number verified as 2451 on the data plate.")
    ).toBe(false);
  });
});
