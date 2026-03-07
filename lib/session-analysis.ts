export interface ProcedureStepInput {
  stepNumber?: number;
  step?: number;
  description?: string;
  completed?: boolean;
  status?: string;
  cmmReference?: string;
  cmmRef?: string;
}

export interface ProcedureStep {
  stepNumber: number;
  description: string;
  completed: boolean;
  cmmReference?: string;
}

export function normalizeProcedureSteps(
  steps: ProcedureStepInput[] | null
): ProcedureStep[] | null {
  if (!steps) return null;

  return steps.map((step, index) => {
    const normalizedStatus = step.status?.toLowerCase().trim();

    return {
      stepNumber: step.stepNumber ?? step.step ?? index + 1,
      description: step.description || "Unnamed procedure step",
      completed:
        step.completed === true ||
        normalizedStatus === "completed" ||
        normalizedStatus === "complete" ||
        normalizedStatus === "done",
      cmmReference: step.cmmReference ?? step.cmmRef,
    };
  });
}
