// ERP export — generates a structured JSON payload of all shift measurements
// Ready for import into an ERP system (SAP, Oracle, etc.)

import { prisma } from "@/lib/db";
import { buildShiftTranscript, canExportShiftToQuantum } from "@/lib/shift-transcript";

export interface ErpExportPayload {
  exportVersion: string;
  exportedAt: string;
  shift: {
    id: string;
    technicianBadge: string;
    technicianName: string;
    startedAt: string;
    endedAt: string | null;
    durationMinutes: number | null;
    specName: string | null;
  };
  transcript: {
    status: string;
    approvedAt: string;
    approvedBy: string;
    text: string;
  };
  measurements: Array<{
    sequenceNumber: number;
    parameterName: string;
    measurementType: string;
    value: number;
    unit: string;
    status: string;
    inTolerance: boolean | null;
    nominalValue: number | null;
    toleranceLow: number | null;
    toleranceHigh: number | null;
    confidence: number;
    corroborationLevel: string;
    sources: Array<{
      sourceType: string;
      value: number;
      unit: string;
      confidence: number;
    }>;
    componentPartNumber: string | null;
    componentSerialNumber: string | null;
    procedureStep: string | null;
    taskCardRef: string | null;
    measuredAt: string;
  }>;
  summary: {
    totalMeasurements: number;
    confirmed: number;
    flagged: number;
    outOfTolerance: number;
    overridden: number;
  };
}

export async function generateErpExport(shiftId: string): Promise<ErpExportPayload> {
  const shift = await prisma.shiftSession.findUnique({
    where: { id: shiftId },
    include: {
      technician: { select: { firstName: true, lastName: true, badgeNumber: true } },
      measurementSpec: { select: { name: true } },
      transcriptChunks: {
        select: {
          transcript: true,
          source: true,
          startedAt: true,
          createdAt: true,
          durationSeconds: true,
        },
        orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!shift) throw new Error("Shift not found");

  const transcriptText = buildShiftTranscript({
    transcriptDraft: shift.transcriptDraft,
    transcriptChunks: shift.transcriptChunks,
  });

  if (
    !canExportShiftToQuantum({
      status: shift.status,
      transcriptReviewStatus: shift.transcriptReviewStatus,
      transcriptText,
    }) ||
    !shift.transcriptApprovedAt ||
    !shift.transcriptApprovedBy
  ) {
    throw new Error("Transcript approval is required before exporting to Quantum");
  }

  const measurements = await prisma.measurement.findMany({
    where: { shiftSessionId: shiftId },
    include: {
      sources: { select: { sourceType: true, value: true, unit: true, confidence: true } },
      component: { select: { partNumber: true, serialNumber: true } },
    },
    orderBy: { sequenceInShift: "asc" },
  });

  // Count by status
  const statusCounts = { confirmed: 0, flagged: 0, outOfTolerance: 0, overridden: 0 };
  for (const m of measurements) {
    if (m.status === "confirmed") statusCounts.confirmed++;
    if (m.status === "flagged") statusCounts.flagged++;
    if (m.status === "out_of_tolerance") statusCounts.outOfTolerance++;
    if (m.status === "overridden") statusCounts.overridden++;
  }

  return {
    exportVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    shift: {
      id: shift.id,
      technicianBadge: shift.technician.badgeNumber,
      technicianName: `${shift.technician.firstName} ${shift.technician.lastName}`,
      startedAt: shift.startedAt.toISOString(),
      endedAt: shift.endedAt?.toISOString() || null,
      durationMinutes: shift.totalDurationMin,
      specName: shift.measurementSpec?.name || null,
    },
    transcript: {
      status: shift.transcriptReviewStatus,
      approvedAt: shift.transcriptApprovedAt.toISOString(),
      approvedBy: shift.transcriptApprovedBy,
      text: transcriptText,
    },
    measurements: measurements.map((m) => ({
      sequenceNumber: m.sequenceInShift || 0,
      parameterName: m.parameterName,
      measurementType: m.measurementType,
      value: m.value,
      unit: m.unit,
      status: m.status,
      inTolerance: m.inTolerance,
      nominalValue: m.nominalValue,
      toleranceLow: m.toleranceLow,
      toleranceHigh: m.toleranceHigh,
      confidence: m.confidence,
      corroborationLevel: m.corroborationLevel,
      sources: m.sources,
      componentPartNumber: m.component?.partNumber || null,
      componentSerialNumber: m.component?.serialNumber || null,
      procedureStep: m.procedureStep,
      taskCardRef: m.taskCardRef,
      measuredAt: m.measuredAt.toISOString(),
    })),
    summary: {
      totalMeasurements: measurements.length,
      ...statusCounts,
    },
  };
}
