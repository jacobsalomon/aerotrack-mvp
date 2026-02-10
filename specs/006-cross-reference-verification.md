# 006: Cross-Reference Verification Engine

**Priority:** 10 (DEFERRED — not needed for HEICO demo, build later)
**Estimated effort:** Medium
**Dependencies:** Spec 001 (Exception & Error Detection)

---

## Overview

Build a deeper verification layer that cross-references data across ALL documents and events for a component to find subtle inconsistencies that simple field-checking misses. ProvenAir found 10,000+ errors this way — errors that human reviewers had missed for years. The difference between this and spec 001 (exception detection) is that spec 001 checks individual data points, while this spec checks whether the complete story is internally consistent.

For the Parker/HEICO demo, run the verification on Component 1 (perfect history) to show it passing all checks — "clean bill of health." Then run it on Component 2 (the gap) or Component 5 (counterfeit suspect) to show multiple failures. The contrast tells the story.

---

## What to Build

### 1. Verification Engine

Create `/lib/cross-reference-engine.ts`:

```typescript
interface VerificationResult {
  componentId: string;
  overallStatus: "pass" | "warnings" | "failures";
  checksRun: number;
  checksPassed: number;
  checksWarning: number;
  checksFailed: number;
  details: VerificationDetail[];
  verifiedAt: Date;
}

interface VerificationDetail {
  checkName: string;           // Human-readable check name
  checkCategory: string;       // "continuity" | "chronology" | "consistency" | "completeness"
  status: "pass" | "warning" | "fail";
  message: string;             // Plain-language explanation of what was found
  evidenceEventIds: string[];  // Which events are involved
  severity: "info" | "warning" | "critical";
}

export async function verifyComponent(componentId: string): Promise<VerificationResult> {
  // Run all checks, collect results, return summary
}
```

### 2. Verification Checks

**Category: CONTINUITY (do the numbers add up?)**

**Check 1: Cycle Monotonicity**
- Cycles should only increase over time (cycles at event N+1 >= cycles at event N)
- If cycles decrease: FAIL with specific numbers
- Message: "Cycle count decreased from 8,200 at event on 2022-03-15 to 7,900 at event on 2022-09-01. Cycles should only increase."

**Check 2: Hour Monotonicity**
- Same as cycles but for flight hours
- Hours at event N+1 should be >= hours at event N

**Check 3: Cycle Rate Reasonability**
- Between consecutive events, calculate implied cycles per day
- Flag if >15 cycles/day (most components don't see more than 6-8 cycles/day in commercial service)
- Message: "Implied cycle rate between events is 22 cycles/day, which exceeds typical commercial service rates of 6-8 cycles/day. Verify cycle counts."
- Status: WARNING (might just be a data entry error)

**Check 4: Hour Rate Reasonability**
- Between consecutive events, calculate implied hours per day
- Flag if >18 hours/day (commercial aircraft typically fly 10-14 hours/day)
- Similar message and warning status

**Category: CHRONOLOGY (does the timeline make sense?)**

**Check 5: Event Ordering**
- All events should be in chronological order by date
- If any event's date is earlier than the previous event: FAIL
- Message: "Event 'inspection' on 2022-01-15 occurs before the previous event 'install' on 2022-03-20. Events are out of chronological order."

**Check 6: Logical Event Sequence**
- Install must come after a remove or manufacture (can't install something that's already installed)
- Remove must come after an install (can't remove something that's not installed)
- Repair events should occur between a remove and an install
- If sequence is violated: FAIL
- Message: "Two consecutive 'install' events found without an intervening 'remove'. Component cannot be installed on two aircraft simultaneously."

**Check 7: No Overlapping Installations**
- A component can only be installed on one aircraft at a time
- Check that every install has a corresponding remove before the next install
- If overlap found: FAIL with both aircraft registrations

**Category: CONSISTENCY (do the documents agree?)**

**Check 8: Part Number Consistency**
- P/N should be the same across all events (unless there's a modification event)
- Compare each event's implicit P/N with the component's P/N
- If mismatch found without a modification event: FAIL
- Message: "Event on 2022-06-15 references P/N 881700-1034 but component is registered as P/N 881700-1001."

**Check 9: Facility Certificate Check**
- For repair/overhaul events, the facility should have a valid certificate
- Check that facilityCert field is populated for repair events
- Status: WARNING if missing (could just be incomplete data entry)

**Check 10: TSO/CSO Reset on Overhaul**
- After an overhaul event, TSO and CSO should reset to 0 (or near 0)
- If the next event after an overhaul shows high TSO/CSO: WARNING
- Message: "Component shows TSO of 4,200 hours after overhaul event. TSO should reset to 0 after overhaul."

**Category: COMPLETENESS (is everything there?)**

**Check 11: Release Certificate Coverage**
- Every repair/overhaul event should have an associated 8130-3
- Already handled by spec 001, but here verify against GeneratedDocuments too

**Check 12: Evidence Coverage**
- Events created through AeroTrack's capture workflow should have evidence (photos, voice notes)
- Events from legacy upload may not — that's acceptable
- For AeroTrack-captured events: WARNING if no evidence attached

**Check 13: Birth Certificate Exists**
- Component should have a manufacture event AND an associated birth certificate document
- Already partially in spec 001, but verify the document content too

### 3. API Route

```
POST /api/verify/[componentId]
  - Runs verifyComponent() for the given component
  - Returns: VerificationResult

POST /api/verify/batch
  - Body: { componentIds: string[] } or empty body for all components
  - Runs verification for multiple components
  - Returns: { results: VerificationResult[], summary: { totalChecked, passed, withWarnings, withFailures } }
```

### 4. Frontend: Verification Panel on Part Detail Page

Add a "Verification" section to the Part Detail page. Include a "Run Verification" button that triggers the check and displays results:

**Before running:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Cross-Reference Verification                                     │
│                                                                   │
│ Verify this component's records for internal consistency.         │
│ Checks cycle continuity, chronological ordering, document         │
│ completeness, and cross-document consistency.                     │
│                                                                   │
│ [Run Verification]                                               │
└─────────────────────────────────────────────────────────────────┘
```

**After running (example for Component 1 — all pass):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Cross-Reference Verification            ✅ PASSED (13/13 checks) │
│ Last verified: Feb 7, 2026 at 10:32 AM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Continuity                                                        │
│   ✅ Cycle monotonicity — cycles increase consistently            │
│   ✅ Hour monotonicity — hours increase consistently              │
│   ✅ Cycle rate reasonable — avg 5.2 cycles/day                   │
│   ✅ Hour rate reasonable — avg 8.4 hours/day                     │
│                                                                   │
│ Chronology                                                        │
│   ✅ Event ordering — all events in chronological order           │
│   ✅ Logical sequence — install/remove pattern is valid           │
│   ✅ No overlapping installations                                 │
│                                                                   │
│ Consistency                                                       │
│   ✅ Part number consistent across all events                     │
│   ✅ Facility certificates present for all repair events          │
│   ✅ TSO/CSO reset correctly after overhauls                      │
│                                                                   │
│ Completeness                                                      │
│   ✅ Release certificates present for all repairs                 │
│   ✅ Evidence attached to captured events                         │
│   ✅ Birth certificate on file                                    │
│                                                                   │
│ [Re-run Verification]                                            │
└─────────────────────────────────────────────────────────────────┘
```

**After running (example for Component 2 — failures):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Cross-Reference Verification        ❌ FAILED (9/13 passed)      │
│ Last verified: Feb 7, 2026 at 10:33 AM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Continuity                                                        │
│   ✅ Cycle monotonicity                                           │
│   ✅ Hour monotonicity                                            │
│   ⚠️ Cycle rate — insufficient data points for gap period         │
│   ✅ Hour rate reasonable                                         │
│                                                                   │
│ Chronology                                                        │
│   ✅ Event ordering                                               │
│   ✅ Logical sequence                                             │
│   ✅ No overlapping installations                                 │
│                                                                   │
│ Consistency                                                       │
│   ✅ Part number consistent                                       │
│   ❌ Facility certificate — São Paulo repair missing cert #       │
│      Event: Overhaul on Jan 2022 at Aero Manutenção São Paulo    │
│      No FAA Part 145 certificate number recorded                  │
│   ✅ TSO/CSO reset                                                │
│                                                                   │
│ Completeness                                                      │
│   ❌ Release certificate — No 8130-3 for São Paulo overhaul       │
│      Only scanned PDFs found, no formal release certificate       │
│   ✅ Evidence for captured events                                 │
│   ⚠️ Birth certificate — document exists but quality is low       │
│                                                                   │
│ [Re-run Verification]                                            │
└─────────────────────────────────────────────────────────────────┘
```

Use clear icons: ✅ green check for pass, ⚠️ yellow for warning, ❌ red X for fail.

### 5. Verification on Integrity Page

On the Integrity page, add a "Fleet Verification" section:
- "Run Fleet Verification" button that checks all components
- Summary: "8 components checked: 5 passed, 2 with warnings, 1 failed"
- List of components with their verification status (pass/warn/fail)
- Click each to go to Part Detail page

### 6. Integration with Demo Flow

For the demo, the presenter should be able to:
1. Open Component 1 → Run Verification → All green checkmarks → "Perfect trace"
2. Open Component 2 → Run Verification → Red failures → "Here's where the problems are"
3. Open Component 5 → Run Verification → Multiple failures → "This is what a counterfeit looks like in the data"

The contrast between a clean component and a problematic one tells the story better than any slide.

---

## Acceptance Criteria

- [ ] Verification engine runs 13 distinct checks across 4 categories
- [ ] Cycle monotonicity check catches cycles that decrease between events
- [ ] Hour monotonicity check catches hours that decrease between events
- [ ] Cycle/hour rate reasonability check flags impossibly high usage rates
- [ ] Chronological ordering check catches out-of-order events
- [ ] Logical sequence check catches invalid install/remove patterns
- [ ] Overlapping installation check catches a part being installed on two aircraft
- [ ] Part number consistency check catches mismatches across events
- [ ] Facility certificate check flags missing cert numbers on repair events
- [ ] TSO/CSO reset check verifies counters reset after overhaul events
- [ ] Release certificate coverage check flags repairs without 8130-3
- [ ] API route `POST /api/verify/[componentId]` returns structured verification results
- [ ] Part Detail page shows verification panel with results grouped by category
- [ ] Each check shows pass (green), warning (yellow), or fail (red) status
- [ ] Failed checks show specific details about what was found
- [ ] Integrity page shows "Fleet Verification" section with batch verification
- [ ] Component 1 passes all checks
- [ ] Component 2 shows at least 2 failures (missing cert, missing 8130-3)
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
