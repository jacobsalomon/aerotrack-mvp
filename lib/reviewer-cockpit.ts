import {
  dispositionRequestsEvidence,
  dispositionResolvesBlocker,
  parseDocumentReviewState,
} from "@/lib/document-review-state";
import { safeParseJson } from "@/lib/utils";

export interface ReviewerDocumentInput {
  id: string;
  documentType: string;
  status: string;
  lowConfidenceFields: string | null;
  verificationJson: string | null;
  evidenceLineage: string | null;
  provenanceJson?: string | null;
  reviewNotes?: string | null;
}

export interface ReviewerDocumentSummary {
  docId: string;
  lowConfidenceCount: number;
  verificationIssueCount: number;
  criticalIssueCount: number;
  provenanceFieldCount: number;
  provenanceDiscrepancyCount: number;
  blockerCount: number;
  readyToApprove: boolean;
}

export interface ReviewerBlocker {
  id: string;
  docId: string;
  kind:
    | "rejected"
    | "critical_issue"
    | "low_confidence"
    | "provenance_discrepancy"
    | "needs_additional_evidence"
    | "pending_review";
  severity: "critical" | "warning" | "info";
  message: string;
  fieldKey: string | null;
}

export interface ReviewerCockpitSummary {
  readiness:
    | "Awaiting Documents"
    | "Ready to Review"
    | "Blocked"
    | "Review Complete";
  nextDocumentId: string | null;
  counts: {
    totalDocuments: number;
    pendingReview: number;
    approved: number;
    rejected: number;
    highRiskFields: number;
    verificationIssues: number;
    docsWithBlockers: number;
    readyToApprove: number;
  };
  blockers: ReviewerBlocker[];
  documents: Record<string, ReviewerDocumentSummary>;
}

interface VerificationIssue {
  field?: string;
  severity?: "info" | "warning" | "critical";
}

interface VerificationPayload {
  issues?: VerificationIssue[];
  documentReviews?: Array<{
    issues?: VerificationIssue[];
  }>;
}

interface ProvenanceDiscrepancyValue {
  field?: string;
  description?: string;
  detected?: boolean;
}

interface ProvenanceFieldPayload {
  discrepancy?: ProvenanceDiscrepancyValue | null;
  discrepancies?: ProvenanceDiscrepancyValue[] | null;
}

function gatherVerificationIssues(payload: VerificationPayload | null): VerificationIssue[] {
  if (!payload) return [];

  const directIssues = payload.issues || [];
  const reviewIssues = (payload.documentReviews || []).flatMap((review) => review.issues || []);
  return [...directIssues, ...reviewIssues];
}

function blockerSeverityRank(severity: ReviewerBlocker["severity"]): number {
  switch (severity) {
    case "critical":
      return 0;
    case "warning":
      return 1;
    default:
      return 2;
  }
}

function gatherProvenanceDiscrepancies(
  provenancePayload: Record<string, ProvenanceFieldPayload> | null
): Array<{ field: string; description: string }> {
  if (!provenancePayload) return [];

  return Object.entries(provenancePayload).flatMap(([field, entry]) => {
    const direct = entry?.discrepancy;
    const list = entry?.discrepancies || [];
    const normalized: Array<{ field: string; description: string }> = [];

    if (direct?.detected || direct?.description) {
      normalized.push({
        field: direct.field || field,
        description: direct.description || "Provenance discrepancy requires reviewer attention.",
      });
    }

    for (const discrepancy of list) {
      if (discrepancy?.detected || discrepancy?.description) {
        normalized.push({
          field: discrepancy.field || field,
          description: discrepancy.description || "Provenance discrepancy requires reviewer attention.",
        });
      }
    }

    return normalized;
  });
}

export function deriveReviewerCockpitSummary(
  documents: ReviewerDocumentInput[]
): ReviewerCockpitSummary {
  const summaries: Record<string, ReviewerDocumentSummary> = {};
  const blockers: ReviewerBlocker[] = [];

  let approved = 0;
  let rejected = 0;
  let pendingReview = 0;
  let highRiskFields = 0;
  let verificationIssues = 0;
  let readyToApprove = 0;

  for (const document of documents) {
    const lowConfidenceFields = safeParseJson<string[]>(document.lowConfidenceFields, []);
    const verification = safeParseJson<VerificationPayload | null>(document.verificationJson, null);
    const lineage = safeParseJson<Record<string, unknown> | null>(document.evidenceLineage, null);
    const provenancePayload = safeParseJson<Record<string, ProvenanceFieldPayload> | null>(
      document.provenanceJson || null,
      null
    );
    const reviewState = parseDocumentReviewState(document.reviewNotes || null);
    const requestedEvidenceFields = Object.entries(reviewState.fieldDispositions)
      .filter(([, disposition]) => dispositionRequestsEvidence(disposition))
      .map(([fieldKey]) => fieldKey);
    const issues = gatherVerificationIssues(verification);
    const provenanceDiscrepancies = gatherProvenanceDiscrepancies(provenancePayload);
    const unresolvedCriticalIssues = issues.filter(
      (issue) =>
        issue.severity === "critical" &&
        !(issue.field && dispositionResolvesBlocker(reviewState.fieldDispositions[issue.field]))
    );
    const unresolvedLowConfidenceFields = lowConfidenceFields.filter(
      (fieldKey) => !dispositionResolvesBlocker(reviewState.fieldDispositions[fieldKey])
    );
    const unresolvedProvenanceDiscrepancies = provenanceDiscrepancies.filter(
      (discrepancy) => !dispositionResolvesBlocker(reviewState.fieldDispositions[discrepancy.field])
    );
    const criticalIssueCount = unresolvedCriticalIssues.length;
    const provenanceFieldCount =
      provenancePayload ? Object.keys(provenancePayload).length : lineage ? Object.keys(lineage).length : 0;
    const provenanceDiscrepancyCount = unresolvedProvenanceDiscrepancies.length;
    const lowConfidenceCount = unresolvedLowConfidenceFields.length;
    const verificationIssueCount = issues.length;
    const firstCriticalField = unresolvedCriticalIssues.find((issue) => issue.field)?.field || null;
    const firstLowConfidenceField = unresolvedLowConfidenceFields[0] || null;
    const firstProvenanceDiscrepancy = unresolvedProvenanceDiscrepancies[0] || null;
    const firstRequestedEvidenceField = requestedEvidenceFields[0] || null;

    if (document.status === "approved") approved += 1;
    else if (document.status === "rejected") rejected += 1;
    else pendingReview += 1;

    highRiskFields += lowConfidenceCount;
    verificationIssues += verificationIssueCount;

    const blockerCount =
      (document.status === "rejected" ? 1 : 0) +
      (criticalIssueCount > 0 ? 1 : 0) +
      (lowConfidenceCount > 0 ? 1 : 0) +
      (provenanceDiscrepancyCount > 0 ? 1 : 0) +
      (requestedEvidenceFields.length > 0 ? 1 : 0);
    const readyForApproval =
      document.status !== "approved" &&
      document.status !== "rejected" &&
      blockerCount === 0;

    summaries[document.id] = {
      docId: document.id,
      lowConfidenceCount,
      verificationIssueCount,
      criticalIssueCount,
      provenanceFieldCount,
      provenanceDiscrepancyCount,
      blockerCount,
      readyToApprove: readyForApproval,
    };

    if (readyForApproval) {
      readyToApprove += 1;
    }

    if (document.status === "rejected") {
      blockers.push({
        id: `${document.id}-rejected`,
        docId: document.id,
        kind: "rejected",
        severity: "critical",
        message: "Document was rejected and requires correction before approval.",
        fieldKey: null,
      });
    }

    if (criticalIssueCount > 0) {
      blockers.push({
        id: `${document.id}-critical-issues`,
        docId: document.id,
        kind: "critical_issue",
        severity: "critical",
        message:
          criticalIssueCount === 1
            ? "1 critical verification issue needs reviewer attention."
            : `${criticalIssueCount} critical verification issues need reviewer attention.`,
        fieldKey: firstCriticalField,
      });
    }

    if (lowConfidenceCount > 0) {
      blockers.push({
        id: `${document.id}-low-confidence`,
        docId: document.id,
        kind: "low_confidence",
        severity: "warning",
        message:
          lowConfidenceCount === 1
            ? "1 low-confidence field should be verified before approval."
            : `${lowConfidenceCount} low-confidence fields should be verified before approval.`,
        fieldKey: firstLowConfidenceField,
      });
    }

    if (provenanceDiscrepancyCount > 0) {
      blockers.push({
        id: `${document.id}-provenance-discrepancy`,
        docId: document.id,
        kind: "provenance_discrepancy",
        severity: "warning",
        message:
          provenanceDiscrepancyCount === 1
            ? firstProvenanceDiscrepancy?.description || "1 provenance discrepancy should be resolved before approval."
            : `${provenanceDiscrepancyCount} provenance discrepancies should be resolved before approval.`,
        fieldKey: firstProvenanceDiscrepancy?.field || null,
      });
    }

    if (requestedEvidenceFields.length > 0) {
      blockers.push({
        id: `${document.id}-needs-additional-evidence`,
        docId: document.id,
        kind: "needs_additional_evidence",
        severity: "warning",
        message:
          requestedEvidenceFields.length === 1
            ? "1 field is awaiting additional evidence before approval."
            : `${requestedEvidenceFields.length} fields are awaiting additional evidence before approval.`,
        fieldKey: firstRequestedEvidenceField,
      });
    }

    if (document.status !== "approved" && document.status !== "rejected") {
      blockers.push({
        id: `${document.id}-pending-review`,
        docId: document.id,
        kind: "pending_review",
        severity: blockerCount > 0 ? "warning" : "info",
        message:
          blockerCount > 0
            ? "Document remains pending review with unresolved attention items."
            : "Document is ready for reviewer approval.",
        fieldKey: null,
      });
    }
  }

  blockers.sort((left, right) => blockerSeverityRank(left.severity) - blockerSeverityRank(right.severity));

  const docsWithBlockers = Object.values(summaries).filter((summary) => summary.blockerCount > 0).length;

  let readiness: ReviewerCockpitSummary["readiness"];
  if (documents.length === 0) {
    readiness = "Awaiting Documents";
  } else if (approved === documents.length && rejected === 0 && docsWithBlockers === 0) {
    readiness = "Review Complete";
  } else if (rejected > 0 || blockers.some((blocker) => blocker.severity === "critical")) {
    readiness = "Blocked";
  } else {
    readiness = "Ready to Review";
  }

  const nextDocumentId =
    documents.find((document) => document.status !== "approved" && document.status !== "rejected")?.id ||
    documents.find((document) => summaries[document.id]?.blockerCount > 0)?.id ||
    documents[0]?.id ||
    null;

  return {
    readiness,
    nextDocumentId,
    counts: {
      totalDocuments: documents.length,
      pendingReview,
      approved,
      rejected,
      highRiskFields,
      verificationIssues,
      docsWithBlockers,
      readyToApprove,
    },
    blockers,
    documents: summaries,
  };
}
