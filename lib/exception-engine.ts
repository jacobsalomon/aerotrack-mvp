// ──────────────────────────────────────────────────────
// Exception Detection Engine
//
// This is the brain of AeroVision's data integrity system.
// It scans a component's complete history — every event, document,
// and certificate — looking for inconsistencies that humans miss.
//
// Think of it like a forensic auditor going through financial records:
// it checks that numbers add up, timelines make sense, and all the
// required paperwork is present.
//
// ProvenAir found 10,000+ errors doing exactly this kind of analysis.
// ──────────────────────────────────────────────────────

import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────

// The shape of a component with all its related data loaded
interface ComponentWithRelations {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  manufactureDate: Date;
  status: string;
  events: EventWithRelations[];
  documents: DocumentRecord[];
  exceptions: ExceptionRecord[];
}

interface EventWithRelations {
  id: string;
  eventType: string;
  date: Date;
  facility: string;
  facilityType: string;
  facilityCert: string | null;
  performer: string;
  description: string;
  hoursAtEvent: number | null;
  cyclesAtEvent: number | null;
  aircraft: string | null;
  operator: string | null;
  workOrderRef: string | null;
  generatedDocs: GeneratedDocRecord[];
}

interface GeneratedDocRecord {
  id: string;
  docType: string;
  status: string;
  createdAt: Date;
}

interface DocumentRecord {
  id: string;
  docType: string;
  title: string;
  createdAt: Date;
}

interface ExceptionRecord {
  id: string;
  exceptionType: string;
  evidence: string;
  status: string;
}

// What each detection function returns before we save it
interface DetectedIssue {
  exceptionType: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  evidence: Record<string, unknown>;
}

// ── Main Entry Points ────────────────────────────────

/**
 * Scan a single component for all types of exceptions.
 * Fetches the component with all related data, runs every check,
 * and creates Exception records for any new findings.
 */
export async function scanComponent(componentId: string) {
  // 1. Load the component with everything we need
  const component = await prisma.component.findUnique({
    where: { id: componentId },
    include: {
      events: {
        include: { generatedDocs: true },
        orderBy: { date: "asc" },
      },
      documents: true,
      exceptions: true,
    },
  });

  if (!component) {
    throw new Error(`Component ${componentId} not found`);
  }

  // 2. Run all detection checks
  const issues: DetectedIssue[] = [
    ...checkCycleCountDiscrepancy(component as unknown as ComponentWithRelations),
    ...checkHourCountDiscrepancy(component as unknown as ComponentWithRelations),
    ...checkDocumentationGaps(component as unknown as ComponentWithRelations),
    ...checkMissingReleaseCertificate(component as unknown as ComponentWithRelations),
    ...checkMissingBirthCertificate(component as unknown as ComponentWithRelations),
    ...checkDateInconsistency(component as unknown as ComponentWithRelations),
    ...checkUnsignedDocuments(component as unknown as ComponentWithRelations),
    ...checkFacilityCertMissing(component as unknown as ComponentWithRelations),
  ];

  // 3. Create Exception records for new findings (avoid duplicates)
  const existingExceptions = component.exceptions;
  const newExceptions = [];

  for (const issue of issues) {
    const evidenceStr = JSON.stringify(issue.evidence);

    // Check if this exact exception already exists (same type + same evidence)
    const alreadyExists = existingExceptions.some(
      (ex) =>
        ex.exceptionType === issue.exceptionType &&
        ex.evidence === evidenceStr &&
        ex.status !== "resolved" &&
        ex.status !== "false_positive"
    );

    if (!alreadyExists) {
      const created = await prisma.exception.create({
        data: {
          componentId,
          exceptionType: issue.exceptionType,
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          evidence: evidenceStr,
        },
      });
      newExceptions.push(created);
    }
  }

  // 4. Return all exceptions for this component (existing + new)
  const allExceptions = await prisma.exception.findMany({
    where: { componentId },
    orderBy: { detectedAt: "desc" },
  });

  return {
    exceptions: allExceptions,
    summary: {
      total: allExceptions.length,
      critical: allExceptions.filter((e) => e.severity === "critical").length,
      warning: allExceptions.filter((e) => e.severity === "warning").length,
      info: allExceptions.filter((e) => e.severity === "info").length,
      newlyDetected: newExceptions.length,
    },
  };
}

/**
 * Scan ALL components in the database.
 * Returns a summary of what was found across the entire fleet.
 */
export async function scanAllComponents() {
  const components = await prisma.component.findMany({ select: { id: true } });

  let totalExceptions = 0;
  let componentsWithExceptions = 0;
  const bySeverity = { critical: 0, warning: 0, info: 0 };

  for (const comp of components) {
    const result = await scanComponent(comp.id);
    if (result.exceptions.length > 0) {
      componentsWithExceptions++;
    }
    totalExceptions += result.exceptions.length;
    bySeverity.critical += result.summary.critical;
    bySeverity.warning += result.summary.warning;
    bySeverity.info += result.summary.info;
  }

  return {
    totalComponents: components.length,
    componentsWithExceptions,
    totalExceptions,
    bySeverity,
  };
}

// ── Detection Functions ──────────────────────────────
// Each function examines one aspect of the component's data
// and returns an array of issues found (empty if all clear).

/**
 * CHECK: Cycle counts should only go UP over time.
 * If cycles decrease between events, something is wrong — either
 * a data entry error or records from two different parts got mixed up.
 */
function checkCycleCountDiscrepancy(component: ComponentWithRelations): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const events = component.events.filter((e) => e.cyclesAtEvent != null);

  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    const currentCycles = current.cyclesAtEvent!;
    const nextCycles = next.cyclesAtEvent!;

    // Cycles went backward — something is definitely wrong
    if (nextCycles < currentCycles) {
      issues.push({
        exceptionType: "cycle_count_discrepancy",
        severity: "critical",
        title: "Cycle Count Decreased Between Events",
        description:
          `Cycle count decreased from ${currentCycles.toLocaleString()} at event on ` +
          `${formatDate(current.date)} to ${nextCycles.toLocaleString()} at event on ` +
          `${formatDate(next.date)}. Cycles should only increase over a component's life.`,
        evidence: {
          eventA: { id: current.id, date: current.date, cycles: currentCycles },
          eventB: { id: next.id, date: next.date, cycles: nextCycles },
          delta: nextCycles - currentCycles,
        },
      });
    }

    // Check for impossibly high cycle rate (>20 cycles/day)
    if (nextCycles > currentCycles) {
      const daysBetween = daysDiff(current.date, next.date);
      if (daysBetween > 0) {
        const cyclesPerDay = (nextCycles - currentCycles) / daysBetween;
        if (cyclesPerDay > 20) {
          issues.push({
            exceptionType: "cycle_count_discrepancy",
            severity: "warning",
            title: "Impossibly High Cycle Rate",
            description:
              `Implied cycle rate of ${cyclesPerDay.toFixed(1)} cycles/day between ` +
              `${formatDate(current.date)} and ${formatDate(next.date)}. ` +
              `Most components see 6-8 cycles/day in commercial service. ` +
              `This may indicate a data entry error.`,
            evidence: {
              eventA: { id: current.id, date: current.date, cycles: currentCycles },
              eventB: { id: next.id, date: next.date, cycles: nextCycles },
              cyclesPerDay: Math.round(cyclesPerDay * 10) / 10,
              daysBetween,
            },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * CHECK: Flight hours should only go UP over time.
 * Same logic as cycles but for hours.
 */
function checkHourCountDiscrepancy(component: ComponentWithRelations): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const events = component.events.filter((e) => e.hoursAtEvent != null);

  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    const currentHours = current.hoursAtEvent!;
    const nextHours = next.hoursAtEvent!;

    // Hours went backward
    if (nextHours < currentHours) {
      issues.push({
        exceptionType: "hour_count_discrepancy",
        severity: "critical",
        title: "Flight Hours Decreased Between Events",
        description:
          `Flight hours decreased from ${currentHours.toLocaleString()} at event on ` +
          `${formatDate(current.date)} to ${nextHours.toLocaleString()} at event on ` +
          `${formatDate(next.date)}. Hours should only increase.`,
        evidence: {
          eventA: { id: current.id, date: current.date, hours: currentHours },
          eventB: { id: next.id, date: next.date, hours: nextHours },
          delta: nextHours - currentHours,
        },
      });
    }

    // Impossibly high hour rate (>18 hours/day means the part is flying nonstop)
    if (nextHours > currentHours) {
      const daysBetween = daysDiff(current.date, next.date);
      if (daysBetween > 0) {
        const hoursPerDay = (nextHours - currentHours) / daysBetween;
        if (hoursPerDay > 18) {
          issues.push({
            exceptionType: "hour_count_discrepancy",
            severity: "warning",
            title: "Impossibly High Flight Hour Rate",
            description:
              `Implied flight rate of ${hoursPerDay.toFixed(1)} hours/day between ` +
              `${formatDate(current.date)} and ${formatDate(next.date)}. ` +
              `Commercial aircraft typically fly 10-14 hours/day.`,
            evidence: {
              eventA: { id: current.id, date: current.date, hours: currentHours },
              eventB: { id: next.id, date: next.date, hours: nextHours },
              hoursPerDay: Math.round(hoursPerDay * 10) / 10,
              daysBetween,
            },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * CHECK: Are there long gaps with no documentation?
 *
 * Important nuance: When a part is INSTALLED on an aircraft, it's normal
 * for months or years to pass before the next maintenance event — the part
 * is just flying in service. That's not a "gap."
 *
 * A TRUE documentation gap is when a part is NOT in service (after a remove,
 * transfer, or release_to_service) and time passes without explanation.
 * Where was the part? Who had it? This is where traceability breaks down.
 *
 * Thresholds:
 * - After a remove/transfer/release: >30 days = warning, >180 days = critical
 * - After an install (part is in service): only flag if next event changes
 *   facility without a remove (would be caught by date_inconsistency check)
 */
function checkDocumentationGaps(component: ComponentWithRelations): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const events = component.events;

  if (events.length < 2) return issues;

  // Event types where the part is in active service on an aircraft
  // After these events, long gaps are normal (the part is just flying)
  const inServiceEvents = new Set([
    "install", "detailed_inspection", "functional_test",
  ]);

  // Event types where a gap is suspicious — the part is off an aircraft
  // and should have a clear chain of custody
  const offAircraftEvents = new Set([
    "remove", "transfer", "release_to_service",
    "receiving_inspection", "manufacture",
  ]);

  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    const gapDays = daysDiff(current.date, next.date);

    // If the part is in service (installed or just inspected), skip
    // — long gaps are normal while a part is flying on an aircraft
    if (inServiceEvents.has(current.eventType)) continue;

    // For off-aircraft events, flag significant gaps
    // Use a longer threshold for events where warehouse/transit time is expected.
    // Parts often sit at distributors, OEMs, or after overhaul for months
    // before finding their next operator.
    const supplyChainEvents = new Set(["manufacture", "release_to_service", "transfer"]);
    const threshold = supplyChainEvents.has(current.eventType)
      ? 450  // 15 months is within normal range for supply chain
      : 30;  // 30 days for remove/receiving — those should have quick follow-up

    if (offAircraftEvents.has(current.eventType) && gapDays > threshold) {
      const severity = gapDays > 365 ? "critical" : gapDays > 180 ? "warning" : "warning";
      const months = Math.round(gapDays / 30);

      issues.push({
        exceptionType: "documentation_gap",
        severity,
        title: `Documentation Gap — ${months} Month${months !== 1 ? "s" : ""}`,
        description:
          `No records between ${current.eventType} at ${current.facility} on ` +
          `${formatDate(current.date)} and ${next.eventType} at ${next.facility} on ` +
          `${formatDate(next.date)}. ${gapDays} days unaccounted for.`,
        evidence: {
          eventBefore: { id: current.id, type: current.eventType, date: current.date, facility: current.facility },
          eventAfter: { id: next.id, type: next.eventType, date: next.date, facility: next.facility },
          gapDays,
          gapMonths: months,
        },
      });
    }
  }

  return issues;
}

/**
 * CHECK: Every repair/overhaul should have an 8130-3 release certificate.
 * Without one, the part can't legally return to service.
 */
function checkMissingReleaseCertificate(component: ComponentWithRelations): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const repairEventTypes = ["repair", "reassembly", "release_to_service", "final_inspection"];

  for (const event of component.events) {
    if (!repairEventTypes.includes(event.eventType)) continue;

    // Check if there's a generated 8130-3 linked to this event
    const hasGenerated8130 = event.generatedDocs.some(
      (d) => d.docType === "8130-3"
    );

    // Check if there's an uploaded 8130 document for this component
    // (within a reasonable time window of the event)
    const has8130Doc = component.documents.some(
      (d) => d.docType === "8130" || d.docType === "8130-3"
    );

    // Only flag if NEITHER exists
    // For release_to_service events, an 8130-3 is mandatory
    if (!hasGenerated8130 && !has8130Doc && event.eventType === "release_to_service") {
      issues.push({
        exceptionType: "missing_release_certificate",
        severity: "warning",
        title: "Missing Release Certificate (8130-3)",
        description:
          `Release-to-service event on ${formatDate(event.date)} at ${event.facility} ` +
          `has no associated FAA Form 8130-3 certificate. A release certificate is ` +
          `required for any part returning to service after repair or overhaul.`,
        evidence: {
          eventId: event.id,
          eventType: event.eventType,
          date: event.date,
          facility: event.facility,
        },
      });
    }
  }

  return issues;
}

/**
 * CHECK: Does the component have a birth certificate?
 * Every part should have a manufacture event AND a birth certificate document.
 */
function checkMissingBirthCertificate(component: ComponentWithRelations): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // Check for a manufacture event
  const hasManufactureEvent = component.events.some(
    (e) => e.eventType === "manufacture"
  );

  // Check for a birth certificate document
  const hasBirthCertDoc = component.documents.some(
    (d) => d.docType === "birth_certificate"
  );

  if (!hasManufactureEvent) {
    issues.push({
      exceptionType: "missing_birth_certificate",
      severity: "warning",
      title: "No Manufacture Event on Record",
      description:
        `Component ${component.partNumber} (${component.serialNumber}) has no ` +
        `manufacture event in its lifecycle history. Every traceable part should ` +
        `have a documented origin.`,
      evidence: {
        componentId: component.id,
        partNumber: component.partNumber,
        serialNumber: component.serialNumber,
      },
    });
  }

  if (!hasBirthCertDoc) {
    issues.push({
      exceptionType: "missing_birth_certificate",
      severity: "warning",
      title: "No Birth Certificate Document",
      description:
        `Component ${component.partNumber} (${component.serialNumber}) has no ` +
        `birth certificate (manufacturer's 8130-3) in its document library. ` +
        `Without an original equipment release certificate, the part's origin ` +
        `cannot be verified.`,
      evidence: {
        componentId: component.id,
        partNumber: component.partNumber,
        serialNumber: component.serialNumber,
        documentTypes: component.documents.map((d) => d.docType),
      },
    });
  }

  return issues;
}

/**
 * CHECK: Are events in chronological order?
 * Events should always progress forward in time.
 * Also checks for impossible sequences like two installs without a remove.
 */
function checkDateInconsistency(component: ComponentWithRelations): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const events = component.events;

  // Check chronological ordering
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];

    if (new Date(next.date) < new Date(current.date)) {
      issues.push({
        exceptionType: "date_inconsistency",
        severity: "critical",
        title: "Events Out of Chronological Order",
        description:
          `Event "${next.eventType}" on ${formatDate(next.date)} occurs before ` +
          `the previous event "${current.eventType}" on ${formatDate(current.date)}. ` +
          `Events should always be in chronological order.`,
        evidence: {
          eventA: { id: current.id, type: current.eventType, date: current.date },
          eventB: { id: next.id, type: next.eventType, date: next.date },
        },
      });
    }
  }

  // Check for double installs without a remove in between
  let lastInstallEvent: EventWithRelations | null = null;
  for (const event of events) {
    if (event.eventType === "install") {
      if (lastInstallEvent) {
        // Found two consecutive installs — was there a remove between them?
        const removeInBetween = events.some(
          (e) =>
            e.eventType === "remove" &&
            new Date(e.date) > new Date(lastInstallEvent!.date) &&
            new Date(e.date) < new Date(event.date)
        );

        if (!removeInBetween) {
          issues.push({
            exceptionType: "date_inconsistency",
            severity: "critical",
            title: "Consecutive Installations Without Removal",
            description:
              `Two install events found without an intervening removal. ` +
              `Installed at ${lastInstallEvent.facility} on ${formatDate(lastInstallEvent.date)}, ` +
              `then again at ${event.facility} on ${formatDate(event.date)}. ` +
              `A component cannot be installed on two aircraft simultaneously.`,
            evidence: {
              firstInstall: { id: lastInstallEvent.id, date: lastInstallEvent.date, facility: lastInstallEvent.facility },
              secondInstall: { id: event.id, date: event.date, facility: event.facility },
            },
          });
        }
      }
      lastInstallEvent = event;
    } else if (event.eventType === "remove") {
      lastInstallEvent = null;
    }
  }

  return issues;
}

/**
 * CHECK: Are there old draft documents that should have been signed?
 * A generated document sitting in "draft" for >30 days is suspicious.
 */
function checkUnsignedDocuments(component: ComponentWithRelations): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const event of component.events) {
    for (const doc of event.generatedDocs) {
      if (doc.status === "draft" && new Date(doc.createdAt) < thirtyDaysAgo) {
        issues.push({
          exceptionType: "unsigned_document",
          severity: "info",
          title: "Unsigned Document — Awaiting Approval",
          description:
            `A generated ${doc.docType} document for the ${event.eventType} event on ` +
            `${formatDate(event.date)} has been in "draft" status for more than 30 days. ` +
            `Documents should be reviewed and approved promptly.`,
          evidence: {
            documentId: doc.id,
            docType: doc.docType,
            eventId: event.id,
            eventType: event.eventType,
            createdAt: doc.createdAt,
          },
        });
      }
    }
  }

  return issues;
}

/**
 * CHECK: Do repair facilities have valid certificate numbers?
 * Any MRO doing work on a part should have a FAA Part 145 (or equivalent) certificate.
 */
function checkFacilityCertMissing(component: ComponentWithRelations): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const repairEventTypes = [
    "repair", "reassembly", "release_to_service",
    "functional_test", "detailed_inspection", "teardown",
    "receiving_inspection",
  ];

  for (const event of component.events) {
    // Only check MRO facility events (not airline line maintenance or OEM)
    if (
      repairEventTypes.includes(event.eventType) &&
      event.facilityType === "mro" &&
      !event.facilityCert
    ) {
      issues.push({
        exceptionType: "missing_facility_certificate",
        severity: "warning",
        title: "Facility Certificate Missing",
        description:
          `The ${event.eventType} event on ${formatDate(event.date)} at ${event.facility} ` +
          `has no FAA Part 145 certificate number recorded. Repair facilities must ` +
          `hold valid certification to perform maintenance on aircraft components.`,
        evidence: {
          eventId: event.id,
          eventType: event.eventType,
          date: event.date,
          facility: event.facility,
          facilityType: event.facilityType,
        },
      });
    }
  }

  return issues;
}

// ── Helpers ──────────────────────────────────────────

/** Calculate the number of days between two dates */
function daysDiff(a: Date | string, b: Date | string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / msPerDay
  );
}

/** Format a date as "MMM DD, YYYY" */
function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
