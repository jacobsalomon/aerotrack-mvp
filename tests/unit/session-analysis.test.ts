import { describe, expect, it } from "vitest";
import { normalizeProcedureSteps } from "@/lib/session-analysis";

describe("normalizeProcedureSteps", () => {
  it("maps legacy status-based procedure steps into completed booleans", () => {
    const steps = normalizeProcedureSteps([
      {
        step: 1,
        description: "Visual inspection",
        status: "completed",
        cmmRef: "CMM 72-00-00 Section 6.1",
      },
      {
        step: 2,
        description: "Dimensional check",
        status: "pending",
      },
    ]);

    expect(steps).toEqual([
      {
        stepNumber: 1,
        description: "Visual inspection",
        completed: true,
        cmmReference: "CMM 72-00-00 Section 6.1",
      },
      {
        stepNumber: 2,
        description: "Dimensional check",
        completed: false,
        cmmReference: undefined,
      },
    ]);
  });

  it("falls back to index-based numbering and a safe description", () => {
    const steps = normalizeProcedureSteps([
      {
        completed: true,
      },
    ]);

    expect(steps).toEqual([
      {
        stepNumber: 1,
        description: "Unnamed procedure step",
        completed: true,
        cmmReference: undefined,
      },
    ]);
  });
});
