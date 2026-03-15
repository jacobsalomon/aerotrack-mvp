// Shift session business logic
// Handles starting, pausing, resuming, and ending work shifts.
// A shift is an 8-12 hour work session — the container for all measurements.

import { prisma } from "@/lib/db";

// Start a new shift for a technician
export async function startShift({
  technicianId,
  organizationId,
  measurementSpecId,
  notes,
}: {
  technicianId: string;
  organizationId: string;
  measurementSpecId?: string;
  notes?: string;
}) {
  // Check for an already-active shift for this technician
  const activeShift = await prisma.shiftSession.findFirst({
    where: { technicianId, status: { in: ["active", "paused"] } },
  });

  if (activeShift) {
    throw new Error(`Technician already has an active shift (${activeShift.id}). End it first.`);
  }

  // If a spec was chosen, verify it exists and belongs to the same org
  if (measurementSpecId) {
    const spec = await prisma.measurementSpec.findUnique({
      where: { id: measurementSpecId },
    });
    if (!spec || spec.organizationId !== organizationId) {
      throw new Error("Measurement spec not found");
    }
    if (spec.status !== "active") {
      throw new Error("Measurement spec must be active to use in a shift");
    }
  }

  return prisma.shiftSession.create({
    data: {
      technicianId,
      organizationId,
      measurementSpecId: measurementSpecId || null,
      notes: notes || null,
    },
    include: {
      measurementSpec: true,
      technician: { select: { firstName: true, lastName: true, badgeNumber: true } },
    },
  });
}

// Pause an active shift (e.g., lunch break)
export async function pauseShift(shiftId: string, technicianId: string) {
  const shift = await getOwnedShift(shiftId, technicianId);
  if (shift.status !== "active") {
    throw new Error(`Cannot pause a shift that is ${shift.status}`);
  }

  return prisma.shiftSession.update({
    where: { id: shiftId },
    data: { status: "paused" },
  });
}

// Resume a paused shift
export async function resumeShift(shiftId: string, technicianId: string) {
  const shift = await getOwnedShift(shiftId, technicianId);
  if (shift.status !== "paused") {
    throw new Error(`Cannot resume a shift that is ${shift.status}`);
  }

  return prisma.shiftSession.update({
    where: { id: shiftId },
    data: { status: "active" },
  });
}

// End a shift — computes total duration
export async function endShift(shiftId: string, technicianId: string) {
  const shift = await getOwnedShift(shiftId, technicianId);
  if (shift.status === "completed") {
    throw new Error("Shift is already completed");
  }

  const endedAt = new Date();
  const durationMs = endedAt.getTime() - shift.startedAt.getTime();
  const totalDurationMin = Math.round(durationMs / 60000);

  return prisma.shiftSession.update({
    where: { id: shiftId },
    data: {
      status: "completed",
      endedAt,
      totalDurationMin,
    },
  });
}

// Get shift detail with measurement counts
// organizationId is optional — pass it for mobile API (scoped to org), omit for web dashboard
export async function getShiftDetail(shiftId: string, organizationId?: string) {
  const shift = await prisma.shiftSession.findUnique({
    where: { id: shiftId },
    include: {
      technician: { select: { firstName: true, lastName: true, badgeNumber: true } },
      measurementSpec: true,
      _count: {
        select: { measurements: true, captureSessions: true },
      },
    },
  });

  if (!shift) return null;
  if (organizationId && shift.organizationId !== organizationId) return null;

  // Get measurement status breakdown
  const measurements = await prisma.measurement.groupBy({
    by: ["status"],
    where: { shiftSessionId: shiftId },
    _count: true,
  });

  const statusCounts = Object.fromEntries(
    measurements.map((m) => [m.status, m._count])
  );

  return {
    ...shift,
    specItems: shift.measurementSpec
      ? JSON.parse(shift.measurementSpec.specItemsJson)
      : null,
    measurementStatusCounts: statusCounts,
  };
}

// Helper — fetch a shift and verify the technician owns it
async function getOwnedShift(shiftId: string, technicianId: string) {
  const shift = await prisma.shiftSession.findUnique({
    where: { id: shiftId },
  });

  if (!shift) {
    throw new Error("Shift not found");
  }
  if (shift.technicianId !== technicianId) {
    throw new Error("Not authorized for this shift");
  }

  return shift;
}
