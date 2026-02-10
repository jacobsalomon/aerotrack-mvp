# 001: Automated Exception & Error Detection Engine

**Priority:** 1 — COMPLETE (built and verified)
**Estimated effort:** Large
**Dependencies:** None (uses existing database models)

---

## Overview

Build an automated exception detection engine that cross-references data across all events and documents for each component to find inconsistencies. ProvenAir found 10,000+ human errors doing this. This is the foundation that the counterfeit detection (spec 002) and cross-reference verification (spec 006) build on.

When Parker or HEICO executives see this in the demo, the reaction should be: "How many errors are hiding in OUR records right now?"

---

## What to Build

### 1. Database Model

Add a new Prisma model `Exception`:

```
model Exception {
  id              String   @id @default(cuid())
  componentId     String
  component       Component @relation(fields: [componentId], references: [id])
  exceptionType   String    // see types below
  severity        String    // "info", "warning", "critical"
  title           String
  description     String    // detailed plain-language explanation
  evidence        String    // JSON — the specific data points that triggered this
  status          String    @default("open") // "open", "investigating", "resolved", "false_positive"
  detectedAt      DateTime  @default(now())
  resolvedAt      DateTime?
  resolvedBy      String?
  resolutionNotes String?
}
```

Add the `exceptions Exception[]` relation to the `Component` model.

Run `npx prisma db push` and `npx prisma generate` after updating the schema.

### 2. Exception Types to Detect

Create `/lib/exception-engine.ts` with detection functions for each type:

| Type | What It Catches | Severity |
|------|----------------|----------|
| `serial_number_mismatch` | S/N differs between documents for the same event | critical |
| `part_number_mismatch` | P/N differs between documents for the same component | critical |
| `cycle_count_discrepancy` | Cycle counts don't add up across consecutive events (e.g., cycles went DOWN, or increment is impossibly high for the time period) | critical |
| `hour_count_discrepancy` | Flight hours don't add up across consecutive events | critical |
| `documentation_gap` | Period >30 days between events with no documentation | warning (30-180 days) or critical (>180 days) |
| `missing_release_certificate` | A repair/overhaul event exists but no associated 8130-3 GeneratedDocument or Document with docType "8130" | warning |
| `missing_birth_certificate` | Component has no manufacture event or no Document with docType "birth_certificate" | warning |
| `date_inconsistency` | Events are out of chronological order, or an "install" happens before the previous "remove" | critical |
| `unsigned_document` | A GeneratedDocument has status "draft" for an event older than 30 days | info |

### 3. Detection Engine Logic

```typescript
// /lib/exception-engine.ts

// Main entry point — scans a single component
export async function scanComponent(componentId: string): Promise<Exception[]> {
  // 1. Fetch the component with all events (ordered by date), documents, and evidence
  // 2. Run each detection function
  // 3. Create Exception records for any findings that don't already exist
  //    (avoid duplicates — check if an exception with the same type + componentId + evidence already exists)
  // 4. Return all exceptions found
}

// Batch scan — runs scanComponent for every component in the database
export async function scanAllComponents(): Promise<{
  totalComponents: number;
  componentsWithExceptions: number;
  totalExceptions: number;
  bySeverity: { critical: number; warning: number; info: number };
}> { ... }
```

**Detection function details:**

**Cycle count discrepancy:**
- For each pair of consecutive events that have `cyclesAtEvent` values:
  - If event[n+1].cyclesAtEvent < event[n].cyclesAtEvent → flag "Cycles decreased"
  - If the increment between events is more than what's physically possible for the time period (rough check: >20 cycles/day for most components) → flag "Impossibly high cycle rate"
- Include the specific numbers in the evidence: "Event on 2022-03-15 reports 8,200 CSN, but next event on 2022-09-01 reports 7,900 CSN — cycles went backward by 300"

**Documentation gap:**
- Sort all events by date
- For each pair of consecutive events, calculate the gap in days
- If gap > 30 days, create an exception with the gap duration and the events on either side
- Severity: warning if 30-180 days, critical if >180 days

**Missing release certificate:**
- Find all events with eventType in ["repair", "reassembly", "release_to_service", "final_inspection"]
- For each, check if there's a GeneratedDocument with docType "8130-3" linked to that event, OR a Document with docType "8130" linked to the component within 7 days of the event
- If neither exists, flag it

### 4. Seed Data Exceptions

Update the seed script (`prisma/seed.ts`) to ensure the existing seed data triggers realistic exceptions:
- **Component 2 (881700-1034, "The Gap"):** Should trigger a `documentation_gap` exception for the 14-month gap
- **Component 5 (Counterfeit Suspect):** Should trigger `missing_birth_certificate` and `serial_number_mismatch` (format anomaly)
- **Component 2's São Paulo repair:** Should trigger `missing_release_certificate` (only has scanned PDFs, no proper 8130-3)
- Add at least one `cycle_count_discrepancy` to one of the seed components (e.g., a subtle error in Component 3 or 4's event data where cycles don't quite add up)

After updating seed data, re-run: `npx prisma db push --force-reset && npx prisma db seed`

### 5. API Routes

```
POST /api/exceptions/scan/[componentId]
  - Runs scanComponent() for the given component
  - Returns: { exceptions: Exception[], summary: { total, critical, warning, info } }

POST /api/exceptions/scan-all
  - Runs scanAllComponents()
  - Returns: batch summary stats

GET /api/exceptions
  - Query params: ?componentId=X&severity=critical&status=open&limit=50
  - Returns paginated list of exceptions

PATCH /api/exceptions/[id]
  - Update exception status (investigating, resolved, false_positive)
  - Requires: { status, resolvedBy?, resolutionNotes? }
```

### 6. Frontend: Integrity Page Enhancement

Enhance the existing `/integrity` page (or create it if it doesn't exist):

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ Integrity & Compliance                    [Run Full Scan]        │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Summary Cards:                                                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │
│  │ 🔴 3       │ │ 🟡 7       │ │ 🔵 2       │ │ ✅ 12      │    │
│  │ Critical   │ │ Warnings   │ │ Info       │ │ Resolved   │    │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘    │
│                                                                    │
│  Filter: [All Types ▼] [All Severities ▼] [Open ▼] [Search...]  │
│                                                                    │
│  Exception List:                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 🔴 CRITICAL — Cycle Count Discrepancy                       │  │
│  │ 881700-1034 (SN-2018-06231) — HPC-7 Hydraulic Pump         │  │
│  │ Cycles decreased from 8,200 to 7,900 between events on      │  │
│  │ 2022-03-15 and 2022-09-01                                    │  │
│  │ Detected: Jan 15, 2026 | Status: Open                       │  │
│  │ [View Component] [Investigate] [Resolve] [False Positive]   │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 🔴 CRITICAL — Documentation Gap (14 months)                  │  │
│  │ 881700-1034 (SN-2018-06231) — HPC-7 Hydraulic Pump         │  │
│  │ No records between Nov 2020 (American Tulsa removal) and     │  │
│  │ Jan 2022 (São Paulo appearance). 14 months unaccounted.      │  │
│  │ Detected: Jan 15, 2026 | Status: Open                       │  │
│  │ [View Component] [Investigate] [Resolve] [False Positive]   │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ...                                                               │
└──────────────────────────────────────────────────────────────────┘
```

### 7. Frontend: Exception Badge on Part Detail Page

On the Part Detail page (`/parts/[id]`), add an exception indicator:

- If the component has open exceptions: Show a badge in the header area
  - "3 Open Exceptions (2 Critical, 1 Warning)" in red/yellow
  - Clicking scrolls to an "Exceptions" section on the Part Detail page
- The "Exceptions" section shows all exceptions for that component in a compact list
- Each exception card shows type, severity, description, and status

### 8. Run Initial Scan on Page Load

When the Integrity page loads, if no exceptions exist yet in the database, automatically run `scanAllComponents()` and populate the results. Show a loading state: "Scanning 8 components for issues..." with a progress indicator.

---

## Acceptance Criteria

- [ ] `Exception` model exists in Prisma schema and database is migrated
- [ ] Exception engine detects serial number mismatches between documents
- [ ] Exception engine detects cycle count discrepancies (cycles going backward or impossibly high rates)
- [ ] Exception engine detects documentation gaps >30 days between events
- [ ] Exception engine detects missing 8130-3 release certificates after repair events
- [ ] Exception engine detects missing birth certificates
- [ ] Exception engine detects chronological date inconsistencies
- [ ] Seed data generates at least 5 realistic exceptions across multiple components
- [ ] API route `POST /api/exceptions/scan/[componentId]` works and returns exceptions
- [ ] API route `GET /api/exceptions` returns filterable list of exceptions
- [ ] Integrity page shows summary cards with exception counts by severity
- [ ] Integrity page shows filterable, sortable list of all exceptions
- [ ] Part Detail page shows exception count badge when exceptions exist
- [ ] Exception status can be updated (open → investigating → resolved / false_positive)
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
