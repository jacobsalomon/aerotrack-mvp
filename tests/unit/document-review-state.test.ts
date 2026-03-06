import { describe, expect, it } from "vitest";
import {
  dispositionRequestsEvidence,
  dispositionResolvesBlocker,
  parseDocumentReviewState,
  serializeDocumentReviewState,
} from "@/lib/document-review-state";

describe("document-review-state", () => {
  it("parses structured review notes with field dispositions", () => {
    const state = parseDocumentReviewState(
      JSON.stringify({
        rejectionNote: "Missing signoff",
        fieldDispositions: {
          block6b: {
            status: "accepted_with_rationale",
            rationale: "Serial number confirmed on teardown sheet.",
            updatedAt: "2026-03-06T12:00:00.000Z",
          },
        },
      })
    );

    expect(state.rejectionNote).toBe("Missing signoff");
    expect(state.fieldDispositions.block6b?.status).toBe("accepted_with_rationale");
  });

  it("treats legacy plain-text review notes as rejection notes", () => {
    const state = parseDocumentReviewState("Legacy review note");

    expect(state.rejectionNote).toBe("Legacy review note");
    expect(state.fieldDispositions).toEqual({});
  });

  it("serializes empty review state to null", () => {
    expect(
      serializeDocumentReviewState({
        rejectionNote: null,
        fieldDispositions: {},
      })
    ).toBeNull();
  });

  it("classifies which dispositions resolve blockers", () => {
    const accepted = parseDocumentReviewState(
      JSON.stringify({
        fieldDispositions: {
          block1: {
            status: "accepted_with_rationale",
            rationale: "Cross-checked against manual.",
            updatedAt: "2026-03-06T12:00:00.000Z",
          },
          block2: {
            status: "needs_additional_evidence",
            rationale: "Need close-up photo.",
            updatedAt: "2026-03-06T12:05:00.000Z",
          },
        },
      })
    );

    expect(dispositionResolvesBlocker(accepted.fieldDispositions.block1)).toBe(true);
    expect(dispositionRequestsEvidence(accepted.fieldDispositions.block2)).toBe(true);
  });
});
