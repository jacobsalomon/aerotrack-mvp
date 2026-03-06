export type FieldDispositionStatus =
  | "manually_verified"
  | "accepted_with_rationale"
  | "needs_additional_evidence";

export interface FieldDispositionRecord {
  status: FieldDispositionStatus;
  rationale: string | null;
  updatedAt: string;
}

export interface DocumentReviewState {
  rejectionNote: string | null;
  fieldDispositions: Record<string, FieldDispositionRecord>;
}

const EMPTY_REVIEW_STATE: DocumentReviewState = {
  rejectionNote: null,
  fieldDispositions: {},
};

function isFieldDispositionStatus(value: unknown): value is FieldDispositionStatus {
  return (
    value === "manually_verified" ||
    value === "accepted_with_rationale" ||
    value === "needs_additional_evidence"
  );
}

function normalizeDispositionRecord(value: unknown): FieldDispositionRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (!isFieldDispositionStatus(candidate.status)) return null;

  return {
    status: candidate.status,
    rationale: typeof candidate.rationale === "string" && candidate.rationale.trim()
      ? candidate.rationale.trim()
      : null,
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : new Date(0).toISOString(),
  };
}

export function parseDocumentReviewState(reviewNotes: string | null): DocumentReviewState {
  if (!reviewNotes) return EMPTY_REVIEW_STATE;

  try {
    const payload = JSON.parse(reviewNotes) as Record<string, unknown>;
    const rawFieldDispositions =
      payload.fieldDispositions && typeof payload.fieldDispositions === "object"
        ? (payload.fieldDispositions as Record<string, unknown>)
        : {};

    const fieldDispositions = Object.fromEntries(
      Object.entries(rawFieldDispositions)
        .map(([fieldKey, value]) => [fieldKey, normalizeDispositionRecord(value)] as const)
        .filter((entry): entry is [string, FieldDispositionRecord] => !!entry[1])
    );

    return {
      rejectionNote:
        typeof payload.rejectionNote === "string" && payload.rejectionNote.trim()
          ? payload.rejectionNote.trim()
          : null,
      fieldDispositions,
    };
  } catch {
    return {
      rejectionNote: reviewNotes,
      fieldDispositions: {},
    };
  }
}

export function serializeDocumentReviewState(state: DocumentReviewState): string | null {
  const rejectionNote = state.rejectionNote?.trim() || null;
  const fieldDispositions = Object.fromEntries(
    Object.entries(state.fieldDispositions)
      .map(([fieldKey, value]) => [fieldKey, normalizeDispositionRecord(value)] as const)
      .filter((entry): entry is [string, FieldDispositionRecord] => !!entry[1])
  );

  if (!rejectionNote && Object.keys(fieldDispositions).length === 0) {
    return null;
  }

  return JSON.stringify({
    rejectionNote,
    fieldDispositions,
  });
}

export function dispositionResolvesBlocker(
  disposition: FieldDispositionRecord | null | undefined
): boolean {
  return (
    disposition?.status === "manually_verified" ||
    disposition?.status === "accepted_with_rationale"
  );
}

export function dispositionRequestsEvidence(
  disposition: FieldDispositionRecord | null | undefined
): boolean {
  return disposition?.status === "needs_additional_evidence";
}

export function getDispositionLabel(status: FieldDispositionStatus): string {
  switch (status) {
    case "manually_verified":
      return "Manually verified";
    case "accepted_with_rationale":
      return "Accepted with rationale";
    case "needs_additional_evidence":
      return "Needs more evidence";
  }
}
