import { describe, expect, it } from "vitest";
import {
  buildSessionProgressSnapshot,
  mapLegacyStatusToProgressState,
  mapStageToUserFacingState,
} from "@/lib/session-progress";

describe("session progress helpers", () => {
  it("maps internal stages to user-facing states", () => {
    expect(mapStageToUserFacingState("queued")).toBe("Captured");
    expect(mapStageToUserFacingState("drafting")).toBe("Drafting");
    expect(mapStageToUserFacingState("verifying")).toBe("Verified");
    expect(mapStageToUserFacingState("completed")).toBe("Packaged");
  });

  it("maps legacy statuses to the progressive vocabulary", () => {
    expect(mapLegacyStatusToProgressState("capture_complete")).toBe("Captured");
    expect(mapLegacyStatusToProgressState("documents_generated")).toBe("Drafting");
    expect(mapLegacyStatusToProgressState("verified")).toBe("Verified");
    expect(mapLegacyStatusToProgressState("completed")).toBe("Packaged");
  });

  it("builds a failed snapshot with stage metadata", () => {
    const progress = buildSessionProgressSnapshot({
      session: { status: "failed" },
      job: {
        currentStage: "failed",
        userFacingState: "Verified",
        lastError: "Verification model timeout",
        lastErrorStage: "verifying",
        stages: [],
      },
    });

    expect(progress).toMatchObject({
      failed: true,
      failedStage: "verifying",
      userFacingState: "Verified",
      lastError: "Verification model timeout",
    });
  });

  it("treats approved and rejected review states as terminal even without a job row", () => {
    const rejected = buildSessionProgressSnapshot({
      session: { status: "rejected" },
    });
    const approved = buildSessionProgressSnapshot({
      session: { status: "approved" },
    });

    expect(rejected).toMatchObject({
      userFacingState: "Verified",
      reviewStatus: "rejected",
      running: false,
      terminal: true,
    });
    expect(approved).toMatchObject({
      userFacingState: "Verified",
      reviewStatus: "approved",
      running: false,
      terminal: true,
    });
  });
});
