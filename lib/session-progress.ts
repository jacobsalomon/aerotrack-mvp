export const INTERNAL_JOB_STAGE_VALUES = [
  "queued",
  "analyzing",
  "drafting",
  "verifying",
  "packaging",
  "completed",
  "failed",
] as const;

export const PROCESSING_STAGE_SEQUENCE = [
  "analyzing",
  "drafting",
  "verifying",
  "packaging",
] as const;

export const STAGE_RUNTIME_STATUS_VALUES = [
  "queued",
  "in_progress",
  "completed",
  "failed",
] as const;

export const USER_FACING_PROGRESS_STATE_VALUES = [
  "Captured",
  "Drafting",
  "Verified",
  "Packaged",
] as const;

export type InternalJobStage = (typeof INTERNAL_JOB_STAGE_VALUES)[number];
export type ProcessingStageName = (typeof PROCESSING_STAGE_SEQUENCE)[number];
export type StageRuntimeStatus = (typeof STAGE_RUNTIME_STATUS_VALUES)[number];
export type UserFacingProgressState =
  (typeof USER_FACING_PROGRESS_STATE_VALUES)[number];

export interface SessionPackageArtifact {
  id: string;
  packageType: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProcessingStageRecord {
  stage: string;
  status: string;
  attemptCount: number;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  lastError: string | null;
  errorMetadata: unknown;
  latencyMs: number | null;
}

export interface SessionProgressSnapshot {
  userFacingState: UserFacingProgressState | null;
  internalStage: InternalJobStage | null;
  running: boolean;
  terminal: boolean;
  failed: boolean;
  failedStage: string | null;
  lastError: string | null;
  queuedAt: Date | string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  reviewStatus: "submitted" | "approved" | "rejected" | null;
  stages: ProcessingStageRecord[];
  packageArtifact: SessionPackageArtifact | null;
}

interface SessionLike {
  status: string;
}

interface JobLike {
  currentStage: string;
  userFacingState?: string | null;
  queuedAt?: Date | string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  failedAt?: Date | string | null;
  lastError?: string | null;
  lastErrorStage?: string | null;
  stages?: ProcessingStageRecord[];
}

function isInternalStage(value: string | null | undefined): value is InternalJobStage {
  return !!value && (INTERNAL_JOB_STAGE_VALUES as readonly string[]).includes(value);
}

export function mapStageToUserFacingState(
  stage: string | null | undefined
): UserFacingProgressState | null {
  switch (stage) {
    case "queued":
    case "analyzing":
      return "Captured";
    case "drafting":
      return "Drafting";
    case "verifying":
      return "Verified";
    case "packaging":
    case "completed":
      return "Packaged";
    case "failed":
    default:
      return null;
  }
}

export function mapLegacyStatusToProgressState(
  status: string
): UserFacingProgressState | null {
  switch (status) {
    case "capture_complete":
      return "Captured";
    case "processing":
    case "analysis_complete":
    case "documents_generated":
      return "Drafting";
    case "verified":
    case "submitted":
    case "approved":
    case "rejected":
      return "Verified";
    case "completed":
      return "Packaged";
    default:
      return null;
  }
}

export function deriveLegacyInternalStage(status: string): InternalJobStage | null {
  switch (status) {
    case "capture_complete":
      return "queued";
    case "processing":
      return "analyzing";
    case "analysis_complete":
    case "documents_generated":
      return "drafting";
    case "verified":
    case "submitted":
    case "approved":
    case "rejected":
      return "verifying";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export function shouldPollSessionProgress(
  progress:
    | Pick<SessionProgressSnapshot, "running" | "terminal">
    | null
    | undefined
): boolean {
  if (!progress) return false;
  return progress.running && !progress.terminal;
}

export function buildSessionProgressSnapshot(args: {
  session: SessionLike;
  job?: JobLike | null;
  packageArtifact?: SessionPackageArtifact | null;
}): SessionProgressSnapshot | null {
  const { session, job, packageArtifact } = args;

  const reviewStatus =
    session.status === "submitted" ||
    session.status === "approved" ||
    session.status === "rejected"
      ? session.status
      : null;
  const reviewTerminal =
    reviewStatus === "approved" || reviewStatus === "rejected";

  if (!job) {
    const internalStage = deriveLegacyInternalStage(session.status);
    const userFacingState =
      mapLegacyStatusToProgressState(session.status) ??
      mapStageToUserFacingState(internalStage);

    if (!internalStage && !userFacingState) {
      return null;
    }

    return {
      userFacingState,
      internalStage,
      running:
        internalStage !== null &&
        internalStage !== "completed" &&
        internalStage !== "failed" &&
        !reviewTerminal,
      terminal:
        internalStage === "completed" ||
        internalStage === "failed" ||
        reviewTerminal,
      failed: internalStage === "failed",
      failedStage: internalStage === "failed" ? "unknown" : null,
      lastError: null,
      queuedAt: null,
      startedAt: null,
      completedAt: null,
      reviewStatus,
      stages: [],
      packageArtifact: packageArtifact ?? null,
    };
  }

  const internalStage = isInternalStage(job.currentStage)
    ? job.currentStage
    : null;
  const failedStage = job.lastErrorStage ?? null;
  const derivedUserFacingState =
    (job.userFacingState as UserFacingProgressState | null | undefined) ??
    mapStageToUserFacingState(job.currentStage) ??
    mapStageToUserFacingState(failedStage);

  return {
    userFacingState: derivedUserFacingState ?? mapLegacyStatusToProgressState(session.status),
    internalStage,
    running:
      internalStage !== "completed" &&
      internalStage !== "failed" &&
      !reviewTerminal,
    terminal:
      internalStage === "completed" ||
      internalStage === "failed" ||
      reviewTerminal,
    failed: internalStage === "failed",
    failedStage,
    lastError: job.lastError ?? null,
    queuedAt: job.queuedAt ?? null,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? job.failedAt ?? null,
    reviewStatus,
    stages: job.stages ?? [],
    packageArtifact: packageArtifact ?? null,
  };
}

export function decorateSessionWithProgress<
  T extends SessionLike & {
    processingJob?: JobLike | null;
    packages?: SessionPackageArtifact[];
  },
>(session: T): T & { processingProgress: SessionProgressSnapshot | null } {
  return {
    ...session,
    processingProgress: buildSessionProgressSnapshot({
      session,
      job: session.processingJob,
      packageArtifact: session.packages?.[0] ?? null,
    }),
  };
}
