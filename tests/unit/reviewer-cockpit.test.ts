import { describe, expect, it } from "vitest";
import { deriveReviewerCockpitSummary } from "@/lib/reviewer-cockpit";

describe("deriveReviewerCockpitSummary", () => {
  it("returns awaiting documents when the session has no documents", () => {
    const summary = deriveReviewerCockpitSummary([]);

    expect(summary.readiness).toBe("Awaiting Documents");
    expect(summary.nextDocumentId).toBeNull();
    expect(summary.counts.totalDocuments).toBe(0);
  });

  it("marks the cockpit blocked when a document is rejected", () => {
    const summary = deriveReviewerCockpitSummary([
      {
        id: "doc-1",
        documentType: "8130-3",
        status: "rejected",
        lowConfidenceFields: JSON.stringify([]),
        verificationJson: JSON.stringify({ issues: [] }),
        evidenceLineage: JSON.stringify({ block1: { source: "photo" } }),
      },
    ]);

    expect(summary.readiness).toBe("Blocked");
    expect(summary.counts.rejected).toBe(1);
    expect(summary.blockers.some((blocker) => blocker.docId === "doc-1" && blocker.severity === "critical")).toBe(true);
    expect(summary.documents["doc-1"]?.readyToApprove).toBe(false);
  });

  it("counts low-confidence fields, verification issues, and provenance-linked fields", () => {
    const summary = deriveReviewerCockpitSummary([
      {
        id: "doc-1",
        documentType: "8130-3",
        status: "pending_review",
        lowConfidenceFields: JSON.stringify(["block6b", "block7"]),
        verificationJson: JSON.stringify({
          issues: [{ severity: "warning" }],
          documentReviews: [{ issues: [{ severity: "critical", field: "block6b" }] }],
        }),
        evidenceLineage: JSON.stringify({
          block1: { source: "photo" },
          block6b: { source: "audio" },
          block7: { source: "video" },
        }),
        provenanceJson: JSON.stringify({
          block6b: {
            discrepancy: {
              detected: true,
              field: "block6b",
              description: "OCR and narration disagree on the part number.",
            },
          },
        }),
      },
    ]);

    expect(summary.readiness).toBe("Blocked");
    expect(summary.counts.highRiskFields).toBe(2);
    expect(summary.counts.verificationIssues).toBe(2);
    expect(summary.documents["doc-1"]?.provenanceFieldCount).toBe(1);
    expect(summary.documents["doc-1"]?.criticalIssueCount).toBe(1);
    expect(summary.documents["doc-1"]?.provenanceDiscrepancyCount).toBe(1);
    expect(summary.blockers.find((blocker) => blocker.kind === "critical_issue")?.fieldKey).toBe("block6b");
    expect(summary.blockers.find((blocker) => blocker.kind === "provenance_discrepancy")?.fieldKey).toBe("block6b");
    expect(summary.documents["doc-1"]?.readyToApprove).toBe(false);
  });

  it("marks the cockpit review complete when all documents are approved and clean", () => {
    const summary = deriveReviewerCockpitSummary([
      {
        id: "doc-1",
        documentType: "8130-3",
        status: "approved",
        lowConfidenceFields: JSON.stringify([]),
        verificationJson: JSON.stringify({ issues: [] }),
        evidenceLineage: JSON.stringify({ block1: { source: "photo" } }),
        provenanceJson: JSON.stringify({ block1: { provenance: [] } }),
      },
      {
        id: "doc-2",
        documentType: "work_order",
        status: "approved",
        lowConfidenceFields: JSON.stringify([]),
        verificationJson: JSON.stringify({ issues: [] }),
        evidenceLineage: JSON.stringify({ summary: { source: "audio" } }),
        provenanceJson: JSON.stringify({ summary: { provenance: [] } }),
      },
    ]);

    expect(summary.readiness).toBe("Review Complete");
    expect(summary.counts.approved).toBe(2);
    expect(summary.counts.docsWithBlockers).toBe(0);
    expect(summary.counts.readyToApprove).toBe(0);
    expect(summary.nextDocumentId).toBe("doc-1");
  });

  it("counts documents that are ready to approve when no blockers exist", () => {
    const summary = deriveReviewerCockpitSummary([
      {
        id: "doc-1",
        documentType: "8130-3",
        status: "pending_review",
        lowConfidenceFields: JSON.stringify([]),
        verificationJson: JSON.stringify({ issues: [] }),
        evidenceLineage: JSON.stringify({ block1: { source: "photo" } }),
        provenanceJson: JSON.stringify({ block1: { provenance: [] } }),
      },
      {
        id: "doc-2",
        documentType: "337",
        status: "pending_review",
        lowConfidenceFields: JSON.stringify(["aircraft.registration"]),
        verificationJson: JSON.stringify({ issues: [] }),
        evidenceLineage: JSON.stringify({ aircraft: { source: "audio" } }),
        provenanceJson: JSON.stringify({ aircraft: { provenance: [] } }),
      },
    ]);

    expect(summary.readiness).toBe("Ready to Review");
    expect(summary.counts.readyToApprove).toBe(1);
    expect(summary.documents["doc-1"]?.readyToApprove).toBe(true);
    expect(summary.documents["doc-2"]?.readyToApprove).toBe(false);
  });

  it("treats manually verified and rationale-accepted fields as resolved blockers", () => {
    const summary = deriveReviewerCockpitSummary([
      {
        id: "doc-1",
        documentType: "8130-3",
        status: "pending_review",
        lowConfidenceFields: JSON.stringify(["block6b", "block7"]),
        verificationJson: JSON.stringify({
          documentReviews: [{ issues: [{ severity: "critical", field: "block6b" }] }],
        }),
        evidenceLineage: JSON.stringify({
          block6b: { source: "audio" },
          block7: { source: "video" },
        }),
        provenanceJson: JSON.stringify({
          block6b: {
            discrepancy: {
              detected: true,
              field: "block6b",
              description: "OCR and narration disagree on the part number.",
            },
          },
        }),
        reviewNotes: JSON.stringify({
          fieldDispositions: {
            block6b: {
              status: "accepted_with_rationale",
              rationale: "Photo plate check confirms the stamped number.",
              updatedAt: "2026-03-06T12:00:00.000Z",
            },
            block7: {
              status: "manually_verified",
              rationale: null,
              updatedAt: "2026-03-06T12:05:00.000Z",
            },
          },
        }),
      },
    ]);

    expect(summary.readiness).toBe("Ready to Review");
    expect(summary.counts.highRiskFields).toBe(0);
    expect(summary.documents["doc-1"]?.criticalIssueCount).toBe(0);
    expect(summary.documents["doc-1"]?.provenanceDiscrepancyCount).toBe(0);
    expect(summary.documents["doc-1"]?.readyToApprove).toBe(true);
  });

  it("keeps requested-evidence fields as active blockers", () => {
    const summary = deriveReviewerCockpitSummary([
      {
        id: "doc-1",
        documentType: "8130-3",
        status: "pending_review",
        lowConfidenceFields: JSON.stringify([]),
        verificationJson: JSON.stringify({ issues: [] }),
        evidenceLineage: JSON.stringify({ block8: { source: "photo" } }),
        provenanceJson: JSON.stringify({ block8: { provenance: [] } }),
        reviewNotes: JSON.stringify({
          fieldDispositions: {
            block8: {
              status: "needs_additional_evidence",
              rationale: "Need a clearer data plate photo before signoff.",
              updatedAt: "2026-03-06T12:10:00.000Z",
            },
          },
        }),
      },
    ]);

    expect(summary.documents["doc-1"]?.blockerCount).toBe(1);
    expect(summary.documents["doc-1"]?.readyToApprove).toBe(false);
    expect(
      summary.blockers.find((blocker) => blocker.kind === "needs_additional_evidence")?.fieldKey
    ).toBe("block8");
  });
});
