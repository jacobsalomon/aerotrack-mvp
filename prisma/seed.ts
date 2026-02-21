// ──────────────────────────────────────────────────────
// AeroTrack MVP — Seed Data
//
// This populates the database with 8 realistic Parker Aerospace components,
// each telling a different story about component lifecycle tracking.
// Parker's team should see their own part number formats, division names,
// facility names, and maintenance terminology throughout.
// ──────────────────────────────────────────────────────

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

// Resolve absolute path to dev.db so libsql finds the right file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDbPath = `file:${path.resolve(__dirname, "..", "dev.db")}`;

// Connect to Turso (cloud) when USE_TURSO is explicitly set, otherwise local SQLite
const dbUrl = process.env.USE_TURSO === "true" && process.env.TURSO_DATABASE_URL
  ? process.env.TURSO_DATABASE_URL
  : localDbPath;

const adapter = new PrismaLibSql({
  url: dbUrl,
  authToken: process.env.USE_TURSO === "true" ? process.env.TURSO_AUTH_TOKEN : undefined,
});

const prisma = new PrismaClient({ adapter });

// Helper: generate a SHA-256 hash from a string (for tamper evidence)
function makeHash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function main() {
  // Clear existing data (new mobile capture tables first, then original tables)
  await prisma.auditLogEntry.deleteMany();
  await prisma.videoAnnotation.deleteMany();
  await prisma.sessionAnalysis.deleteMany();
  await prisma.documentGeneration2.deleteMany();
  await prisma.captureEvidence.deleteMany();
  await prisma.captureSession.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.referenceData.deleteMany();
  await prisma.exception.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.partConsumed.deleteMany();
  await prisma.generatedDocument.deleteMany();
  await prisma.lifecycleEvent.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.document.deleteMany();
  await prisma.knowledgeEntry.deleteMany();
  await prisma.component.deleteMany();

  console.log("🧹 Cleared existing data");

  // ════════════════════════════════════════════════════
  // COMPONENT 1: "The Perfect History"
  // A gold-standard component with complete, verified records
  // ════════════════════════════════════════════════════
  const comp1 = await prisma.component.create({
    data: {
      partNumber: "881700-1001",
      serialNumber: "SN-2019-07842",
      description: "HPC-7 Hydraulic Pump",
      oem: "Parker Aerospace",
      oemDivision: "Hydraulic Systems Division",
      manufactureDate: new Date("2019-03-15"),
      manufacturePlant: "Irvine, CA",
      totalHours: 12847,
      totalCycles: 8312,
      timeSinceOverhaul: 4847,
      cyclesSinceOverhaul: 3012,
      status: "installed",
      currentLocation: "In service",
      currentAircraft: "N78509",
      currentOperator: "United Airlines",
      isLifeLimited: false,
    },
  });

  // Component 1 events
  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp1.id,
        eventType: "manufacture",
        date: new Date("2019-03-15"),
        facility: "Parker Aerospace — Hydraulic Systems Division",
        facilityType: "oem",
        facilityCert: "PAR-IR-2019",
        performer: "Parker Aerospace",
        description: "Manufactured and tested per specification. Initial acceptance test passed. FAA Form 8130-3 issued as birth certificate.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        workOrderRef: "MFG-IR-2019-03842",
        hash: makeHash("comp1-manufacture"),
      },
      {
        componentId: comp1.id,
        eventType: "install",
        date: new Date("2019-06-22"),
        facility: "Delta TechOps",
        facilityType: "airline",
        facilityCert: "D8TR092K",
        performer: "Delta Air Lines",
        performerCert: "A&P #2841092",
        description: "Installed on aircraft N401DL (A320neo) at position LH #2 hydraulic pump. Installation per AMM 29-10-01. Ops check satisfactory.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        workOrderRef: "DL-WO-2019-44821",
        hash: makeHash("comp1-install-1"),
      },
      {
        componentId: comp1.id,
        eventType: "detailed_inspection",
        date: new Date("2021-03-10"),
        facility: "Delta TechOps",
        facilityType: "airline",
        facilityCert: "D8TR092K",
        performer: "Mike Patterson",
        performerCert: "A&P #2841092",
        description: "Routine inspection during C-check. Pump operating within normal parameters. No leaks observed. Pressure output 3,020 PSI (spec: 3,000 ± 50 PSI). Oil sample analysis: normal wear metals.",
        hoursAtEvent: 4200,
        cyclesAtEvent: 2780,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        workOrderRef: "DL-CC-2021-12847",
        cmmReference: "CMM 29-10-01 Rev. 11",
        hash: makeHash("comp1-inspection-1"),
      },
      {
        componentId: comp1.id,
        eventType: "remove",
        date: new Date("2022-01-18"),
        facility: "Delta TechOps",
        facilityType: "airline",
        facilityCert: "D8TR092K",
        performer: "Delta Air Lines",
        performerCert: "A&P #3102847",
        description: "Removed for scheduled overhaul at 8,000 flight hours per maintenance program. No defects noted at removal. Packed and shipped to ACE Services Singapore.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        workOrderRef: "DL-RO-2022-00318",
        hash: makeHash("comp1-remove-1"),
      },
      {
        componentId: comp1.id,
        eventType: "receiving_inspection",
        date: new Date("2022-02-02"),
        facility: "ACE Services, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-ACE-001",
        performer: "David Tan",
        performerCert: "CAAS LMA #8721",
        description: "Received from Delta Air Lines. Part matches documentation — P/N 881700-1001, S/N SN-2019-07842. No shipping damage. 8130-3 tag present and valid. Customer work scope: full overhaul per CMM 29-10-01.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        workOrderRef: "ACE-WO-2022-01842",
        cmmReference: "CMM 29-10-01 Rev. 12",
        hash: makeHash("comp1-receiving"),
      },
      {
        componentId: comp1.id,
        eventType: "teardown",
        date: new Date("2022-02-05"),
        facility: "ACE Services, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-ACE-001",
        performer: "David Tan",
        performerCert: "CAAS LMA #8721",
        description: "Disassembly per CMM 29-10-01 chapter 3. All components tagged and documented. Housing, piston, seals, bearings, mounting hardware separated for individual inspection.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        workOrderRef: "ACE-WO-2022-01842",
        cmmReference: "CMM 29-10-01 Rev. 12, Ch. 3",
        hash: makeHash("comp1-teardown"),
      },
      {
        componentId: comp1.id,
        eventType: "detailed_inspection",
        date: new Date("2022-02-08"),
        facility: "ACE Services, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-ACE-001",
        performer: "David Tan",
        performerCert: "CAAS LMA #8721",
        description: "Detailed inspection per CMM 29-10-01 chapter 4. Piston bore diameter: 2.4992 in. (spec: 2.500 ± 0.002). SERVICEABLE. Main piston seal: wear on inner lip exceeds serviceable limits per CMM table 4-1. REPLACE. All bearings within limits. Housing: no cracks (FPI negative). Mounting flange: serviceable.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        workOrderRef: "ACE-WO-2022-01842",
        cmmReference: "CMM 29-10-01 Rev. 12, Ch. 4",
        notes: "Clean unit overall. Normal wear patterns for 8,000-hour pump. Seal replacement only — no anomalies.",
        hash: makeHash("comp1-detailed-inspection"),
      },
      {
        componentId: comp1.id,
        eventType: "repair",
        date: new Date("2022-02-10"),
        facility: "ACE Services, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-ACE-001",
        performer: "David Tan",
        performerCert: "CAAS LMA #8721",
        description: "Repair and reassembly per CMM 29-10-01 chapter 5. Main piston seal replaced (P/N 881700-1045). Loctite 567 applied per CMM step 4.3.2. Housing bolts torqued to 45 ft-lbs per step 5.1. Safety wire installed.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        workOrderRef: "ACE-WO-2022-01842",
        cmmReference: "CMM 29-10-01 Rev. 12, Ch. 5",
        hash: makeHash("comp1-repair"),
      },
      {
        componentId: comp1.id,
        eventType: "functional_test",
        date: new Date("2022-02-11"),
        facility: "ACE Services, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-ACE-001",
        performer: "Wei Lin Chen",
        performerCert: "CAAS LMA #9102",
        description: "Functional testing per CMM 29-10-01 chapter 6. Pressure test: 3,000 PSI for 5 minutes — NO LEAKS. Flow rate: 12.3 GPM (spec: 12.0 ± 0.5 GPM) — PASS. Operational test: 500 cycles — all parameters nominal.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        workOrderRef: "ACE-WO-2022-01842",
        cmmReference: "CMM 29-10-01 Rev. 12, Ch. 6",
        hash: makeHash("comp1-test"),
      },
      {
        componentId: comp1.id,
        eventType: "release_to_service",
        date: new Date("2022-02-12"),
        facility: "ACE Services, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-ACE-001",
        performer: "ACE Services Quality",
        performerCert: "SG-145-ACE-001",
        description: "Overhauled per CMM 29-10-01 Rev. 12. Main piston seal replaced. All tests passed. FAA Form 8130-3 issued. Approved for return to service.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        workOrderRef: "ACE-WO-2022-01842",
        cmmReference: "CMM 29-10-01 Rev. 12",
        hash: makeHash("comp1-release"),
      },
      {
        componentId: comp1.id,
        eventType: "transfer",
        date: new Date("2022-03-01"),
        facility: "Parker Aerospace Distribution, Irvine CA",
        facilityType: "distributor",
        performer: "ACE Services Logistics",
        description: "Shipped from ACE Services Singapore to Parker Aerospace distribution center. Received in serviceable condition with 8130-3 tag. Placed in inventory for resale.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        workOrderRef: "PAR-RCV-2022-03182",
        hash: makeHash("comp1-transfer-parker"),
      },
      {
        componentId: comp1.id,
        eventType: "install",
        date: new Date("2023-04-15"),
        facility: "United Airlines SFO Maintenance",
        facilityType: "airline",
        facilityCert: "UAMR148K",
        performer: "James Rodriguez",
        performerCert: "A&P #3847291",
        description: "Installed on aircraft N78509 (737 MAX 9) at position RH #1 hydraulic pump. Installation per AMM 29-10-01. Ops check satisfactory.",
        hoursAtEvent: 8000,
        cyclesAtEvent: 5300,
        aircraft: "N78509",
        operator: "United Airlines",
        workOrderRef: "UA-WO-2023-28471",
        hash: makeHash("comp1-install-2"),
      },
      {
        componentId: comp1.id,
        eventType: "detailed_inspection",
        date: new Date("2024-09-20"),
        facility: "United Airlines SFO Maintenance",
        facilityType: "airline",
        facilityCert: "UAMR148K",
        performer: "Carlos Mendoza",
        performerCert: "A&P #4102938",
        description: "Routine inspection during A-check. Pump operational, no leaks. Pressure output 3,005 PSI. Oil sample normal. Next scheduled overhaul at 16,000 hours.",
        hoursAtEvent: 11200,
        cyclesAtEvent: 7100,
        aircraft: "N78509",
        operator: "United Airlines",
        workOrderRef: "UA-AC-2024-09281",
        hash: makeHash("comp1-inspection-2"),
      },
    ],
  });

  // Component 1 documents
  await prisma.document.createMany({
    data: [
      {
        componentId: comp1.id,
        docType: "birth_certificate",
        title: "FAA Form 8130-3 — Manufacture",
        aiSummary: "Original equipment manufacturer release certificate. Parker Aerospace Hydraulic Systems Division, Irvine CA. Part inspected and tested per specification.",
        hash: makeHash("comp1-birth-cert"),
      },
      {
        componentId: comp1.id,
        docType: "cmm",
        title: "CMM 29-10-01 Rev. 12 — HPC-7 Hydraulic Pump",
        aiSummary: "Component Maintenance Manual for the HPC-7 series hydraulic pump. Covers disassembly, inspection, repair, reassembly, and testing procedures.",
      },
      {
        componentId: comp1.id,
        docType: "8130",
        title: "FAA Form 8130-3 — ACE Services Overhaul (Feb 2022)",
        aiSummary: "Authorized release certificate following overhaul at ACE Services Singapore. Overhauled per CMM 29-10-01 Rev. 12. Main piston seal replaced. All tests passed.",
        hash: makeHash("comp1-8130-overhaul"),
      },
    ],
  });

  console.log("✅ Component 1: The Perfect History (881700-1001)");

  // ════════════════════════════════════════════════════
  // COMPONENT 2: "The Gap"
  // A component with a suspicious 14-month gap in its records
  // ════════════════════════════════════════════════════
  const comp2 = await prisma.component.create({
    data: {
      partNumber: "881700-1034",
      serialNumber: "SN-2018-06231",
      description: "HPC-7 Hydraulic Pump",
      oem: "Parker Aerospace",
      oemDivision: "Hydraulic Systems Division",
      manufactureDate: new Date("2018-06-10"),
      manufacturePlant: "Irvine, CA",
      totalHours: 14200,
      totalCycles: 9100,
      timeSinceOverhaul: 5200,
      cyclesSinceOverhaul: 3400,
      status: "installed",
      currentLocation: "In service",
      currentAircraft: "CC-BAW",
      currentOperator: "LATAM Airlines",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp2.id,
        eventType: "manufacture",
        date: new Date("2018-06-10"),
        facility: "Parker Aerospace — Hydraulic Systems Division",
        facilityType: "oem",
        performer: "Parker Aerospace",
        description: "Manufactured and tested per specification. FAA Form 8130-3 issued.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        workOrderRef: "MFG-IR-2018-06231",
        hash: makeHash("comp2-manufacture"),
      },
      {
        componentId: comp2.id,
        eventType: "install",
        date: new Date("2018-09-05"),
        facility: "American Airlines Tulsa MRO",
        facilityType: "airline",
        facilityCert: "AAMR108K",
        performer: "American Airlines",
        description: "Installed on aircraft N321AA (A321neo) at position LH #1 hydraulic pump.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        aircraft: "N321AA",
        operator: "American Airlines",
        workOrderRef: "AA-WO-2018-71048",
        hash: makeHash("comp2-install-1"),
      },
      {
        componentId: comp2.id,
        eventType: "remove",
        date: new Date("2020-11-14"),
        facility: "American Airlines Tulsa MRO",
        facilityType: "airline",
        facilityCert: "AAMR108K",
        performer: "American Airlines",
        description: "Removed for repair — intermittent low pressure indication. Packed and tagged for shipment to repair facility.",
        hoursAtEvent: 5800,
        cyclesAtEvent: 3700,
        aircraft: "N321AA",
        operator: "American Airlines",
        workOrderRef: "AA-RO-2020-11482",
        hash: makeHash("comp2-remove"),
      },
      // ── 14-MONTH GAP — NO RECORDS ──
      {
        componentId: comp2.id,
        eventType: "receiving_inspection",
        date: new Date("2022-01-20"),
        facility: "Aero Manutenção Ltda, São Paulo",
        facilityType: "mro",
        facilityCert: "ANAC-145-BR-0042",
        performer: "Ricardo Oliveira",
        description: "Received from unknown broker. Part appears consistent with Parker HPC-7. Documentation package incomplete — no shipping records from American Airlines, no intermediary transfer documents.",
        hoursAtEvent: 5800,
        cyclesAtEvent: 3700,
        workOrderRef: "AM-WO-2022-00104",
        notes: "Traceability documentation has significant gaps. Previous repair station or storage facility unknown.",
        hash: makeHash("comp2-receiving-gap"),
      },
      {
        componentId: comp2.id,
        eventType: "release_to_service",
        date: new Date("2022-02-28"),
        facility: "Aero Manutenção Ltda, São Paulo",
        facilityType: "mro",
        facilityCert: "ANAC-145-BR-0042",
        performer: "Aero Manutenção Quality",
        description: "Overhauled per CMM 29-10-01. Work order and findings report available as scanned PDF only — partially illegible handwritten annotations. 8130-3 issued.",
        hoursAtEvent: 5800,
        cyclesAtEvent: 3700,
        workOrderRef: "AM-WO-2022-00104",
        hash: makeHash("comp2-release"),
      },
      {
        componentId: comp2.id,
        eventType: "install",
        date: new Date("2022-06-12"),
        facility: "LATAM Airlines Santiago MRO",
        facilityType: "airline",
        performer: "LATAM Airlines",
        description: "Installed on aircraft CC-BAW (A320neo). Documentation accepted after extended review by quality department.",
        hoursAtEvent: 5800,
        cyclesAtEvent: 3700,
        aircraft: "CC-BAW",
        operator: "LATAM Airlines",
        workOrderRef: "LA-WO-2022-04821",
        hash: makeHash("comp2-install-2"),
      },
    ],
  });

  // Component 2 alerts
  await prisma.alert.create({
    data: {
      componentId: comp2.id,
      alertType: "provenance_gap",
      severity: "warning",
      title: "14-Month Provenance Gap Detected",
      description: "No records exist between removal from American Airlines Tulsa (Nov 14, 2020) and appearance at Aero Manutenção São Paulo (Jan 20, 2022). 14-month gap is unaccounted for. Part may have changed hands through untracked intermediaries. This pattern is consistent with supply chain diversion risks identified in the AOG Technics investigation (2023).",
      status: "open",
    },
  });

  // Component 2 documents
  await prisma.document.createMany({
    data: [
      {
        componentId: comp2.id,
        docType: "birth_certificate",
        title: "FAA Form 8130-3 — Manufacture",
        hash: makeHash("comp2-birth"),
      },
      {
        componentId: comp2.id,
        docType: "legacy_work_order",
        title: "Work Order — Aero Manutenção (Scanned PDF)",
        aiSummary: "Partially legible scanned work order. Handwritten annotations difficult to read. Key findings: seal replacement noted, pressure test recorded as 'satisfactory' (no specific values). Several CMM references are illegible.",
        isLegacy: true,
        hash: makeHash("comp2-legacy-wo"),
      },
    ],
  });

  console.log("✅ Component 2: The Gap (881700-1034)");

  // ════════════════════════════════════════════════════
  // COMPONENT 3: "Tribal Knowledge Saves the Day"
  // Expert mechanic's observation prevents a failure
  // ════════════════════════════════════════════════════
  const comp3 = await prisma.component.create({
    data: {
      partNumber: "2548934-1",
      serialNumber: "SN-2017-14208",
      description: "Fuel Control Valve",
      oem: "Parker Aerospace",
      oemDivision: "Gas Turbine Fuel Systems Division",
      manufactureDate: new Date("2017-04-20"),
      manufacturePlant: "San Diego, CA",
      totalHours: 18400,
      totalCycles: 12100,
      timeSinceOverhaul: 3200,
      cyclesSinceOverhaul: 2100,
      status: "installed",
      currentLocation: "In service",
      currentAircraft: "9V-SWA",
      currentOperator: "Singapore Airlines",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp3.id,
        eventType: "manufacture",
        date: new Date("2017-04-20"),
        facility: "Parker Aerospace — Gas Turbine Fuel Systems Division",
        facilityType: "oem",
        performer: "Parker Aerospace",
        description: "Manufactured and tested per specification. FAA Form 8130-3 issued.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        hash: makeHash("comp3-manufacture"),
      },
      {
        componentId: comp3.id,
        eventType: "install",
        date: new Date("2017-08-15"),
        facility: "Singapore Airlines Engineering",
        facilityType: "airline",
        performer: "Singapore Airlines",
        description: "Installed on 9V-SMA (A350-900) engine #1 fuel system.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        aircraft: "9V-SMA",
        operator: "Singapore Airlines",
        hash: makeHash("comp3-install-1"),
      },
      {
        componentId: comp3.id,
        eventType: "remove",
        date: new Date("2020-03-10"),
        facility: "Singapore Airlines Engineering",
        facilityType: "airline",
        performer: "Singapore Airlines",
        description: "Removed for scheduled overhaul at 7,200 hours.",
        hoursAtEvent: 7200,
        cyclesAtEvent: 4800,
        aircraft: "9V-SMA",
        operator: "Singapore Airlines",
        hash: makeHash("comp3-remove-1"),
      },
      {
        componentId: comp3.id,
        eventType: "release_to_service",
        date: new Date("2020-04-15"),
        facility: "ST Engineering Aerospace, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-STE-002",
        performer: "ST Engineering",
        description: "Overhauled per CMM 73-21-01. Full disassembly, inspection, and reassembly. Metering assembly within limits. All tests passed.",
        hoursAtEvent: 7200,
        cyclesAtEvent: 4800,
        workOrderRef: "STE-WO-2020-08421",
        cmmReference: "CMM 73-21-01 Rev. 8",
        hash: makeHash("comp3-release-1"),
      },
      {
        componentId: comp3.id,
        eventType: "install",
        date: new Date("2020-07-22"),
        facility: "United Airlines SFO Maintenance",
        facilityType: "airline",
        performer: "United Airlines",
        description: "Installed on N78501 (737 MAX 9) engine #2 fuel system.",
        hoursAtEvent: 7200,
        cyclesAtEvent: 4800,
        aircraft: "N78501",
        operator: "United Airlines",
        hash: makeHash("comp3-install-2"),
      },
      {
        componentId: comp3.id,
        eventType: "remove",
        date: new Date("2024-01-18"),
        facility: "United Airlines ORD Maintenance",
        facilityType: "airline",
        performer: "United Airlines",
        description: "Removed at 15,200 hours for scheduled overhaul.",
        hoursAtEvent: 15200,
        cyclesAtEvent: 10000,
        aircraft: "N78501",
        operator: "United Airlines",
        hash: makeHash("comp3-remove-2"),
      },
      {
        componentId: comp3.id,
        eventType: "detailed_inspection",
        date: new Date("2024-02-05"),
        facility: "AAR Corp, Miami FL",
        facilityType: "mro",
        facilityCert: "A3MR456K",
        performer: "Robert Chen",
        performerCert: "A&P #1847293 / IA",
        description: "Detailed inspection per CMM 73-21-01 chapter 4. All dimensions within serviceable limits. Metering sleeve bore: 1.2498 in. (spec: 1.250 ± 0.002 in.) — within limits but at lower tolerance boundary.",
        hoursAtEvent: 15200,
        cyclesAtEvent: 10000,
        workOrderRef: "AAR-WO-2024-01842",
        cmmReference: "CMM 73-21-01 Rev. 9",
        notes: "Slight vibration in the metering assembly — within spec per CMM but I've seen this pattern before on high-cycle units past 15,000 hours. Next shop visit, whoever gets this valve, check the metering sleeve bearing surfaces closely. The CMM tolerance is generous on this dimension — just because it passes doesn't mean it'll last another interval.",
        hash: makeHash("comp3-inspection-chen"),
      },
      {
        componentId: comp3.id,
        eventType: "release_to_service",
        date: new Date("2024-02-20"),
        facility: "AAR Corp, Miami FL",
        facilityType: "mro",
        facilityCert: "A3MR456K",
        performer: "AAR Corp Quality",
        description: "Overhauled per CMM 73-21-01 Rev. 9. Metering assembly seals replaced. All tests passed. 8130-3 issued.",
        hoursAtEvent: 15200,
        cyclesAtEvent: 10000,
        workOrderRef: "AAR-WO-2024-01842",
        cmmReference: "CMM 73-21-01 Rev. 9",
        hash: makeHash("comp3-release-2"),
      },
      {
        componentId: comp3.id,
        eventType: "install",
        date: new Date("2024-05-10"),
        facility: "SIA Engineering, Singapore",
        facilityType: "airline",
        performer: "Singapore Airlines",
        description: "Installed on 9V-SWA (A350-900) engine #1 fuel system.",
        hoursAtEvent: 15200,
        cyclesAtEvent: 10000,
        aircraft: "9V-SWA",
        operator: "Singapore Airlines",
        hash: makeHash("comp3-install-3"),
      },
      {
        componentId: comp3.id,
        eventType: "remove",
        date: new Date("2025-09-15"),
        facility: "SIA Engineering, Singapore",
        facilityType: "airline",
        performer: "Singapore Airlines",
        description: "Removed at 18,400 hours for scheduled overhaul.",
        hoursAtEvent: 18400,
        cyclesAtEvent: 12100,
        aircraft: "9V-SWA",
        operator: "Singapore Airlines",
        hash: makeHash("comp3-remove-3"),
      },
      {
        componentId: comp3.id,
        eventType: "detailed_inspection",
        date: new Date("2025-10-05"),
        facility: "ST Engineering Aerospace, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-STE-002",
        performer: "Anh Nguyen",
        performerCert: "CAAS LMA #12042",
        description: "Detailed inspection per CMM 73-21-01 Rev. 9. CRITICAL FINDING: Per previous technician note from Robert Chen (AAR Corp, Feb 2024), closely inspected metering sleeve bearing surfaces. Found early-stage spalling on inner bearing race — NOT detectable by standard CMM dimensional check (dimensions still within limits). This would have caused fuel metering failure within approximately 500 flight hours. Bearing assembly REPLACED.",
        hoursAtEvent: 18400,
        cyclesAtEvent: 12100,
        workOrderRef: "STE-WO-2025-14821",
        cmmReference: "CMM 73-21-01 Rev. 9, Ch. 4",
        notes: "Robert Chen's note from Feb 2024 was critical here. The spalling was only visible under 10x magnification and would have passed all standard CMM dimensional checks. Without his warning about the vibration pattern on high-cycle units, we would not have looked this closely. Tribal knowledge saved potentially catastrophic fuel system failure.",
        hash: makeHash("comp3-inspection-save"),
      },
    ],
  });

  console.log("✅ Component 3: Tribal Knowledge Saves the Day (2548934-1)");

  // ════════════════════════════════════════════════════
  // COMPONENT 4: "No Fault Found"
  // Repeated unnecessary removals until AI finds the pattern
  // ════════════════════════════════════════════════════
  const comp4 = await prisma.component.create({
    data: {
      partNumber: "65075-05",
      serialNumber: "SN-2020-22841",
      description: "Flight Control Actuator",
      oem: "Parker Aerospace",
      oemDivision: "Control Systems Division",
      manufactureDate: new Date("2020-07-15"),
      manufacturePlant: "Irvine, CA",
      totalHours: 9800,
      totalCycles: 6500,
      timeSinceOverhaul: 2100,
      cyclesSinceOverhaul: 1400,
      status: "installed",
      currentLocation: "In service",
      currentAircraft: "N401DL",
      currentOperator: "Delta Air Lines",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp4.id,
        eventType: "manufacture",
        date: new Date("2020-07-15"),
        facility: "Parker Aerospace — Control Systems Division",
        facilityType: "oem",
        performer: "Parker Aerospace",
        description: "Manufactured and tested per specification. Batch 2020-Q3-IR. FAA Form 8130-3 issued.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        workOrderRef: "MFG-IR-2020-Q3-2841",
        hash: makeHash("comp4-manufacture"),
      },
      {
        componentId: comp4.id,
        eventType: "install",
        date: new Date("2020-10-22"),
        facility: "Delta TechOps",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Installed on N401DL (A320neo) left elevator actuator position.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        hash: makeHash("comp4-install-1"),
      },
      {
        componentId: comp4.id,
        eventType: "remove",
        date: new Date("2022-08-14"),
        facility: "Delta Line Maintenance, ATL",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Removed for intermittent fault signal — ECAM message 'F/CTL L ELEV FAULT' during climb. Troubleshooting per TSM 27-30-00 inconclusive. Actuator removed for shop evaluation.",
        hoursAtEvent: 4200,
        cyclesAtEvent: 2800,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        workOrderRef: "DL-ML-2022-08142",
        hash: makeHash("comp4-remove-1"),
      },
      {
        componentId: comp4.id,
        eventType: "release_to_service",
        date: new Date("2022-09-10"),
        facility: "Moog Inc., East Aurora NY",
        facilityType: "mro",
        facilityCert: "MR2E847K",
        performer: "Moog Aerospace",
        description: "Shop evaluation per CMM 27-30-01. All functional tests passed. No fault found (NFF). Actuator response time, force output, and position accuracy all within specification. Seals and bearings inspected — serviceable. Returned to service without repair.",
        hoursAtEvent: 4200,
        cyclesAtEvent: 2800,
        workOrderRef: "MOOG-WO-2022-14821",
        cmmReference: "CMM 27-30-01 Rev. 5",
        hash: makeHash("comp4-nff-1"),
      },
      {
        componentId: comp4.id,
        eventType: "install",
        date: new Date("2022-10-05"),
        facility: "Delta TechOps",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Reinstalled on N401DL (A320neo) left elevator actuator position.",
        hoursAtEvent: 4200,
        cyclesAtEvent: 2800,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        hash: makeHash("comp4-install-2"),
      },
      {
        componentId: comp4.id,
        eventType: "remove",
        date: new Date("2023-04-18"),
        facility: "Delta Line Maintenance, ATL",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Removed again — same intermittent 'F/CTL L ELEV FAULT' message. 6 months since last NFF shop visit. Sent back to shop.",
        hoursAtEvent: 5800,
        cyclesAtEvent: 3900,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        workOrderRef: "DL-ML-2023-04182",
        hash: makeHash("comp4-remove-2"),
      },
      {
        componentId: comp4.id,
        eventType: "release_to_service",
        date: new Date("2023-05-15"),
        facility: "Moog Inc., East Aurora NY",
        facilityType: "mro",
        facilityCert: "MR2E847K",
        performer: "Moog Aerospace",
        description: "Second shop evaluation per CMM 27-30-01. Extended testing protocol — 1,000 cycle endurance test at varying temperatures. All parameters nominal. NO FAULT FOUND. Connectors inspected — no visible damage or corrosion.",
        hoursAtEvent: 5800,
        cyclesAtEvent: 3900,
        workOrderRef: "MOOG-WO-2023-08421",
        cmmReference: "CMM 27-30-01 Rev. 5",
        notes: "Second NFF on this unit. Extended test protocol couldn't reproduce the fault. Suspect intermittent wiring issue on the aircraft side, not the actuator itself.",
        hash: makeHash("comp4-nff-2"),
      },
      {
        componentId: comp4.id,
        eventType: "install",
        date: new Date("2023-06-02"),
        facility: "Delta TechOps",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Reinstalled on N401DL. Aircraft wiring checked per TSM — no anomaly found.",
        hoursAtEvent: 5800,
        cyclesAtEvent: 3800, // DATA ERROR: Should be 3,900 — introduces a cycle count discrepancy for demo
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        hash: makeHash("comp4-install-3"),
      },
      {
        componentId: comp4.id,
        eventType: "remove",
        date: new Date("2024-02-28"),
        facility: "Delta Line Maintenance, ATL",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Third removal — same intermittent fault. AeroTrack AI cross-fleet analysis initiated.",
        hoursAtEvent: 7700,
        cyclesAtEvent: 5100,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        workOrderRef: "DL-ML-2024-02284",
        notes: "AEROTRACK AI ANALYSIS: This actuator (65075-05, S/N SN-2020-22841) has been removed 3x for intermittent fault. Cross-fleet analysis of 65075-05 units reveals: 12 other units from manufacturing batch 2020-Q3-IR show 4x higher NFF rate than fleet average. Common factor: all batch 2020-Q3 units shipped with connector P/N 3827-A. Service Bulletin SB 65075-71-003 (issued January 2024) addresses connector pin alignment issue on batch 2020-Q3. RECOMMENDATION: Apply SB 65075-71-003 — check connector pin alignment and replace connector if necessary.",
        hash: makeHash("comp4-remove-3"),
      },
      {
        componentId: comp4.id,
        eventType: "repair",
        date: new Date("2024-03-15"),
        facility: "Delta TechOps",
        facilityType: "airline",
        facilityCert: "D8TR092K",
        performer: "Marcus Williams",
        performerCert: "A&P #4281034",
        description: "SB 65075-71-003 applied. Connector P/N 3827-A removed, pin alignment checked — pins 3 and 7 out of alignment by 0.008 in. (max tolerance 0.003 in.). Connector replaced with P/N 3827-B per SB. Functional test satisfactory — no fault reproduced over 200 ground cycles.",
        hoursAtEvent: 7700,
        cyclesAtEvent: 5100,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        workOrderRef: "DL-SB-2024-03151",
        cmmReference: "SB 65075-71-003",
        hash: makeHash("comp4-sb-repair"),
      },
    ],
  });

  // Component 4 alerts
  await prisma.alert.create({
    data: {
      componentId: comp4.id,
      alertType: "nff_pattern",
      severity: "info",
      title: "NFF Pattern Resolved — Batch 2020-Q3 Connector Issue",
      description: "Three NFF removals traced to connector pin alignment issue affecting manufacturing batch 2020-Q3-IR. SB 65075-71-003 applied. 12 other units in fleet may be affected — recommend fleet-wide SB compliance check.",
      status: "resolved",
      resolvedAt: new Date("2024-03-15"),
    },
  });

  console.log("✅ Component 4: No Fault Found (65075-05)");

  // ════════════════════════════════════════════════════
  // COMPONENT 5: "Counterfeit Suspect"
  // Multiple red flags indicate a potentially fake part
  // ════════════════════════════════════════════════════
  const comp5 = await prisma.component.create({
    data: {
      partNumber: "881700-1001",
      serialNumber: "SN-2017-04190",
      description: "HPC-7 Hydraulic Pump (SUSPECTED COUNTERFEIT)",
      oem: "Parker Aerospace (CLAIMED)",
      oemDivision: "Hydraulic Systems Division (CLAIMED)",
      manufactureDate: new Date("2017-03-01"),
      manufacturePlant: "Unknown",
      totalHours: 0,
      totalCycles: 0,
      status: "quarantined",
      currentLocation: "Quarantine — Global Aero Parts Ltd, London",
      isLifeLimited: false,
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp5.id,
        eventType: "transfer",
        date: new Date("2023-10-05"),
        facility: "Global Aero Parts Ltd, London",
        facilityType: "broker",
        performer: "Global Aero Parts Ltd",
        description: "Part received from unknown source. Accompanied by photocopied 8130-3 claiming Parker Aerospace manufacture date March 2017. No prior history in any MRO tracking system. No shipping records from Parker.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        notes: "Part appeared with no provenance trail. Broker states it was purchased from 'a dealer in Eastern Europe' but cannot provide specific source documentation.",
        hash: makeHash("comp5-appearance"),
      },
      {
        componentId: comp5.id,
        eventType: "receiving_inspection",
        date: new Date("2023-10-08"),
        facility: "Global Aero Parts Ltd, London",
        facilityType: "broker",
        performer: "Thomas Wright",
        performerCert: "EASA B1 #UK.66.42871",
        description: "Incoming inspection. MULTIPLE DISCREPANCIES FOUND: (1) Serial number format SN-2017-04190 uses Parker's post-2019 convention but claims 2017 manufacture date. (2) Weight: 2.1 kg documented — Parker specification for 881700-1001 is 2.4 ± 0.05 kg. (3) Data plate font appears inconsistent with Parker standard. (4) No matching birth certificate in Parker OASIS system. (5) 8130-3 photocopy — original not available, repair station certificate number does not match any FAA-registered facility.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        hash: makeHash("comp5-inspection"),
      },
    ],
  });

  // Component 5 alerts
  await prisma.alert.create({
    data: {
      componentId: comp5.id,
      alertType: "counterfeit_suspect",
      severity: "critical",
      title: "CRITICAL — Multiple Counterfeit Indicators",
      description: "Five red flags detected: (1) S/N format mismatch — uses post-2019 convention for claimed 2017 manufacture. (2) Weight 2.1 kg vs. Parker spec 2.4 kg — 300g underweight. (3) Data plate font inconsistency. (4) No birth certificate in Parker OASIS manufacturing records. (5) 8130-3 is a photocopy with unverifiable repair station certificate. DO NOT INSTALL. Recommend notification to Parker Aerospace anti-counterfeit team and FAA SDRS report.",
      status: "investigating",
    },
  });

  console.log("✅ Component 5: Counterfeit Suspect (881700-1001 FAKE)");

  // ════════════════════════════════════════════════════
  // COMPONENT 6: "Currently In Repair"
  // Active capture workflow — the live demo component
  // ════════════════════════════════════════════════════
  const comp6 = await prisma.component.create({
    data: {
      partNumber: "881700-1089",
      serialNumber: "SN-2024-12847",
      description: "HPC-7 Hydraulic Pump",
      oem: "Parker Aerospace",
      oemDivision: "Hydraulic Systems Division",
      manufactureDate: new Date("2021-01-20"),
      manufacturePlant: "Irvine, CA",
      totalHours: 8102,
      totalCycles: 5234,
      timeSinceOverhaul: 8102,
      cyclesSinceOverhaul: 5234,
      status: "in-repair",
      currentLocation: "AAR Corp, Miami FL",
    },
  });

  const comp6Events = await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp6.id,
        eventType: "manufacture",
        date: new Date("2021-01-20"),
        facility: "Parker Aerospace — Hydraulic Systems Division",
        facilityType: "oem",
        performer: "Parker Aerospace",
        description: "Manufactured and tested per specification. FAA Form 8130-3 issued.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        hash: makeHash("comp6-manufacture"),
      },
      {
        componentId: comp6.id,
        eventType: "install",
        date: new Date("2021-04-10"),
        facility: "Delta TechOps",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Installed on N401DL (A320neo) at position RH #2 hydraulic pump.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        hash: makeHash("comp6-install"),
      },
      {
        componentId: comp6.id,
        eventType: "remove",
        date: new Date("2026-01-15"),
        facility: "Delta Line Maintenance, ATL",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Removed for scheduled overhaul at 8,102 hours. No defects noted at removal. Shipped to AAR Corp Miami.",
        hoursAtEvent: 8102,
        cyclesAtEvent: 5234,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        workOrderRef: "DL-RO-2026-00115",
        hash: makeHash("comp6-remove"),
      },
      {
        componentId: comp6.id,
        eventType: "receiving_inspection",
        date: new Date("2026-01-28"),
        facility: "AAR Corp, Miami FL",
        facilityType: "mro",
        facilityCert: "A3MR456K",
        performer: "John Rodriguez",
        performerCert: "A&P #2876543",
        description: "Received from Delta Air Lines. P/N 881700-1089, S/N SN-2024-12847 matches documentation. No shipping damage. 8130-3 tag present. Customer work scope: full overhaul per CMM 29-10-01 Rev. 12. Open SB: SB 881700-29-004 (seal material upgrade) — to be incorporated during overhaul.",
        hoursAtEvent: 8102,
        cyclesAtEvent: 5234,
        workOrderRef: "AAR-WO-2026-00842",
        cmmReference: "CMM 29-10-01 Rev. 12",
        hash: makeHash("comp6-receiving"),
      },
    ],
  });

  // Component 6 documents
  await prisma.document.createMany({
    data: [
      {
        componentId: comp6.id,
        docType: "birth_certificate",
        title: "FAA Form 8130-3 — Manufacture",
        hash: makeHash("comp6-birth"),
      },
      {
        componentId: comp6.id,
        docType: "service_bulletin",
        title: "SB 881700-29-004 — Seal Material Upgrade",
        aiSummary: "Service bulletin requiring replacement of main piston seal with upgraded material (fluorocarbon to PTFE composite) for improved high-temperature performance. Applicable to all 881700-series pumps manufactured before 2024.",
      },
      {
        componentId: comp6.id,
        docType: "cmm",
        title: "CMM 29-10-01 Rev. 12 — HPC-7 Hydraulic Pump",
        aiSummary: "Component Maintenance Manual for the HPC-7 series hydraulic pump.",
      },
    ],
  });

  console.log("✅ Component 6: Currently In Repair (881700-1089) — DEMO COMPONENT");

  // ════════════════════════════════════════════════════
  // COMPONENT 7: "Full Lifecycle — Retired"
  // 20 years, birth to death
  // ════════════════════════════════════════════════════
  const comp7 = await prisma.component.create({
    data: {
      partNumber: "2670112-M1",
      serialNumber: "SN-2005-03182",
      description: "Hydraulic Motor",
      oem: "Parker Aerospace",
      oemDivision: "Hydraulic Systems Division",
      manufactureDate: new Date("2005-03-22"),
      manufacturePlant: "Irvine, CA",
      totalHours: 42000,
      totalCycles: 28000,
      status: "retired",
      currentLocation: "Scrapped — AAR Corp, Miami FL",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp7.id,
        eventType: "manufacture",
        date: new Date("2005-03-22"),
        facility: "Parker Aerospace — Hydraulic Systems Division",
        facilityType: "oem",
        performer: "Parker Aerospace",
        description: "Manufactured and tested per specification. FAA Form 8130-3 issued.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        hash: makeHash("comp7-manufacture"),
      },
      {
        componentId: comp7.id,
        eventType: "install",
        date: new Date("2005-07-10"),
        facility: "Lufthansa Technik, Hamburg",
        facilityType: "mro",
        performer: "Lufthansa Technik",
        description: "Installed on D-AIMA (A380-800) hydraulic system.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        aircraft: "D-AIMA",
        operator: "Lufthansa",
        hash: makeHash("comp7-install-1"),
      },
      {
        componentId: comp7.id,
        eventType: "remove",
        date: new Date("2009-12-01"),
        facility: "Lufthansa Technik, Hamburg",
        facilityType: "mro",
        performer: "Lufthansa",
        description: "Removed from D-AIMA for scheduled overhaul at 12,000 hours.",
        hoursAtEvent: 12000,
        cyclesAtEvent: 8000,
        aircraft: "D-AIMA",
        operator: "Lufthansa",
        hash: makeHash("comp7-remove-1"),
      },
      {
        componentId: comp7.id,
        eventType: "release_to_service",
        date: new Date("2010-02-15"),
        facility: "Lufthansa Technik, Hamburg",
        facilityType: "mro",
        facilityCert: "DE.145.0003",
        performer: "Lufthansa Technik",
        description: "First overhaul at 12,000 hours. Full disassembly, inspection, seal replacement, motor windings tested. All parameters within spec.",
        hoursAtEvent: 12000,
        cyclesAtEvent: 8000,
        workOrderRef: "LHT-WO-2010-04821",
        hash: makeHash("comp7-overhaul-1"),
      },
      {
        componentId: comp7.id,
        eventType: "install",
        date: new Date("2010-06-20"),
        facility: "Emirates Engineering, Dubai",
        facilityType: "airline",
        performer: "Emirates",
        description: "Installed on A6-EDA (A380-800) hydraulic system.",
        hoursAtEvent: 12000,
        cyclesAtEvent: 8000,
        aircraft: "A6-EDA",
        operator: "Emirates",
        hash: makeHash("comp7-install-2"),
      },
      {
        componentId: comp7.id,
        eventType: "remove",
        date: new Date("2015-06-15"),
        facility: "Emirates Engineering, Dubai",
        facilityType: "airline",
        performer: "Emirates",
        description: "Removed from A6-EDA for scheduled overhaul at 24,000 hours.",
        hoursAtEvent: 24000,
        cyclesAtEvent: 16000,
        aircraft: "A6-EDA",
        operator: "Emirates",
        hash: makeHash("comp7-remove-2"),
      },
      {
        componentId: comp7.id,
        eventType: "release_to_service",
        date: new Date("2015-08-10"),
        facility: "ACE Services, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-ACE-001",
        performer: "ACE Services",
        description: "Second overhaul at 24,000 hours. Housing bore wear approaching limit — oversize bore per CMM repair procedure. Rotor and stator replaced. All tests passed.",
        hoursAtEvent: 24000,
        cyclesAtEvent: 16000,
        workOrderRef: "ACE-WO-2015-12842",
        hash: makeHash("comp7-overhaul-2"),
      },
      {
        componentId: comp7.id,
        eventType: "install",
        date: new Date("2016-01-15"),
        facility: "Qantas Engineering, Sydney",
        facilityType: "airline",
        performer: "Qantas",
        description: "Installed on VH-OQA (A380-800) hydraulic system.",
        hoursAtEvent: 24000,
        cyclesAtEvent: 16000,
        aircraft: "VH-OQA",
        operator: "Qantas",
        hash: makeHash("comp7-install-3"),
      },
      {
        componentId: comp7.id,
        eventType: "remove",
        date: new Date("2020-09-20"),
        facility: "Qantas Engineering, Sydney",
        facilityType: "airline",
        performer: "Qantas",
        description: "Removed from VH-OQA for scheduled overhaul at 36,000 hours.",
        hoursAtEvent: 36000,
        cyclesAtEvent: 24000,
        aircraft: "VH-OQA",
        operator: "Qantas",
        hash: makeHash("comp7-remove-3"),
      },
      {
        componentId: comp7.id,
        eventType: "release_to_service",
        date: new Date("2020-11-20"),
        facility: "ST Engineering Aerospace, Singapore",
        facilityType: "mro",
        facilityCert: "SG-145-STE-002",
        performer: "ST Engineering",
        description: "Third overhaul at 36,000 hours. Housing bore at maximum oversize. Note: next overhaul will likely exceed economic repair limit. Motor windings showing age-related degradation but within limits.",
        hoursAtEvent: 36000,
        cyclesAtEvent: 24000,
        workOrderRef: "STE-WO-2020-28471",
        notes: "This motor has one more interval left at best. The housing bore is at maximum oversize — any further wear will exceed repairable limits. Flagging for the operator to plan a replacement unit for the next removal.",
        hash: makeHash("comp7-overhaul-3"),
      },
      {
        componentId: comp7.id,
        eventType: "install",
        date: new Date("2021-03-05"),
        facility: "Delta TechOps",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Installed on N401DL (A320neo) hydraulic motor position.",
        hoursAtEvent: 36000,
        cyclesAtEvent: 24000,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        hash: makeHash("comp7-install-4"),
      },
      {
        componentId: comp7.id,
        eventType: "remove",
        date: new Date("2025-01-10"),
        facility: "Delta TechOps",
        facilityType: "airline",
        performer: "Delta Air Lines",
        description: "Removed at 42,000 hours for scheduled overhaul.",
        hoursAtEvent: 42000,
        cyclesAtEvent: 28000,
        aircraft: "N401DL",
        operator: "Delta Air Lines",
        hash: makeHash("comp7-remove-final"),
      },
      {
        componentId: comp7.id,
        eventType: "detailed_inspection",
        date: new Date("2025-01-25"),
        facility: "AAR Corp, Miami FL",
        facilityType: "mro",
        facilityCert: "A3MR456K",
        performer: "AAR Corp",
        description: "Detailed inspection per CMM. Housing bore wear measured at 3.0058 in. — exceeds maximum oversize limit of 3.005 in. per CMM table 4-3. Housing is beyond economic repair. Motor windings: insulation resistance degraded to 15 MΩ (minimum 20 MΩ). Unit assessed as BEYOND ECONOMIC REPAIR.",
        hoursAtEvent: 42000,
        cyclesAtEvent: 28000,
        workOrderRef: "AAR-WO-2025-00842",
        hash: makeHash("comp7-final-inspection"),
      },
      {
        componentId: comp7.id,
        eventType: "scrap",
        date: new Date("2025-02-01"),
        facility: "AAR Corp, Miami FL",
        facilityType: "mro",
        facilityCert: "A3MR456K",
        performer: "AAR Corp Quality",
        description: "Retired — exceeded economic repair limit. Housing bore wear beyond CMM maximum oversize. Motor winding insulation below minimum. Scrapped per company procedure SP-2025-003. Data plate mutilated to prevent re-entry into service. 20 years of service across 4 aircraft and 3 airlines.",
        hoursAtEvent: 42000,
        cyclesAtEvent: 28000,
        workOrderRef: "AAR-SC-2025-00103",
        hash: makeHash("comp7-scrap"),
      },
    ],
  });

  console.log("✅ Component 7: Full Lifecycle — Retired (2670112-M1)");

  // ════════════════════════════════════════════════════
  // COMPONENT 8: "Just Born"
  // Brand new from the factory
  // ════════════════════════════════════════════════════
  const comp8 = await prisma.component.create({
    data: {
      partNumber: "881700-2001",
      serialNumber: "SN-2026-00142",
      description: "HPC-9 Hydraulic Pump (Next-Gen)",
      oem: "Parker Aerospace",
      oemDivision: "Hydraulic Systems Division",
      manufactureDate: new Date("2026-01-30"),
      manufacturePlant: "Irvine, CA",
      totalHours: 0,
      totalCycles: 0,
      status: "serviceable",
      currentLocation: "Parker Warehouse, Irvine CA",
      isLifeLimited: false,
    },
  });

  await prisma.lifecycleEvent.create({
    data: {
      componentId: comp8.id,
      eventType: "manufacture",
      date: new Date("2026-01-30"),
      facility: "Parker Aerospace — Hydraulic Systems Division",
      facilityType: "oem",
      performer: "Parker Aerospace",
      description: "Manufactured and tested per specification PS-881700-2001 Rev. 1. Next-generation HPC-9 series with improved seal materials and integrated health monitoring port. Initial acceptance test passed — pressure output 3,015 PSI, flow rate 12.6 GPM. FAA Form 8130-3 issued as birth certificate. Digital birth record created in AeroTrack from day one.",
      hoursAtEvent: 0,
      cyclesAtEvent: 0,
      workOrderRef: "MFG-IR-2026-00142",
      hash: makeHash("comp8-manufacture"),
    },
  });

  await prisma.document.create({
    data: {
      componentId: comp8.id,
      docType: "birth_certificate",
      title: "FAA Form 8130-3 — Manufacture (Digital Native)",
      aiSummary: "Born-digital manufacture certificate. First HPC-9 series pump with full digital birth record — no paper scan, structured data from manufacturing test bench feeds directly into lifecycle record.",
      hash: makeHash("comp8-birth"),
    },
  });

  console.log("✅ Component 8: Just Born (881700-2001)");

  // ════════════════════════════════════════════════════
  // COMPONENT 9: "Glasses Demo — Overhaul Complete"
  // This is the exact part shown in the smart glasses HUD demo.
  // After the glasses demo's document-review phase, users click
  // "View Part Details" and land on this component's page.
  // The deterministic ID lets the demo link directly here.
  // ════════════════════════════════════════════════════
  const comp9 = await prisma.component.create({
    data: {
      id: "demo-hpc7-overhaul",
      partNumber: "881700-1089",
      serialNumber: "SN-2024-11432",
      description: "HPC-7 Hydraulic Pump",
      oem: "Parker Aerospace",
      oemDivision: "Hydraulic Systems Division",
      manufactureDate: new Date("2019-08-15"),
      manufacturePlant: "Irvine, CA",
      totalHours: 8247,
      totalCycles: 5421,
      timeSinceOverhaul: 0,
      cyclesSinceOverhaul: 0,
      status: "serviceable",
      currentLocation: "ST Engineering Aerospace, Burlingame CA",
      isLifeLimited: false,
    },
  });

  // Component 9 events — the full overhaul story shown in the glasses demo
  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp9.id,
        eventType: "manufacture",
        date: new Date("2019-08-15"),
        facility: "Parker Aerospace — Hydraulic Systems Division",
        facilityType: "oem",
        facilityCert: "PAR-IR-2019",
        performer: "Parker Aerospace",
        description: "Manufactured and tested per specification. Initial acceptance test passed. FAA Form 8130-3 issued as birth certificate.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        workOrderRef: "MFG-IR-2019-08115",
        hash: makeHash("comp9-manufacture"),
      },
      {
        componentId: comp9.id,
        eventType: "install",
        date: new Date("2019-11-10"),
        facility: "Southwest Airlines, DAL",
        facilityType: "airline",
        facilityCert: "SWA-DAL-145",
        performer: "Southwest Airlines",
        performerCert: "A&P #3841002",
        description: "Installed on aircraft N89247 (737-800) at position LH #1 hydraulic pump. Installation per AMM 29-10-01. Ops check satisfactory.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        aircraft: "N89247",
        operator: "Southwest Airlines",
        workOrderRef: "SWA-WO-2019-71102",
        hash: makeHash("comp9-install"),
      },
      {
        componentId: comp9.id,
        eventType: "remove",
        date: new Date("2024-01-28"),
        facility: "Southwest Airlines Line Maintenance, HOU",
        facilityType: "airline",
        facilityCert: "SWA-HOU-145",
        performer: "Southwest Airlines",
        performerCert: "A&P #4102987",
        description: "Removed for scheduled overhaul at 8,247 flight hours per maintenance program. No defects noted at removal. Packed and shipped to ST Engineering Aerospace.",
        hoursAtEvent: 8247,
        cyclesAtEvent: 5421,
        aircraft: "N89247",
        operator: "Southwest Airlines",
        workOrderRef: "SWA-RO-2024-00128",
        hash: makeHash("comp9-remove"),
      },
      {
        componentId: comp9.id,
        eventType: "receiving_inspection",
        date: new Date("2024-02-01"),
        facility: "ST Engineering Aerospace, Burlingame CA",
        facilityType: "mro",
        facilityCert: "R4RS289K",
        performer: "J. Martinez",
        performerCert: "A&P #3928471",
        description: "Received from Southwest Airlines. Part matches documentation — P/N 881700-1089, S/N SN-2024-11432. No shipping damage. 8130-3 tag present and valid. Customer work scope: full overhaul per CMM 881700-OH Rev. 12.",
        hoursAtEvent: 8247,
        cyclesAtEvent: 5421,
        workOrderRef: "WO-2024-08847",
        cmmReference: "CMM 881700-OH Rev. 12",
        hash: makeHash("comp9-receiving"),
      },
      {
        componentId: comp9.id,
        eventType: "teardown",
        date: new Date("2024-02-03"),
        facility: "ST Engineering Aerospace, Burlingame CA",
        facilityType: "mro",
        facilityCert: "R4RS289K",
        performer: "M. Thompson",
        performerCert: "A&P/IA #2847291",
        description: "Complete teardown per CMM 881700-OH Rev. 12, §70-00. All sub-components separated, cleaned, and staged for inspection. BOM: 6 sub-assemblies.",
        hoursAtEvent: 8247,
        cyclesAtEvent: 5421,
        workOrderRef: "WO-2024-08847",
        cmmReference: "CMM 881700-OH Rev. 12, §70-00",
        hash: makeHash("comp9-teardown"),
      },
      {
        componentId: comp9.id,
        eventType: "detailed_inspection",
        date: new Date("2024-02-05"),
        facility: "ST Engineering Aerospace, Burlingame CA",
        facilityType: "mro",
        facilityCert: "R4RS289K",
        performer: "M. Thompson",
        performerCert: "A&P/IA #2847291",
        description: "Detailed inspection per CMM 881700-OH Rev. 12, §70-20 through §70-60. Findings: (1) 881700-2010 Piston Assembly — bore 2.4985 in, spec 2.500 ± 0.002 in — SERVICEABLE. (2) 881700-3045 Gear Train — backlash 0.004 in, spec 0.003–0.006 in — SERVICEABLE. (3) 881700-4022 Inlet Seal Kit — Shore 82A, spec min 75A — within limits but degraded at 8,247 hrs. RECOMMEND REPLACE. AI fleet analysis: 4 of 12 units in fleet sample required unscheduled seal replacement within 1,000 hrs of 7,500-hr threshold.",
        hoursAtEvent: 8247,
        cyclesAtEvent: 5421,
        workOrderRef: "WO-2024-08847",
        cmmReference: "CMM 881700-OH Rev. 12, §70-20",
        notes: "Seal hardness 82A — still in limits, but given 8,200+ hours, replacement is prudent. Fleet data supports this decision.",
        hash: makeHash("comp9-inspection"),
      },
      {
        componentId: comp9.id,
        eventType: "repair",
        date: new Date("2024-02-06"),
        facility: "ST Engineering Aerospace, Burlingame CA",
        facilityType: "mro",
        facilityCert: "R4RS289K",
        performer: "M. Thompson",
        performerCert: "A&P/IA #2847291",
        description: "Inlet Port Seal Kit (P/N 881700-4022) replaced with new unit. CoC ref: COC-2024-1847. Old seal disposed per scrap procedure.",
        hoursAtEvent: 8247,
        cyclesAtEvent: 5421,
        workOrderRef: "WO-2024-08847",
        cmmReference: "CMM 881700-OH Rev. 12, §70-40",
        hash: makeHash("comp9-repair"),
      },
      {
        componentId: comp9.id,
        eventType: "reassembly",
        date: new Date("2024-02-07"),
        facility: "ST Engineering Aerospace, Burlingame CA",
        facilityType: "mro",
        facilityCert: "R4RS289K",
        performer: "M. Thompson",
        performerCert: "A&P/IA #2847291",
        description: "Reassembled per CMM 881700-OH Rev. 12, §70-70. All torque values per specification. New lockwire installed.",
        hoursAtEvent: 8247,
        cyclesAtEvent: 5421,
        workOrderRef: "WO-2024-08847",
        cmmReference: "CMM 881700-OH Rev. 12, §70-70",
        hash: makeHash("comp9-reassembly"),
      },
      {
        componentId: comp9.id,
        eventType: "functional_test",
        date: new Date("2024-02-08"),
        facility: "ST Engineering Aerospace, Burlingame CA",
        facilityType: "mro",
        facilityCert: "R4RS289K",
        performer: "M. Thompson",
        performerCert: "A&P/IA #2847291",
        description: "Functional test per CMM 881700-OH Rev. 12, §70-80. Pressure test: 3,000 PSI — PASS (spec: 2,800–3,200 PSI). Flow rate: 12.4 GPM — PASS (spec: 11.5–13.0 GPM). No leaks observed during 15-minute sustained pressure hold.",
        hoursAtEvent: 8247,
        cyclesAtEvent: 5421,
        workOrderRef: "WO-2024-08847",
        cmmReference: "CMM 881700-OH Rev. 12, §70-80",
        hash: makeHash("comp9-test"),
      },
    ],
  });

  // Create the release-to-service event separately so we can attach GeneratedDocuments to it
  const comp9ReleaseEvent = await prisma.lifecycleEvent.create({
    data: {
      componentId: comp9.id,
      eventType: "release_to_service",
      date: new Date("2024-02-08"),
      facility: "ST Engineering Aerospace, Burlingame CA",
      facilityType: "mro",
      facilityCert: "R4RS289K",
      performer: "M. Thompson",
      performerCert: "A&P/IA #2847291",
      description: "Component released to service after full overhaul per CMM 881700-OH Rev. 12. All inspections passed, functional tests within specification. FAA Form 8130-3, Form 337, and Form 8010-4 auto-generated by AeroTrack.",
      hoursAtEvent: 8247,
      cyclesAtEvent: 5421,
      aircraft: "N89247",
      operator: "Southwest Airlines",
      workOrderRef: "WO-2024-08847",
      cmmReference: "CMM 881700-OH Rev. 12",
      hash: makeHash("comp9-release"),
    },
  });

  // Generated compliance documents — these are the same forms shown in the glasses demo
  await prisma.generatedDocument.createMany({
    data: [
      {
        eventId: comp9ReleaseEvent.id,
        docType: "8130-3",
        title: "FAA Form 8130-3 — Authorized Release Certificate",
        status: "approved",
        approvedBy: "M. Thompson",
        approvedAt: new Date("2024-02-08"),
        hash: makeHash("comp9-8130-3"),
        content: JSON.stringify({
          block1: "FAA / United States",
          block2: "Authorized Release Certificate",
          block3: "ATK-2024-08847-8130",
          block4: "ST Engineering Aerospace\n540 Airport Blvd\nBurlingame, CA 94010",
          block5: "WO-2024-08847",
          block6a: "HPC-7 Hydraulic Pump",
          block6b: "881700-1089",
          block6c: "SN-2024-11432",
          block6d: "1",
          block6e: "Overhauled",
          block7: "Full overhaul per CMM 881700-OH Rev. 12, §70-00 through §70-90.\n\nINSPECTION FINDINGS:\n- 881700-2010 Piston Assembly: Bore 2.4985 in (spec 2.500 ± 0.002) — SERVICEABLE\n- 881700-3045 Gear Train: Backlash 0.004 in (spec 0.003–0.006) — SERVICEABLE\n- 881700-4022 Inlet Seal Kit: Shore 82A (spec min 75A) — REPLACED\n\nPARTS REPLACED:\n881700-4022 Inlet Port Seal Kit, Qty 1 (New, CoC ref: COC-2024-1847)\n\nTEST RESULTS:\n- Pressure Test: 3,000 PSI — PASS (spec: 2,800–3,200 PSI)\n- Flow Rate: 12.4 GPM — PASS (spec: 11.5–13.0 GPM)",
          block8: "Condition for safe operation",
          block9: "FAR § 43.9, 14 CFR Part 145",
          block10: "Applicable",
          block11: "R4RS289K",
          block12: "2024-02-08",
          block13: "M. Thompson",
          block14: "I certify that the work identified above has been performed in accordance with the requirements of Part 43 of the Federal Aviation Regulations and that the item is approved for return to service.",
          narrative_summary: "Full overhaul of HPC-7 Hydraulic Pump completed. Inlet seal replaced due to degradation. All tests passed.",
        }),
      },
      {
        eventId: comp9ReleaseEvent.id,
        docType: "337",
        title: "FAA Form 337 — Major Repair and Alteration",
        status: "approved",
        approvedBy: "M. Thompson",
        approvedAt: new Date("2024-02-08"),
        hash: makeHash("comp9-337"),
        content: JSON.stringify({
          formType: "337",
          aircraft: { registration: "N89247", serialNumber: "42891", make: "Boeing", model: "737-800" },
          owner: { name: "Southwest Airlines Co.", address: "2702 Love Field Dr\nDallas, TX 75235" },
          repairType: "Repair",
          unit: "APPLIANCE",
          appliance: { make: "Parker Aerospace", model: "881700-1089", serialNumber: "SN-2024-11432", type: "Hydraulic Pump" },
          conformity: {
            agency: "ST Engineering Aerospace\n540 Airport Blvd, Burlingame, CA 94010",
            agencyKind: "Certificated Repair Station",
            certificateNumber: "R4RS289K",
            signedBy: "M. Thompson",
            date: "2024-02-08",
          },
          approval: { status: "Approved", type: "Repair Station", certificate: "R4RS289K", signedBy: "M. Thompson", date: "2024-02-08" },
          workDescription: "Major repair of HPC-7 Hydraulic Pump (P/N 881700-1089, S/N SN-2024-11432) per CMM 881700-OH Rev. 12.\n\nWork included complete disassembly, cleaning, inspection, parts replacement (Inlet Port Seal Kit P/N 881700-4022), reassembly, and functional testing per manufacturer specifications.\n\nInlet Port Seal Kit replaced due to degradation (Shore hardness 82A at 8,247 flight hours). Fleet data indicates accelerated aging pattern on this part number beyond 7,500 flight hours.\n\nAll other components within manufacturer tolerances. Pressure test (3,000 PSI) and flow rate test (12.4 GPM) passed.\n\nComponent returned to service — Overhauled.",
        }),
      },
      {
        eventId: comp9ReleaseEvent.id,
        docType: "8010-4",
        title: "FAA Form 8010-4 — Malfunction or Defect Report",
        status: "approved",
        approvedBy: "M. Thompson",
        approvedAt: new Date("2024-02-08"),
        hash: makeHash("comp9-8010-4"),
        content: JSON.stringify({
          formType: "8010-4",
          aircraft: { registration: "N89247", manufacturer: "Boeing", model: "737-800", serialNumber: "42891" },
          defectPart: { name: "Inlet Port Seal Kit", partNumber: "881700-4022", serialNumber: "SN-2024-S4022", location: "Inlet Port" },
          componentAssembly: { name: "HPC-7 Hydraulic Pump", manufacturer: "Parker Aerospace", partNumber: "881700-1089", serialNumber: "SN-2024-11432" },
          metrics: { partTotalTime: "8,247 hrs", partTSO: "8,247 hrs", partCondition: "Degraded" },
          dateSubmitted: "2024-02-08",
          comments: "During overhaul inspection of HPC-7 Hydraulic Pump (P/N 881700-1089, S/N SN-2024-11432), Inlet Port Seal Kit (P/N 881700-4022) found with Shore hardness of 82A (specification minimum: 75A). While currently within tolerance, degradation pattern is consistent with accelerated aging at high flight hours.\n\nFleet data analysis: 881700-4022 seals on units exceeding 7,500 flight hours show increased failure rates. 4 of 12 units in fleet sample required unscheduled replacement within 1,000 hours of the 7,500-hour threshold.\n\nRECOMMENDATIONS:\n1. Replace seal kit during any overhaul at or beyond 7,500 flight hours\n2. Consider fleet-wide inspection campaign for units approaching 7,500 hours\n3. Recommend Parker Aerospace evaluate for potential service bulletin",
          submittedBy: { type: "Repair Station", designation: "R4RS289K", telephone: "(650) 555-0142" },
        }),
      },
    ],
  });

  // Reference documents for the demo component
  await prisma.document.createMany({
    data: [
      {
        componentId: comp9.id,
        docType: "birth_certificate",
        title: "FAA Form 8130-3 — Manufacture",
        hash: makeHash("comp9-birth"),
      },
      {
        componentId: comp9.id,
        docType: "cmm",
        title: "CMM 881700-OH Rev. 12 — HPC-7 Hydraulic Pump",
        aiSummary: "Component Maintenance Manual for HPC-7 series hydraulic pump overhaul procedures, including teardown, inspection limits, repair, reassembly, and functional test specifications.",
      },
    ],
  });

  console.log("✅ Component 9: Glasses Demo — Overhaul Complete (881700-1089 / SN-2024-11432)");

  // ════════════════════════════════════════════════════
  // KNOWLEDGE LIBRARY ENTRIES
  // Captured expertise from experienced mechanics
  // ════════════════════════════════════════════════════
  await prisma.knowledgeEntry.createMany({
    data: [
      {
        partFamily: "HPC-7 Hydraulic Pump (881700 series)",
        topic: "Corrosion patterns on mounting flange",
        expertName: "Robert Chen",
        expertYears: 28,
        expertCert: "A&P / IA",
        description: "Surface corrosion on the mounting flange near bolt holes is common on high-cycle units, especially those that have operated in humid or coastal environments (Miami, Singapore, São Paulo). The CMM allows up to 0.005 in. pitting depth — but in my experience, flanges that show early-stage corrosion at the 8,000-hour mark tend to exceed limits by 16,000 hours. If you see it at the first overhaul, note it in the records and flag it for close monitoring at the next interval. The operator should budget for a flange repair or replacement unit at the second overhaul.",
        tags: "corrosion,mounting flange,881700,humid environment,coastal,preventive",
        cmmReference: "CMM 29-10-01 Rev. 12, Table 4-2",
      },
      {
        partFamily: "HPC-7 Hydraulic Pump (881700 series)",
        topic: "Piston seal wear pattern — normal vs. abnormal",
        expertName: "Maria Santos",
        expertYears: 22,
        expertCert: "A&P / IA",
        description: "Normal seal wear on the HPC-7 piston shows uniform compression on the inner lip — the seal gets thinner evenly all the way around. If you see uneven wear — one side thinner than the other — that's a piston bore alignment issue. The CMM won't catch it because the bore dimensions can still be in spec even when the bore is slightly out of round. Check the bore with a dial bore gauge at multiple orientations, not just the single measurement the CMM calls for. I've caught three out-of-round bores in 22 years that passed the standard CMM dimensional check.",
        tags: "seal wear,piston,881700,bore alignment,out of round,inspection technique",
        cmmReference: "CMM 29-10-01 Rev. 12, Ch. 4",
      },
      {
        partFamily: "Fuel Control Valve (2548934 series)",
        topic: "Metering assembly vibration on high-cycle units",
        expertName: "Robert Chen",
        expertYears: 28,
        expertCert: "A&P / IA",
        description: "On high-cycle fuel control valves past 15,000 hours, check the metering sleeve bearing surfaces closely — even if dimensions pass the CMM checks. The CMM tolerance is generous on the bearing bore dimension. I've seen units where the bearing race develops micro-spalling that's only visible under 10x magnification. The vibration pattern in the metering assembly is the tell — hold the metering sleeve and rotate it slowly. If you feel any roughness or hesitation, pull the bearing and inspect under magnification. The CMM says 'smooth rotation required' but doesn't specify magnification level for the bearing surface inspection. Use 10x minimum.",
        tags: "fuel control,metering,vibration,bearing,spalling,high-cycle,2548934",
        cmmReference: "CMM 73-21-01 Rev. 9, Ch. 4",
      },
      {
        partFamily: "Flight Control Actuator (65075 series)",
        topic: "Connector pin alignment — batch 2020 issue",
        expertName: "Marcus Williams",
        expertYears: 12,
        expertCert: "A&P",
        description: "If you're working on a 65075-05 actuator from manufacturing batch 2020-Q3 (check the data plate — batch code is the third field), check the connector pin alignment before doing anything else. These units shipped with the P/N 3827-A connector that has a known pin alignment issue. SB 65075-71-003 was issued in January 2024 to address it. If the SB hasn't been applied, the actuator will throw intermittent fault signals that don't reproduce on the test bench — classic NFF. Save yourself the trouble and apply the SB first.",
        tags: "actuator,connector,65075,NFF,no fault found,batch 2020,SB 65075-71-003",
        cmmReference: "SB 65075-71-003",
      },
      {
        partFamily: "General — All Parker Hydraulic Components",
        topic: "Identifying potential counterfeit parts",
        expertName: "Thomas Wright",
        expertYears: 35,
        expertCert: "EASA B1",
        description: "After 35 years in the industry, here's what I look for: (1) Weight — counterfeit parts are almost always lighter because they use cheaper alloys. Keep a calibrated scale at your receiving bench. (2) Data plate — Parker uses specific fonts and engraving depths. If the lettering looks different from known-good parts, flag it. (3) Serial number format — Parker changed their convention in 2019. Pre-2019 parts should NOT have the newer format. (4) 8130-3 quality — look for photocopied tags, mismatched fonts within the form, or repair station numbers that don't verify in the FAA database. (5) Trust your gut — if something feels wrong about a part, put it in quarantine and make calls. It's better to delay one shipment than to install a counterfeit part.",
        tags: "counterfeit,authentication,receiving inspection,quality,safety",
      },
    ],
  });

  console.log("✅ Knowledge Library entries created");

  // ════════════════════════════════════════════════════
  // EXCEPTIONS — Populating the empty Exception model
  // These are data inconsistencies detected by automated checks
  // ════════════════════════════════════════════════════

  await prisma.exception.create({
    data: {
      componentId: comp2.id,
      exceptionType: "documentation_gap",
      severity: "warning",
      title: "14-Month Documentation Gap",
      description: "No lifecycle events recorded between Nov 14, 2020 (removal from American Airlines Tulsa) and Jan 20, 2022 (receiving at Aero Manutenção São Paulo). 432 days unaccounted for.",
      evidence: JSON.stringify({
        lastEvent: { date: "2020-11-14", type: "remove", facility: "American Airlines Tulsa MRO" },
        nextEvent: { date: "2022-01-20", type: "receiving_inspection", facility: "Aero Manutenção Ltda, São Paulo" },
        gapDays: 432,
      }),
      status: "open",
    },
  });

  await prisma.exception.create({
    data: {
      componentId: comp4.id,
      exceptionType: "cycle_count_discrepancy",
      severity: "warning",
      title: "Cycle Count Decreased Between Events",
      description: "Cycle count at reinstall (Jun 2, 2023) recorded as 3,800, but the prior removal (Apr 18, 2023) recorded 3,900 cycles. Cycles cannot decrease — likely data entry error.",
      evidence: JSON.stringify({
        priorEvent: { date: "2023-05-15", type: "release_to_service", cycles: 3900 },
        currentEvent: { date: "2023-06-02", type: "install", cycles: 3800 },
        discrepancy: -100,
      }),
      status: "open",
    },
  });

  await prisma.exception.create({
    data: {
      componentId: comp5.id,
      exceptionType: "serial_number_mismatch",
      severity: "critical",
      title: "Serial Number Format Inconsistent With Manufacture Date",
      description: "S/N SN-2017-04190 uses Parker's post-2019 naming convention, but part claims 2017 manufacture date. Pre-2019 Parker parts used a different S/N format.",
      evidence: JSON.stringify({
        serialNumber: "SN-2017-04190",
        claimedManufactureDate: "2017-03-01",
        expectedFormat: "Legacy format without year prefix for pre-2019 parts",
        actualFormat: "Post-2019 convention with year prefix",
      }),
      status: "investigating",
    },
  });

  await prisma.exception.create({
    data: {
      componentId: comp5.id,
      exceptionType: "missing_birth_certificate",
      severity: "critical",
      title: "No Birth Certificate Found in OEM Records",
      description: "Parker Aerospace OASIS manufacturing database contains no 8130-3 birth certificate for S/N SN-2017-04190. The provided 8130-3 is a photocopy that cannot be verified.",
      evidence: JSON.stringify({
        serialNumber: "SN-2017-04190",
        oasisSearchDate: "2023-10-08",
        result: "No matching record found",
        provided8130: "Photocopy only — original not available",
      }),
      status: "investigating",
    },
  });

  console.log("✅ Exceptions created for existing components");

  // ════════════════════════════════════════════════════
  // EVIDENCE — Populating the empty Evidence model
  // These are photos, scans, and measurements captured during events
  // ════════════════════════════════════════════════════

  await prisma.evidence.createMany({
    data: [
      {
        eventId: comp9ReleaseEvent.id,
        type: "photo",
        fileName: "comp9-final-assembly-001.jpg",
        filePath: "/evidence/2024/comp9-final-assembly-001.jpg",
        mimeType: "image/jpeg",
        capturedAt: new Date("2024-02-08T14:30:00Z"),
        capturedBy: "M. Thompson",
        capturedByBadge: "A&P/IA #2847291",
        location: "ST Engineering Aerospace, Burlingame CA",
        hash: makeHash("comp9-evidence-photo"),
      },
      {
        eventId: comp9ReleaseEvent.id,
        type: "document_scan",
        fileName: "comp9-8130-signed-scan.pdf",
        filePath: "/evidence/2024/comp9-8130-signed-scan.pdf",
        mimeType: "application/pdf",
        capturedAt: new Date("2024-02-08T15:45:00Z"),
        capturedBy: "M. Thompson",
        capturedByBadge: "A&P/IA #2847291",
        location: "ST Engineering Aerospace, Burlingame CA",
        hash: makeHash("comp9-evidence-scan"),
      },
      {
        eventId: comp9ReleaseEvent.id,
        type: "measurement",
        fileName: "comp9-test-bench-data.csv",
        filePath: "/evidence/2024/comp9-test-bench-data.csv",
        mimeType: "text/csv",
        capturedAt: new Date("2024-02-08T13:15:00Z"),
        capturedBy: "M. Thompson",
        capturedByBadge: "A&P/IA #2847291",
        location: "ST Engineering Aerospace, Burlingame CA",
        structuredData: JSON.stringify({
          pressureTest: { value: 3000, unit: "PSI", spec: "2800-3200", result: "PASS" },
          flowRate: { value: 12.4, unit: "GPM", spec: "11.5-13.0", result: "PASS" },
          leakTest: { duration: "15 min", result: "No leaks" },
        }),
        hash: makeHash("comp9-evidence-measurement"),
      },
    ],
  });

  console.log("✅ Evidence records created for demo component");

  // ════════════════════════════════════════════════════
  // COMPONENT 10: "The Workhorse APU"
  // Honeywell 131-9A — 14 years, 3 airlines, 2 overhauls
  // ════════════════════════════════════════════════════
  const comp10 = await prisma.component.create({
    data: {
      partNumber: "3800520-3",
      serialNumber: "SN-2011-APU-3842",
      description: "131-9A Auxiliary Power Unit",
      oem: "Honeywell Aerospace",
      oemDivision: "Engines & Power Systems",
      manufactureDate: new Date("2011-05-18"),
      manufacturePlant: "Phoenix, AZ",
      totalHours: 28400,
      totalCycles: 19200,
      timeSinceOverhaul: 6400,
      cyclesSinceOverhaul: 4200,
      status: "installed",
      currentLocation: "In service",
      currentAircraft: "VT-ANK",
      currentOperator: "Air India",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp10.id,
        eventType: "manufacture",
        date: new Date("2011-05-18"),
        facility: "Honeywell Aerospace — Engines & Power Systems",
        facilityType: "oem",
        facilityCert: "HW-PHX-2011",
        performer: "Honeywell Aerospace",
        description: "Manufactured and acceptance-tested per Honeywell spec HPS-131-9A Rev. 4. Ground run: 47 hours, EGT 620°C (max 680°C). FAA Form 8130-3 issued.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        workOrderRef: "HW-MFG-2011-05182",
        hash: makeHash("comp10-manufacture"),
      },
      {
        componentId: comp10.id,
        eventType: "install",
        date: new Date("2011-09-12"),
        facility: "JetBlue Airways, JFK Maintenance",
        facilityType: "airline",
        facilityCert: "JBMR182K",
        performer: "JetBlue Airways",
        description: "Installed on N524JB (A320-200) tail cone APU position. Ground run satisfactory.",
        hoursAtEvent: 0,
        cyclesAtEvent: 0,
        aircraft: "N524JB",
        operator: "JetBlue Airways",
        workOrderRef: "JB-WO-2011-44928",
        hash: makeHash("comp10-install-1"),
      },
      {
        componentId: comp10.id,
        eventType: "remove",
        date: new Date("2016-03-20"),
        facility: "JetBlue Airways, JFK Maintenance",
        facilityType: "airline",
        performer: "JetBlue Airways",
        description: "Removed for scheduled hot section inspection at 11,000 APU hours. EGT margins declining — 655°C (limit 680°C).",
        hoursAtEvent: 11000,
        cyclesAtEvent: 7500,
        aircraft: "N524JB",
        operator: "JetBlue Airways",
        workOrderRef: "JB-RO-2016-03201",
        hash: makeHash("comp10-remove-1"),
      },
    ],
  });

  // Individual create for overhaul event — we need the ID for PartConsumed
  const comp10Overhaul1 = await prisma.lifecycleEvent.create({
    data: {
      componentId: comp10.id,
      eventType: "release_to_service",
      date: new Date("2016-06-15"),
      facility: "Honeywell Aerospace Services, Phoenix AZ",
      facilityType: "mro",
      facilityCert: "HW-MRO-PHX-145",
      performer: "Honeywell Aerospace Services",
      description: "Hot section inspection and repair. Turbine nozzle guide vanes replaced. Combustor liner recoated. Post-repair ground run: EGT 618°C. Full performance restored.",
      hoursAtEvent: 11000,
      cyclesAtEvent: 7500,
      workOrderRef: "HW-SVC-2016-28471",
      cmmReference: "CMM 49-21-01 Rev. 18",
      hash: makeHash("comp10-overhaul-1"),
    },
  });

  await prisma.partConsumed.createMany({
    data: [
      {
        eventId: comp10Overhaul1.id,
        partNumber: "3800520-NGV-2",
        description: "Turbine Nozzle Guide Vane Set",
        quantity: 1,
        sourceDoc: "8130-3 HW-MFG-2016-NGV-442",
        sourceVendor: "Honeywell Aerospace",
      },
      {
        eventId: comp10Overhaul1.id,
        partNumber: "3800520-CL-1",
        description: "Combustor Liner Coating Kit",
        quantity: 1,
        sourceDoc: "CoC-2016-HW-CL-891",
        sourceVendor: "Honeywell Aerospace",
      },
    ],
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp10.id,
        eventType: "install",
        date: new Date("2016-09-05"),
        facility: "Air India Engineering, Mumbai",
        facilityType: "airline",
        performer: "Air India",
        description: "Installed on VT-ANG (A320neo) tail cone APU position.",
        hoursAtEvent: 11000,
        cyclesAtEvent: 7500,
        aircraft: "VT-ANG",
        operator: "Air India",
        workOrderRef: "AI-WO-2016-09442",
        hash: makeHash("comp10-install-2"),
      },
      {
        componentId: comp10.id,
        eventType: "remove",
        date: new Date("2021-08-10"),
        facility: "Air India Engineering, Delhi",
        facilityType: "airline",
        performer: "Air India",
        description: "Removed for full overhaul at 22,000 APU hours. EGT margin 18°C. Shipped to HAECO Hong Kong.",
        hoursAtEvent: 22000,
        cyclesAtEvent: 15000,
        aircraft: "VT-ANG",
        operator: "Air India",
        workOrderRef: "AI-RO-2021-08104",
        hash: makeHash("comp10-remove-2"),
      },
    ],
  });

  const comp10Overhaul2 = await prisma.lifecycleEvent.create({
    data: {
      componentId: comp10.id,
      eventType: "release_to_service",
      date: new Date("2021-11-28"),
      facility: "HAECO, Hong Kong",
      facilityType: "mro",
      facilityCert: "HKCAD-145-HAECO-001",
      performer: "HAECO Engine Services",
      description: "Full overhaul per CMM 49-21-01 Rev. 20. Turbine wheel replaced, all bearings replaced, gearbox overhauled. EGT 612°C, oil consumption 0.01 qt/hr.",
      hoursAtEvent: 22000,
      cyclesAtEvent: 15000,
      workOrderRef: "HAECO-WO-2021-08842",
      cmmReference: "CMM 49-21-01 Rev. 20",
      hash: makeHash("comp10-overhaul-2"),
    },
  });

  await prisma.partConsumed.createMany({
    data: [
      {
        eventId: comp10Overhaul2.id,
        partNumber: "3800520-TW-3",
        serialNumber: "TW-2021-4481",
        description: "Turbine Wheel Assembly",
        quantity: 1,
        sourceDoc: "8130-3 HW-MFG-2021-TW-4481",
        sourceVendor: "Honeywell Aerospace",
      },
      {
        eventId: comp10Overhaul2.id,
        partNumber: "3800520-BRG-KIT",
        description: "Main Bearing Kit (3x bearings)",
        quantity: 1,
        sourceDoc: "CoC-2021-HAECO-BK-221",
        sourceVendor: "SKF Aerospace",
      },
      {
        eventId: comp10Overhaul2.id,
        partNumber: "3800520-GB-SEAL",
        description: "Gearbox Seal Kit",
        quantity: 1,
        sourceDoc: "CoC-2021-HAECO-GS-118",
        sourceVendor: "Parker Hannifin",
      },
    ],
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      {
        componentId: comp10.id,
        eventType: "install",
        date: new Date("2022-01-15"),
        facility: "Air India Engineering, Mumbai",
        facilityType: "airline",
        performer: "Air India",
        description: "Installed on VT-ANK (A320neo) tail cone APU position.",
        hoursAtEvent: 22000,
        cyclesAtEvent: 15000,
        aircraft: "VT-ANK",
        operator: "Air India",
        hash: makeHash("comp10-install-3"),
      },
      {
        componentId: comp10.id,
        eventType: "detailed_inspection",
        date: new Date("2024-11-20"),
        facility: "Air India Engineering, Delhi",
        facilityType: "airline",
        performer: "Raj Patel",
        performerCert: "DGCA AME #IN-9284",
        description: "Borescope inspection during C-check. Combustor section clean. Turbine blades show normal erosion for 6,400 hours since overhaul. EGT margin 42°C — healthy. Next overhaul at 33,000 APU hours.",
        hoursAtEvent: 28400,
        cyclesAtEvent: 19200,
        aircraft: "VT-ANK",
        operator: "Air India",
        hash: makeHash("comp10-inspection"),
      },
    ],
  });

  await prisma.document.createMany({
    data: [
      { componentId: comp10.id, docType: "birth_certificate", title: "FAA Form 8130-3 — Manufacture", aiSummary: "Honeywell 131-9A APU birth certificate. Phoenix AZ, May 2011.", hash: makeHash("comp10-birth") },
      { componentId: comp10.id, docType: "8130", title: "FAA Form 8130-3 — HAECO Overhaul (Nov 2021)", aiSummary: "Full overhaul release. Turbine wheel, bearings, gearbox seals replaced.", hash: makeHash("comp10-8130") },
      { componentId: comp10.id, docType: "cmm", title: "CMM 49-21-01 Rev. 20 — 131-9A APU", aiSummary: "Component Maintenance Manual for the Honeywell 131-9A Auxiliary Power Unit." },
    ],
  });

  console.log("✅ Component 10: The Workhorse APU (3800520-3)");

  // ════════════════════════════════════════════════════
  // COMPONENT 11: "Life Limit Approaching"
  // Safran MLG Retract Actuator — LLP at 93% of cycle limit
  // ════════════════════════════════════════════════════
  const comp11 = await prisma.component.create({
    data: {
      partNumber: "SAF-MLG-RA-201",
      serialNumber: "SN-2012-LG-7842",
      description: "Main Landing Gear Retract Actuator",
      oem: "Safran Landing Systems",
      oemDivision: "Actuation Systems",
      manufactureDate: new Date("2012-09-28"),
      manufacturePlant: "Molsheim, France",
      totalHours: 32100,
      totalCycles: 18600,
      timeSinceOverhaul: 8100,
      cyclesSinceOverhaul: 4600,
      status: "installed",
      currentLocation: "In service",
      currentAircraft: "JA-812J",
      currentOperator: "Japan Airlines",
      isLifeLimited: true,
      lifeLimit: 20000,
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      { componentId: comp11.id, eventType: "manufacture", date: new Date("2012-09-28"), facility: "Safran Landing Systems, Molsheim, France", facilityType: "oem", performer: "Safran Landing Systems", description: "Manufactured and tested per EASA Form 1. Life-limited part: hard limit of 20,000 landing cycles.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp11-manufacture") },
      { componentId: comp11.id, eventType: "install", date: new Date("2013-01-15"), facility: "Japan Airlines Engineering, Narita", facilityType: "airline", performer: "Japan Airlines", description: "Installed on JA-812J (787-8) left main landing gear retract actuator position.", hoursAtEvent: 0, cyclesAtEvent: 0, aircraft: "JA-812J", operator: "Japan Airlines", hash: makeHash("comp11-install-1") },
      { componentId: comp11.id, eventType: "remove", date: new Date("2018-06-20"), facility: "Japan Airlines Engineering, Narita", facilityType: "airline", performer: "Japan Airlines", description: "Removed for scheduled overhaul at 14,000 cycles (70% of life limit).", hoursAtEvent: 20000, cyclesAtEvent: 14000, aircraft: "JA-812J", operator: "Japan Airlines", hash: makeHash("comp11-remove-1") },
      { componentId: comp11.id, eventType: "release_to_service", date: new Date("2018-09-15"), facility: "Safran Landing Systems MRO, Molsheim", facilityType: "mro", facilityCert: "FR.145.0089", performer: "Safran Landing Systems", description: "Overhauled per CMM 32-30-01. All seals replaced, cylinder bore rehoned, piston chrome replated. Remaining life: 6,000 cycles.", hoursAtEvent: 20000, cyclesAtEvent: 14000, cmmReference: "CMM 32-30-01 Rev. 6", hash: makeHash("comp11-overhaul") },
      { componentId: comp11.id, eventType: "install", date: new Date("2018-12-01"), facility: "Japan Airlines Engineering, Narita", facilityType: "airline", performer: "Japan Airlines", description: "Reinstalled on JA-812J (787-8). Remaining life: 6,000 cycles.", hoursAtEvent: 20000, cyclesAtEvent: 14000, aircraft: "JA-812J", operator: "Japan Airlines", hash: makeHash("comp11-install-2") },
      { componentId: comp11.id, eventType: "detailed_inspection", date: new Date("2025-06-10"), facility: "Japan Airlines Engineering, Narita", facilityType: "airline", performer: "Kenji Tanaka", performerCert: "JCAB 1st Class #JA-28471", description: "C-check inspection. Actuator operating normally. Current cycles: 18,600 of 20,000 limit (93% consumed). Remaining: 1,400 cycles (~12 months at 120 cycles/month).", hoursAtEvent: 32100, cyclesAtEvent: 18600, aircraft: "JA-812J", operator: "Japan Airlines", notes: "JAL procurement should source replacement actuator. Lead time for new Safran MLG actuator: 8-12 months.", hash: makeHash("comp11-inspection") },
    ],
  });

  await prisma.alert.create({
    data: {
      componentId: comp11.id,
      alertType: "life_limit_approaching",
      severity: "warning",
      title: "Life-Limited Part at 93% — 1,400 Cycles Remaining",
      description: "MLG Retract Actuator (SAF-MLG-RA-201) has consumed 18,600 of 20,000 allowed cycles (93%). At 120 cycles/month, limit reached in ~12 months. Replacement lead time: 8-12 months. Procurement must begin immediately.",
      status: "open",
    },
  });

  console.log("✅ Component 11: Life Limit Approaching (SAF-MLG-RA-201)");

  // ════════════════════════════════════════════════════
  // COMPONENT 12: "AD Compliance Required"
  // Collins AHRS with mandatory Airworthiness Directive
  // ════════════════════════════════════════════════════
  const comp12 = await prisma.component.create({
    data: {
      partNumber: "822-2189-002",
      serialNumber: "SN-2016-AV-11842",
      description: "AHC-3000 Attitude Heading Reference System",
      oem: "Collins Aerospace (RTX)",
      oemDivision: "Avionics",
      manufactureDate: new Date("2016-03-14"),
      manufacturePlant: "Cedar Rapids, IA",
      totalHours: 21400,
      totalCycles: 14200,
      status: "in-repair",
      currentLocation: "Collins Aerospace, Cedar Rapids IA",
      currentOperator: "Cathay Pacific",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      { componentId: comp12.id, eventType: "manufacture", date: new Date("2016-03-14"), facility: "Collins Aerospace, Cedar Rapids IA", facilityType: "oem", performer: "Collins Aerospace", description: "Manufactured and tested. Firmware version v4.2 installed. FAA Form 8130-3 issued.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp12-manufacture") },
      { componentId: comp12.id, eventType: "install", date: new Date("2016-07-22"), facility: "Cathay Pacific Engineering, Hong Kong", facilityType: "airline", performer: "Cathay Pacific", description: "Installed on B-LRC (A350-900) AHRS position #1.", hoursAtEvent: 0, cyclesAtEvent: 0, aircraft: "B-LRC", operator: "Cathay Pacific", hash: makeHash("comp12-install") },
      { componentId: comp12.id, eventType: "detailed_inspection", date: new Date("2023-08-15"), facility: "Cathay Pacific Engineering, Hong Kong", facilityType: "airline", performer: "Cathay Pacific", description: "Routine check during C-check. All parameters nominal. Firmware v4.2 confirmed.", hoursAtEvent: 18200, cyclesAtEvent: 12100, aircraft: "B-LRC", operator: "Cathay Pacific", hash: makeHash("comp12-inspection") },
      { componentId: comp12.id, eventType: "remove", date: new Date("2025-02-18"), facility: "Cathay Pacific Engineering, Hong Kong", facilityType: "airline", performer: "Cathay Pacific", description: "Removed for AD 2025-03-08 compliance — mandatory firmware update from v4.2 to v5.1. Shipped to Collins Aerospace Cedar Rapids.", hoursAtEvent: 21400, cyclesAtEvent: 14200, aircraft: "B-LRC", operator: "Cathay Pacific", hash: makeHash("comp12-remove") },
      { componentId: comp12.id, eventType: "receiving_inspection", date: new Date("2025-03-05"), facility: "Collins Aerospace, Cedar Rapids IA", facilityType: "oem", facilityCert: "CW1R197Y", performer: "Collins Aerospace", description: "Received for AD compliance. Confirmed firmware v4.2 — update to v5.1 required per AD 2025-03-08. Modification in progress.", hoursAtEvent: 21400, cyclesAtEvent: 14200, hash: makeHash("comp12-receiving") },
    ],
  });

  await prisma.alert.create({ data: { componentId: comp12.id, alertType: "overdue_inspection", severity: "warning", title: "AD 2025-03-08 Compliance Pending — Firmware Update Required", description: "Collins AHC-3000 AHRS requires firmware update from v4.2 to v5.1 per AD 2025-03-08. Currently at Collins Aerospace for modification. Cannot return to service until complete.", status: "open" } });

  await prisma.exception.create({ data: { componentId: comp12.id, exceptionType: "unsigned_document", severity: "warning", title: "AD Compliance Tracking Form Pending Signature", description: "AD 2025-03-08 compliance form completed but awaiting final signature from Collins Aerospace DAR before release.", evidence: JSON.stringify({ adNumber: "AD 2025-03-08", formStatus: "Completed, pending signature", requiredSignatory: "Collins DAR" }), status: "open" } });

  console.log("✅ Component 12: AD Compliance Required (822-2189-002)");

  // ════════════════════════════════════════════════════
  // COMPONENT 13: "The Broker Chain"
  // Parker Fuel Manifold that went through 3 brokers
  // ════════════════════════════════════════════════════
  const comp13 = await prisma.component.create({
    data: {
      partNumber: "2722100-5",
      serialNumber: "SN-2015-FM-4821",
      description: "Gas Turbine Fuel Manifold",
      oem: "Parker Aerospace",
      oemDivision: "Gas Turbine Fuel Systems Division",
      manufactureDate: new Date("2015-04-12"),
      manufacturePlant: "San Diego, CA",
      totalHours: 18200,
      totalCycles: 11800,
      timeSinceOverhaul: 9000,
      cyclesSinceOverhaul: 5800,
      status: "installed",
      currentLocation: "In service",
      currentAircraft: "TC-JVK",
      currentOperator: "Turkish Airlines",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      { componentId: comp13.id, eventType: "manufacture", date: new Date("2015-04-12"), facility: "Parker Aerospace — Gas Turbine Fuel Systems Division", facilityType: "oem", performer: "Parker Aerospace", description: "Manufactured and tested per specification. FAA Form 8130-3 issued.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp13-manufacture") },
      { componentId: comp13.id, eventType: "install", date: new Date("2015-08-20"), facility: "Turkish Technic, Istanbul", facilityType: "airline", performer: "Turkish Airlines", description: "Installed on TC-JHN (A321) engine #1 fuel manifold position.", hoursAtEvent: 0, cyclesAtEvent: 0, aircraft: "TC-JHN", operator: "Turkish Airlines", hash: makeHash("comp13-install-1") },
      { componentId: comp13.id, eventType: "remove", date: new Date("2020-03-15"), facility: "Turkish Technic, Istanbul", facilityType: "airline", performer: "Turkish Airlines", description: "Removed for scheduled overhaul at 9,200 hours.", hoursAtEvent: 9200, cyclesAtEvent: 6000, aircraft: "TC-JHN", operator: "Turkish Airlines", hash: makeHash("comp13-remove") },
      { componentId: comp13.id, eventType: "transfer", date: new Date("2020-06-10"), facility: "Aviall Services, Dallas TX", facilityType: "distributor", performer: "Aviall Services", description: "Received from Turkish Technic. Full documentation package. Placed in serviceable inventory.", hoursAtEvent: 9200, cyclesAtEvent: 6000, hash: makeHash("comp13-transfer-1") },
      { componentId: comp13.id, eventType: "transfer", date: new Date("2021-02-22"), facility: "AeroParts International, Amsterdam", facilityType: "broker", performer: "AeroParts International", description: "Purchased from Aviall Services. Documentation verified. Transferred to European inventory.", hoursAtEvent: 9200, cyclesAtEvent: 6000, hash: makeHash("comp13-transfer-2") },
      { componentId: comp13.id, eventType: "transfer", date: new Date("2021-09-15"), facility: "TurkParts Ltd, Istanbul", facilityType: "broker", performer: "TurkParts Ltd", description: "Purchased from AeroParts International. Documentation package complete.", hoursAtEvent: 9200, cyclesAtEvent: 6000, hash: makeHash("comp13-transfer-3") },
      { componentId: comp13.id, eventType: "receiving_inspection", date: new Date("2022-01-10"), facility: "Turkish Technic, Istanbul", facilityType: "mro", performer: "Turkish Technic Quality", description: "Received from TurkParts Ltd. Full documentation reviewed — all 8130-3 tags present through entire broker chain. Provenance verified. Accepted for installation.", hoursAtEvent: 9200, cyclesAtEvent: 6000, hash: makeHash("comp13-receiving") },
      { componentId: comp13.id, eventType: "install", date: new Date("2022-03-18"), facility: "Turkish Technic, Istanbul", facilityType: "airline", performer: "Turkish Airlines", description: "Installed on TC-JVK (737-800) engine #2 fuel manifold position.", hoursAtEvent: 9200, cyclesAtEvent: 6000, aircraft: "TC-JVK", operator: "Turkish Airlines", hash: makeHash("comp13-install-2") },
    ],
  });

  await prisma.alert.create({ data: { componentId: comp13.id, alertType: "provenance_gap", severity: "info", title: "Three-Broker Chain Verified", description: "Part transferred through 3 brokers (Aviall → AeroParts International → TurkParts) between 2020-2022. Investigation verified complete documentation at each step. No gaps found.", status: "resolved", resolvedAt: new Date("2022-01-15") } });

  console.log("✅ Component 13: The Broker Chain (2722100-5)");

  // ════════════════════════════════════════════════════
  // COMPONENT 14: "Shelf Life Expired"
  // Eaton Hydraulic Accumulator with expired rubber bladder
  // ════════════════════════════════════════════════════
  const comp14 = await prisma.component.create({
    data: {
      partNumber: "AC-2847-3",
      serialNumber: "SN-2019-HA-2841",
      description: "Hydraulic Accumulator",
      oem: "Eaton Aerospace",
      manufactureDate: new Date("2019-03-15"),
      manufacturePlant: "Jackson, MS",
      totalHours: 0,
      totalCycles: 0,
      status: "quarantined",
      currentLocation: "Ethiopian Airlines MRO, Addis Ababa",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      { componentId: comp14.id, eventType: "manufacture", date: new Date("2019-03-15"), facility: "Eaton Aerospace, Jackson MS", facilityType: "oem", performer: "Eaton Aerospace", description: "Manufactured and tested. Rubber bladder accumulator with 5-year shelf life. Expiry: March 15, 2024.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp14-manufacture") },
      { componentId: comp14.id, eventType: "transfer", date: new Date("2019-06-20"), facility: "Global Aviation Supply, Miami FL", facilityType: "distributor", performer: "Global Aviation Supply", description: "Received new-in-box with 8130-3 and shelf life tag. Placed in warehouse inventory.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp14-transfer-1") },
      { componentId: comp14.id, eventType: "transfer", date: new Date("2024-08-12"), facility: "Ethiopian Airlines Procurement", facilityType: "broker", performer: "Global Aviation Supply", description: "Sold to Ethiopian Airlines. Part has been in warehouse storage for 5+ years.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp14-transfer-2") },
      { componentId: comp14.id, eventType: "receiving_inspection", date: new Date("2024-09-05"), facility: "Ethiopian Airlines MRO, Addis Ababa", facilityType: "mro", performer: "Tesfaye Bekele", performerCert: "ECAA AMT #ET-5842", description: "REJECTION: Shelf life expired March 15, 2024 — part is 6 months past expiry. Rubber bladder elastomer integrity cannot be verified. QUARANTINED — cannot be installed.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp14-receiving") },
    ],
  });

  await prisma.alert.create({ data: { componentId: comp14.id, alertType: "overdue_inspection", severity: "critical", title: "Shelf Life Expired — Hydraulic Accumulator Quarantined", description: "Eaton AC-2847-3 exceeded 5-year shelf life (expired March 2024, received Sept 2024). Rubber bladder cannot be verified as airworthy. Quarantined. Disposition: return to supplier or scrap.", status: "open" } });

  await prisma.exception.create({ data: { componentId: comp14.id, exceptionType: "date_inconsistency", severity: "critical", title: "Part Delivered After Shelf Life Expiry", description: "Accumulator manufactured March 2019 with 5-year shelf life. Delivered to Ethiopian Airlines August 2024 — 5 months past expiry.", evidence: JSON.stringify({ manufactureDate: "2019-03-15", shelfLifeExpiry: "2024-03-15", deliveryDate: "2024-08-12", monthsPastExpiry: 5 }), status: "open" } });

  console.log("✅ Component 14: Shelf Life Expired (AC-2847-3)");

  // ════════════════════════════════════════════════════
  // COMPONENT 15: "Cross-Border Transfer"
  // Hamilton Sundstrand IDG — FAA to EASA jurisdiction
  // ════════════════════════════════════════════════════
  const comp15 = await prisma.component.create({
    data: {
      partNumber: "23643-2",
      serialNumber: "SN-2014-IDG-9421",
      description: "Integrated Drive Generator (IDG)",
      oem: "Hamilton Sundstrand (Collins Aerospace)",
      manufactureDate: new Date("2014-06-18"),
      manufacturePlant: "Windsor Locks, CT",
      totalHours: 24800,
      totalCycles: 16200,
      timeSinceOverhaul: 14800,
      cyclesSinceOverhaul: 9700,
      status: "installed",
      currentLocation: "In service",
      currentAircraft: "EC-MYP",
      currentOperator: "Iberia",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      { componentId: comp15.id, eventType: "manufacture", date: new Date("2014-06-18"), facility: "Hamilton Sundstrand, Windsor Locks CT", facilityType: "oem", performer: "Hamilton Sundstrand", description: "Manufactured under FAA jurisdiction. FAA Form 8130-3 issued.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp15-manufacture") },
      { componentId: comp15.id, eventType: "install", date: new Date("2014-10-05"), facility: "American Airlines DFW Maintenance", facilityType: "airline", performer: "American Airlines", description: "Installed on N303AA (A321) IDG position.", hoursAtEvent: 0, cyclesAtEvent: 0, aircraft: "N303AA", operator: "American Airlines", hash: makeHash("comp15-install-1") },
      { componentId: comp15.id, eventType: "remove", date: new Date("2018-04-22"), facility: "American Airlines DFW Maintenance", facilityType: "airline", performer: "American Airlines", description: "Removed for scheduled overhaul at 10,000 hours.", hoursAtEvent: 10000, cyclesAtEvent: 6500, aircraft: "N303AA", operator: "American Airlines", hash: makeHash("comp15-remove") },
      { componentId: comp15.id, eventType: "release_to_service", date: new Date("2018-08-15"), facility: "Collins Aerospace, Windsor Locks CT", facilityType: "mro", facilityCert: "CW1R197Y", performer: "Collins Aerospace", description: "Full overhaul per CMM 24-20-00. All tests passed. FAA Form 8130-3 issued.", hoursAtEvent: 10000, cyclesAtEvent: 6500, hash: makeHash("comp15-overhaul") },
      { componentId: comp15.id, eventType: "transfer", date: new Date("2019-03-10"), facility: "Iberia Maintenance, Madrid", facilityType: "airline", performer: "Iberia Maintenance", description: "FAA-to-EASA cross-border transfer. Dual-release documentation: FAA Form 8130-3 + EASA Form 1 issued for regulatory compliance.", hoursAtEvent: 10000, cyclesAtEvent: 6500, hash: makeHash("comp15-transfer") },
      { componentId: comp15.id, eventType: "install", date: new Date("2019-06-22"), facility: "Iberia Maintenance, Madrid", facilityType: "airline", performer: "Iberia", description: "Installed on EC-MYP (A321neo) IDG position.", hoursAtEvent: 10000, cyclesAtEvent: 6500, aircraft: "EC-MYP", operator: "Iberia", hash: makeHash("comp15-install-2") },
    ],
  });

  // Individual create for oil analysis inspection — needs Evidence attached
  const comp15Inspection = await prisma.lifecycleEvent.create({
    data: {
      componentId: comp15.id,
      eventType: "detailed_inspection",
      date: new Date("2024-09-15"),
      facility: "Iberia Maintenance, Madrid",
      facilityType: "airline",
      performer: "Miguel Fernandez",
      performerCert: "EASA B1 #ES-14821",
      description: "Spectrographic oil analysis. Iron: 7 ppm (normal <10). Copper: 4 ppm (normal <8). Chromium: 1 ppm (normal <3). All within limits. Continue scheduled monitoring.",
      hoursAtEvent: 24800,
      cyclesAtEvent: 16200,
      aircraft: "EC-MYP",
      operator: "Iberia",
      hash: makeHash("comp15-inspection"),
    },
  });

  await prisma.evidence.create({
    data: {
      eventId: comp15Inspection.id,
      type: "measurement",
      fileName: "comp15-idg-oil-analysis-2024Q3.pdf",
      filePath: "/evidence/2024/comp15-idg-oil-analysis-2024Q3.pdf",
      mimeType: "application/pdf",
      capturedAt: new Date("2024-09-15"),
      capturedBy: "Miguel Fernandez",
      capturedByBadge: "EASA B1 #ES-14821",
      location: "Iberia Maintenance, Madrid",
      structuredData: JSON.stringify({ ironPpm: 7, copperPpm: 4, chromiumPpm: 1, siliconPpm: 3, oilCondition: "Normal", recommendation: "Continue monitoring" }),
      hash: makeHash("comp15-oil-evidence"),
    },
  });

  await prisma.exception.create({ data: { componentId: comp15.id, exceptionType: "documentation_gap", severity: "info", title: "Brief FAA-to-EASA Transfer Paperwork Gap (18 days)", description: "18-day gap between transfer initiation and dual-release documentation completion. Both FAA and EASA certificates verified and filed.", evidence: JSON.stringify({ transferDate: "2019-03-10", documentationComplete: "2019-03-28", gapDays: 18 }), status: "resolved", resolvedAt: new Date("2019-04-15"), resolutionNotes: "Dual-release documentation completed. No airworthiness impact." } });

  console.log("✅ Component 15: Cross-Border Transfer (23643-2)");

  // ════════════════════════════════════════════════════
  // COMPONENT 16: "Fleet Service Bulletin"
  // Moog Servo Valve with SB for torque motor winding issue
  // ════════════════════════════════════════════════════
  const comp16 = await prisma.component.create({
    data: {
      partNumber: "650-241",
      serialNumber: "SN-2018-SV-5521",
      description: "Electrohydraulic Servo Valve",
      oem: "Moog Inc.",
      manufactureDate: new Date("2018-04-20"),
      manufacturePlant: "East Aurora, NY",
      totalHours: 16800,
      totalCycles: 7200,
      timeSinceOverhaul: 0,
      cyclesSinceOverhaul: 0,
      status: "serviceable",
      currentLocation: "Korean Air MRO, Incheon",
      currentOperator: "Korean Air",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      { componentId: comp16.id, eventType: "manufacture", date: new Date("2018-04-20"), facility: "Moog Inc., East Aurora NY", facilityType: "oem", performer: "Moog Inc.", description: "Manufactured batch 2018-Q2. FAA Form 8130-3 issued.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp16-manufacture") },
      { componentId: comp16.id, eventType: "install", date: new Date("2018-09-10"), facility: "Korean Air MRO, Incheon", facilityType: "airline", performer: "Korean Air", description: "Installed on HL7583 (777-300ER) LH aileron servo valve position.", hoursAtEvent: 0, cyclesAtEvent: 0, aircraft: "HL7583", operator: "Korean Air", hash: makeHash("comp16-install") },
      { componentId: comp16.id, eventType: "remove", date: new Date("2024-12-18"), facility: "Korean Air MRO, Incheon", facilityType: "airline", performer: "Korean Air", description: "Removed per mandatory SB 650-241-72-008 — torque motor winding insulation issue affecting batch 2018-Q1 through Q3.", hoursAtEvent: 16800, cyclesAtEvent: 7200, aircraft: "HL7583", operator: "Korean Air", hash: makeHash("comp16-remove") },
      { componentId: comp16.id, eventType: "receiving_inspection", date: new Date("2025-01-08"), facility: "Korean Air MRO, Incheon", facilityType: "mro", performer: "Korean Air Hydraulic Shop", description: "Confirmed unit from affected batch 2018-Q2. Torque motor winding inspection per SB pending.", hoursAtEvent: 16800, cyclesAtEvent: 7200, hash: makeHash("comp16-receiving") },
    ],
  });

  const comp16SbRepair = await prisma.lifecycleEvent.create({
    data: {
      componentId: comp16.id,
      eventType: "repair",
      date: new Date("2025-01-22"),
      facility: "Korean Air MRO, Incheon",
      facilityType: "airline",
      facilityCert: "KOCA KR-145-0001",
      performer: "Korean Air Hydraulic Component Shop",
      description: "SB 650-241-72-008 applied. Old torque motor winding removed — insulation showed micro-cracking. New winding kit installed. Tested: null bias 0.03%, frequency response -3dB at 40Hz, leakage 0.5 cc/min. All within spec.",
      hoursAtEvent: 16800,
      cyclesAtEvent: 7200,
      cmmReference: "SB 650-241-72-008 Rev 1",
      hash: makeHash("comp16-sb-repair"),
    },
  });

  await prisma.partConsumed.create({
    data: {
      eventId: comp16SbRepair.id,
      partNumber: "650-241-TM-KIT-01",
      serialNumber: "TMK-2024-0842",
      description: "Torque Motor Winding Replacement Kit",
      quantity: 1,
      sourceDoc: "Moog PO-2024-SB-4218",
      sourceVendor: "Moog Inc. (OEM direct)",
    },
  });

  await prisma.document.createMany({
    data: [
      { componentId: comp16.id, docType: "birth_certificate", title: "FAA Form 8130-3 — Manufacture", hash: makeHash("comp16-birth") },
      { componentId: comp16.id, docType: "service_bulletin", title: "SB 650-241-72-008 — Torque Motor Winding Insulation", aiSummary: "Mandatory SB for torque motor winding insulation issue. Affects batch 2018-Q1 through Q3. Compliance within 90 days of issue." },
    ],
  });

  console.log("✅ Component 16: Fleet Service Bulletin (650-241)");

  // ════════════════════════════════════════════════════
  // COMPONENT 17: "Unauthorized Mod Discovery"
  // Collins Transponder with non-approved connector found inside
  // ════════════════════════════════════════════════════
  const comp17 = await prisma.component.create({
    data: {
      partNumber: "622-9352-016",
      serialNumber: "SN-2013-TP-8842",
      description: "TDR-94D Mode S Transponder",
      oem: "Collins Aerospace",
      oemDivision: "Avionics",
      manufactureDate: new Date("2013-11-08"),
      manufacturePlant: "Cedar Rapids, IA",
      totalHours: 24200,
      totalCycles: 18400,
      status: "in-repair",
      currentLocation: "Collins Aerospace, Cedar Rapids IA",
      currentOperator: "Allegiant Air",
    },
  });

  await prisma.lifecycleEvent.createMany({
    data: [
      { componentId: comp17.id, eventType: "manufacture", date: new Date("2013-11-08"), facility: "Collins Aerospace, Cedar Rapids IA", facilityType: "oem", performer: "Collins Aerospace", description: "Manufactured and acceptance-tested. Original connector: Collins P/N 346-0248-010 (MIL-spec rated). FAA Form 8130-3 issued.", hoursAtEvent: 0, cyclesAtEvent: 0, hash: makeHash("comp17-manufacture") },
      { componentId: comp17.id, eventType: "install", date: new Date("2014-02-18"), facility: "Allegiant Air, Las Vegas", facilityType: "airline", performer: "Allegiant Air", description: "Installed on N218NV (MD-83) transponder 1 position. System test: Mode A, C, S responding. TCAS interface verified.", hoursAtEvent: 0, cyclesAtEvent: 0, aircraft: "N218NV", operator: "Allegiant Air", hash: makeHash("comp17-install") },
      { componentId: comp17.id, eventType: "remove", date: new Date("2024-08-12"), facility: "Allegiant Air, Las Vegas", facilityType: "airline", performer: "Allegiant Air", description: "Removed for scheduled overhaul. No faults reported. Shipped to Collins Aerospace Cedar Rapids.", hoursAtEvent: 24200, cyclesAtEvent: 18400, aircraft: "N218NV", operator: "Allegiant Air", hash: makeHash("comp17-remove") },
      { componentId: comp17.id, eventType: "receiving_inspection", date: new Date("2024-08-28"), facility: "Collins Aerospace, Cedar Rapids IA", facilityType: "oem", facilityCert: "CW1R197Y", performer: "Rebecca Torres", performerCert: "A&P #3921842", description: "DISCREPANCY: Original MIL-spec connector (P/N 346-0248-010) REPLACED with commercial Amphenol connector. Three internal wires rerouted. NO Form 337 on file. Unit on HOLD.", hoursAtEvent: 24200, cyclesAtEvent: 18400, hash: makeHash("comp17-receiving") },
      { componentId: comp17.id, eventType: "teardown", date: new Date("2024-09-10"), facility: "Collins Aerospace, Cedar Rapids IA", facilityType: "oem", performer: "Collins Investigation Team", description: "Full teardown. Commercial connector not rated for aviation vibration/temp. Wire reroute bypasses damaged pin. Solder joints IPC Class 2, not Class 3 aerospace standard. Likely unauthorized field repair.", hoursAtEvent: 24200, cyclesAtEvent: 18400, notes: "The modification was competent but undocumented — no engineering order, no approved parts, no Form 337. Classic 'midnight repair.'", hash: makeHash("comp17-teardown") },
      { componentId: comp17.id, eventType: "detailed_inspection", date: new Date("2024-09-18"), facility: "Collins Aerospace, Cedar Rapids IA", facilityType: "oem", performer: "Collins Quality Investigation", description: "Formal investigation hold. FAA FSDO Cedar Rapids notified. Allegiant Air reviewing records. Collins Engineering assessing if unit can be restored to type-certificated configuration.", hoursAtEvent: 24200, cyclesAtEvent: 18400, notes: "Key question: when was the mod performed? MD-83 fleet has changed hands multiple times. Modification could be decades old.", hash: makeHash("comp17-investigation") },
    ],
  });

  await prisma.alert.create({ data: { componentId: comp17.id, alertType: "record_mismatch", severity: "critical", title: "Unauthorized Modification — Non-Approved Connector Found", description: "Collins TDR-94D transponder found with unauthorized modification during OEM overhaul. Original MIL-spec connector replaced with commercial Amphenol, wires rerouted, no Form 337. FAA FSDO notified.", status: "investigating" } });

  await prisma.exception.create({ data: { componentId: comp17.id, exceptionType: "part_number_mismatch", severity: "critical", title: "Non-Approved Connector Installed Inside Unit", description: "Original Collins MIL-spec connector (P/N 346-0248-010, MIL-DTL-38999) replaced with non-aviation-rated commercial Amphenol connector. Violation of 14 CFR 43.13.", evidence: JSON.stringify({ approvedConnector: { pn: "346-0248-010", spec: "MIL-DTL-38999" }, foundConnector: { pn: "Unknown", manufacturer: "Amphenol commercial" }, findings: ["Connector swapped", "3 wires rerouted", "Solder IPC Class 2 not 3", "No Form 337"], violations: ["14 CFR 43.13", "14 CFR 91.403"] }), status: "investigating" } });

  console.log("✅ Component 17: Unauthorized Mod Discovery (622-9352-016)");

  // ════════════════════════════════════════════════════
  // ADDITIONAL KNOWLEDGE ENTRIES
  // ════════════════════════════════════════════════════
  await prisma.knowledgeEntry.createMany({
    data: [
      {
        partFamily: "Honeywell 131-9A APU",
        topic: "Thermal distress in turbine nozzle guide vanes",
        expertName: "Lisa Park",
        expertYears: 18,
        expertCert: "EASA B1",
        description: "NGV thermal distress follows a predictable progression: (1) Sulfidation — yellow-green discoloration on leading edges from sulfur in fuel, normal up to 30% coverage. (2) Oxidation scaling — dark rough crust where the protective oxide layer breaks down. (3) Thermal cracking — hairline cracks at trailing edge, >3mm = automatic reject. Key tip: always inspect 12 o'clock vanes first — heat rises in the combustor, so these run hottest and show distress first.",
        tags: "apu,honeywell,thermal,borescope,nozzle-guide-vanes,sulfidation",
        cmmReference: "CMM 49-10-00 Rev. 46, Section 5.2",
      },
      {
        partFamily: "Landing Gear Actuators",
        topic: "Managing life-limited parts approaching cycle limits",
        expertName: "Kenji Tanaka",
        expertYears: 25,
        expertCert: "JCAB 1st Class",
        description: "Above 80% life consumed = planning mode. Cross-reference cycle counts from 3 sources (aircraft log, component tag, fleet system) — discrepancies of hundreds of cycles happen more than you'd think. Start procurement at 85% (Safran actuator lead time: 6-8 months). Schedule removal with a C-check, not as a surprise. And please stop asking if overhaul can extend the limit — it can't. Metal fatigue is cumulative. No amount of polishing changes how many times it's been bent.",
        tags: "landing-gear,llp,life-limited,procurement,planning,fatigue",
        cmmReference: "Safran CMM 32-30-01 Rev. 12, Section 1.3",
      },
      {
        partFamily: "Hamilton Sundstrand IDG",
        topic: "Interpreting spectrographic oil analysis results",
        expertName: "Carlos Mendoza",
        expertYears: 15,
        expertCert: "A&P",
        description: "IDG oil metal cheat sheet: Iron = gears and bearings (normal <10 ppm). Copper = bearing cages (normal <8 ppm, trending up = cage wearing, 500-1000 hrs before bearing failure). Silicon = external contamination (dust or sealant, not internal). Chromium = hardened surface breakdown (the scary one — >3 ppm = remove within 200 hours). Always trend over 4+ samples. One high reading might be contamination. Four consecutive increases = real wear. Rate of change matters more than absolute values.",
        tags: "idg,oil-analysis,spectrographic,wear-metals,iron,copper,chromium",
        cmmReference: "CMM 24-20-00 Rev. 22, Section 4.6",
      },
      {
        partFamily: "Avionics General",
        topic: "Why firmware version tracking matters for airworthiness",
        expertName: "Sarah Kim",
        expertYears: 20,
        expertCert: "A&P/IA",
        description: "Firmware version is part of the type certificate — wrong version = aircraft not airworthy, even if the box works perfectly. I've seen airlines ground entire fleets because they couldn't prove which firmware version was on their AHRS units when an AD came out. Best practices: Record firmware at every install/remove/test. When OEM releases new firmware, immediately check fleet exposure. During receiving inspection, ALWAYS verify firmware matches the 8130-3. I've caught mismatches more times than I can count.",
        tags: "avionics,firmware,airworthiness,type-certificate,compliance,ad",
        cmmReference: "AC 20-188",
      },
    ],
  });

  console.log("✅ Additional knowledge entries created");

  // ════════════════════════════════════════════════════
  // MOBILE CAPTURE SYSTEM — Demo Organization + Technicians
  // These support the AeroVision Capture iPhone app
  // ════════════════════════════════════════════════════

  const demoOrg = await prisma.organization.create({
    data: {
      id: "demo-precision-aero",
      name: "Precision Aerospace MRO",
      faaRepairStationCert: "Y4PR509K",
      address: "2800 Airport Blvd, Suite 100",
      city: "Austin",
      state: "TX",
      zip: "78719",
      phone: "(512) 555-0147",
      email: "ops@precisionaero.example.com",
    },
  });

  // Demo technicians — each gets a deterministic API key for easy mobile testing
  const techMike = await prisma.technician.create({
    data: {
      id: "tech-mike-chen",
      organizationId: demoOrg.id,
      firstName: "Mike",
      lastName: "Chen",
      email: "mike.chen@precisionaero.example.com",
      badgeNumber: "PAM-1001",
      role: "TECHNICIAN",
      status: "ACTIVE",
      apiKey: "av_demo_mike_chen_2026",
    },
  });

  const techSarah = await prisma.technician.create({
    data: {
      id: "tech-sarah-okafor",
      organizationId: demoOrg.id,
      firstName: "Sarah",
      lastName: "Okafor",
      email: "sarah.okafor@precisionaero.example.com",
      badgeNumber: "PAM-1002",
      role: "SUPERVISOR",
      status: "ACTIVE",
      apiKey: "av_demo_sarah_okafor_2026",
    },
  });

  const techJuan = await prisma.technician.create({
    data: {
      id: "tech-juan-ramirez",
      organizationId: demoOrg.id,
      firstName: "Juan",
      lastName: "Ramirez",
      email: "juan.ramirez@precisionaero.example.com",
      badgeNumber: "PAM-1003",
      role: "TECHNICIAN",
      status: "ACTIVE",
      apiKey: "av_demo_juan_ramirez_2026",
    },
  });

  console.log(`✅ Demo organization created: ${demoOrg.name}`);
  console.log(`   Technicians: ${techMike.firstName} ${techMike.lastName}, ${techSarah.firstName} ${techSarah.lastName}, ${techJuan.firstName} ${techJuan.lastName}`);

  // ════════════════════════════════════════════════════
  // REFERENCE DATA — Per-part-number reference info for AI context
  // Used by the document generation AI to produce more accurate results
  // Starting with demo P/N 881700-1089 (HPC-7 hydraulic pump)
  // ════════════════════════════════════════════════════

  await prisma.referenceData.create({
    data: {
      partNumber: "881700-1089",
      title: "Overhaul Procedure Summary",
      category: "procedure",
      content: `HPC-7 Hydraulic Pump Overhaul (CMM 881700-OH Rev. 12)

1. Receiving Inspection: Verify P/N, S/N, and accompanying documentation. Check for shipping damage and external contamination. Record incoming hours/cycles.

2. Disassembly: Remove end caps, extract rotating group, separate all sub-assemblies. Tag and photograph each component per Section 4.2.

3. Cleaning: Solvent clean all metallic parts per Process Spec PS-881700-003. Ultrasonic clean bearing races and gears. Do NOT use abrasive methods on sealing surfaces.

4. Detailed Inspection:
   - Magnetic particle inspect housing and end caps per ASTM E1444
   - Fluorescent penetrant inspect rotating group per ASTM E1417
   - Dimensional check all wear surfaces per Table 5-1 limits
   - Borescope internal fluid passages for contamination/corrosion

5. Repair/Replace: Replace all seals, O-rings, and bearings (mandatory). Repair minor wear per Table 5-2 limits. Replace any part exceeding service limits.

6. Reassembly: Follow torque sequence in Table 6-1. Apply Mil-PRF-83282 hydraulic fluid to all sealing surfaces during assembly. Safety wire all external fasteners per MS33540.

7. Functional Test: Run test stand per Section 7.0 — verify flow rate (28 GPM ± 1 at 3000 PSI), case drain (max 0.5 GPM), pressure regulation (3000 ± 50 PSI), and no external leakage over 15-minute hold.

8. Final Inspection: Verify all paperwork complete, all SBs incorporated, test results within limits. Prepare 8130-3 release certificate.`,
      source: "CMM 881700-OH Rev. 12, Sections 3-8",
    },
  });

  await prisma.referenceData.create({
    data: {
      partNumber: "881700-1089",
      title: "Torque Specifications",
      category: "specification",
      content: `HPC-7 Hydraulic Pump Torque Values (Table 6-1)

Inlet Port Fitting (AN816-16): 450-500 in-lbs
Outlet Port Fitting (AN816-12): 350-400 in-lbs
Case Drain Port Fitting (AN816-6): 150-175 in-lbs
Drive Shaft Spline Coupling Nut: 200-225 in-lbs
End Cap Bolts (12x MS21250-04016): 65-75 in-lbs, torque in star pattern per Figure 6-3
Mounting Flange Bolts (4x NAS6204): 100-110 in-lbs
Relief Valve Cartridge: 300-350 in-lbs (do NOT exceed — damages valve seat)
Pressure Compensator Adjustment: 175-200 in-lbs (field adjustable, seal after setting)

All torque values are for clean, dry threads with Mil-PRF-83282 hydraulic fluid on sealing surfaces. Apply anti-seize compound MIL-PRF-907 to all stainless steel threads. Safety wire all fasteners per MS33540 after torque verification.`,
      source: "CMM 881700-OH Rev. 12, Table 6-1",
    },
  });

  await prisma.referenceData.create({
    data: {
      partNumber: "881700-1089",
      title: "Inspection Intervals and Wear Limits",
      category: "interval",
      content: `HPC-7 Hydraulic Pump Service Intervals

Overhaul Interval: 8,000 flight hours or 5,000 cycles (whichever first)
On-condition Interval: Inspect at 4,000 hours for trend monitoring
Hot Section Equivalent: N/A (hydraulic component)

WEAR LIMITS (Table 5-1):
- Drive shaft journal diameter: Min 0.7495", Max 0.7505" (new: 0.7500")
- Gear tooth thickness: Min 0.1240", service limit 0.1225"
- Housing bore diameter: Max 2.0010", service limit 2.0020"
- Bearing journal run-out: Max 0.0005" TIR
- End plate flatness: Max 0.0002" across full face
- Piston bore diameter: Max 0.5005", service limit 0.5010"
- Case drain port thread condition: No thread damage, minimum 3 full threads engagement

MANDATORY REPLACEMENT ITEMS AT OVERHAUL:
- All O-rings and backup rings (Kit P/N 881700-K001)
- All bearings (Kit P/N 881700-K002)
- Drive shaft seal (P/N 881700-S003)
- Pressure compensator spring (if hours > 6,000)`,
      source: "CMM 881700-OH Rev. 12, Tables 5-1, 5-2, Section 2.3",
    },
  });

  await prisma.referenceData.create({
    data: {
      partNumber: "881700-1089",
      title: "Applicable Service Bulletins",
      category: "specification",
      content: `Active Service Bulletins for 881700-series Hydraulic Pumps

SB 881700-29-001 (Rev. 3): Seal Material Upgrade
- Replaces Buna-N seals with fluorocarbon (Viton) for improved heat resistance
- MANDATORY at next overhaul
- Effectivity: All 881700-series pumps with S/N below SN-2023-xxxxx
- Kit: 881700-K001-V (Viton seal kit)

SB 881700-29-004 (Rev. 1): Modified Pressure Compensator Spring
- Addresses in-service reports of pressure drift above 4,000 hours
- RECOMMENDED (becomes mandatory if pressure drift reported)
- New spring P/N: 881700-SP004-A

SB 881700-29-006 (Rev. 0): Housing Drain Port Thread Insert
- Applies to pumps with case drain port thread damage from overtorque
- OPTIONAL — provides repair procedure using Helicoil insert
- Requires special tooling Kit T-881700-006

AD 2024-15-08: Hydraulic Pump Drive Shaft Inspection
- One-time inspection of drive shaft spline for stress corrosion cracking
- MANDATORY within 500 hours of AD effective date
- Inspection method: Fluorescent penetrant per ASTM E1417`,
      source: "Parker Aerospace Service Bulletin Index, current as of Jan 2026",
    },
  });

  await prisma.referenceData.create({
    data: {
      partNumber: "881700-1089",
      title: "Functional Test Stand Parameters",
      category: "specification",
      content: `HPC-7 Hydraulic Pump Test Stand Requirements (Section 7.0)

TEST FLUID: MIL-PRF-83282 (synthetic hydrocarbon), temperature 100°F ± 10°F

TEST SEQUENCE:
1. Low-speed break-in: 1500 RPM for 5 minutes, monitor for leaks and unusual noise
2. Rated speed run: 3600 RPM (simulates engine-driven pump speed)
3. Flow rate test: 28.0 GPM ± 1.0 GPM at 3000 PSI system pressure
4. Pressure regulation: 3000 PSI ± 50 PSI (adjust compensator if needed)
5. Case drain measurement: Maximum 0.5 GPM at rated conditions (indicates internal wear)
6. Proof pressure: 4500 PSI for 2 minutes — no external leakage permitted
7. Endurance run: 15 minutes at rated speed and pressure — stable output, no leaks
8. Pressure rise rate: 0 to 3000 PSI in < 2 seconds from no-load

ACCEPTANCE CRITERIA:
- Flow rate within tolerance at rated conditions
- Case drain below maximum (reject if > 0.5 GPM)
- No external leakage at any test point
- Pressure regulation within ± 50 PSI
- No abnormal noise or vibration
- Fluid temperature rise < 30°F during endurance run`,
      source: "CMM 881700-OH Rev. 12, Section 7.0",
    },
  });

  console.log("✅ Reference data seeded for P/N 881700-1089 (5 entries)");

  console.log("\n🎉 Seed data complete! 17 components with full lifecycle histories loaded.");
  console.log("   Including evidence, exceptions, parts consumed, and knowledge library.");
  console.log("   Plus demo organization with 3 technicians for mobile capture.");
  console.log("   Plus reference data for demo component P/N 881700-1089.");
  console.log("   Ready for AeroVision demo.");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
