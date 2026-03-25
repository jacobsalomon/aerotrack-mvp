// Shared types for photo evidence across inspection components

export interface PhotoEvidence {
  id: string;
  fileUrl: string;
  inspectionItemId: string | null;
  instanceIndex: number | null;
  capturedAt: string;
}
