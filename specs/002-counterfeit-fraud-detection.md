# 002: Counterfeit & Fraud Detection Engine

**Priority:** 7 (DEFERRED — not needed for HEICO demo, build later)
**Estimated effort:** Medium
**Dependencies:** Spec 001 (Exception & Error Detection)

---

## Overview

Build a fraud detection layer on top of the exception engine from spec 001. This goes beyond simple error detection — it looks for patterns that specifically indicate counterfeit or unapproved parts. The FAA estimates 520,000 counterfeit components enter aircraft annually. The AOG Technics scandal (2023) showed the industry how real this threat is.

For the Parker/HEICO demo, this is a "jaw-drop" moment. Show the counterfeit suspect component (seed data Component 5) and walk through each red flag. Executives will immediately think: "How many of these are in OUR supply chain right now?"

---

## What to Build

### 1. Fraud Detection Rules

Create `/lib/fraud-detection.ts` with these specific checks:

**Rule 1: Serial Number Format Validation**
```typescript
// Each OEM uses specific S/N conventions that change over time.
// A part claiming to be manufactured in 2017 but using a post-2019 S/N format is suspicious.

const OEM_SN_FORMATS: Record<string, { pattern: RegExp; validFrom: string; validTo?: string }[]> = {
  "Parker Aerospace": [
    { pattern: /^SN-\d{4}-\d{5}$/, validFrom: "2019-01-01" }, // Post-2019 format
    { pattern: /^[A-Z]{2}\d{6}$/, validFrom: "2010-01-01", validTo: "2018-12-31" }, // Pre-2019 format
  ],
  // Add more OEMs as needed
};

// Check: Does the S/N format match the claimed manufacture date era?
// Severity: CRITICAL
```

**Rule 2: Birth Certificate Verification**
```typescript
// Every legitimate part should have a manufacture certificate (8130-3 at birth).
// A part with NO birth certificate AND other red flags = highly suspicious.
// Severity: WARNING alone, CRITICAL if combined with other flags
```

**Rule 3: Weight Discrepancy**
```typescript
// OEM specs include expected component weight.
// If documented weight differs by >5% from spec, the internals may be wrong.

const OEM_WEIGHT_SPECS: Record<string, number> = {
  "881700-1001": 2.4, // kg — HPC-7 Hydraulic Pump
  "881700-1034": 2.4,
  "881700-1089": 2.4,
  "2548934-1": 1.8,   // Fuel Control Valve
  "65075-05": 3.2,    // Flight Control Actuator
  // etc.
};

// Check: Does the component's documented weight (from receiving inspection) match OEM spec?
// Severity: CRITICAL if >5% difference
```

To support this, add a `weight` Float? field to the `Component` model and populate it in seed data. Component 5 (counterfeit suspect) should have weight = 2.1 (vs. 2.4 spec).

**Rule 4: Provenance Chain Integrity**
```typescript
// Every change in possession should have transfer documentation.
// A part that "appears" at a facility with no prior transfer record is suspicious.
// Already partially covered by documentation_gap in spec 001, but here we look
// at it through a fraud lens.
// Severity: WARNING (single gap) to CRITICAL (gap + other flags)
```

**Rule 5: Duplicate Serial Number**
```typescript
// Two different components should NEVER share the same P/N + S/N combination.
// If they do, one is likely counterfeit.
// Query: SELECT partNumber, serialNumber FROM Component GROUP BY partNumber, serialNumber HAVING COUNT(*) > 1
// Severity: CRITICAL
```

For this to trigger, add Component 5's serial number to match the format of another component in seed data. Component 5 claims P/N 881700-1001 (same as Component 1) — it should have a S/N that could be confused with a legitimate one.

**Rule 6: Multi-Flag Composite Detection**
```typescript
// Individual minor flags may be innocent. But when 3+ flags appear on the same
// component, the probability of fraud increases dramatically.
// This is the AOG Technics pattern: professional-looking docs, but multiple
// subtle inconsistencies.

// Composite scoring: count all flags for a component
// 0 flags = trust score 100
// 1 minor flag = trust score 85
// 2 minor flags = trust score 70
// 1 critical flag = trust score 50
// 2+ critical flags = trust score 25
// 3+ flags of any kind = trust score 30
```

### 2. Trust Score

Add a `trustScore` Int? field to the `Component` model (0-100).

Create a function `calculateTrustScore(componentId)` that:
1. Counts all exceptions and fraud flags for the component
2. Calculates the score using the composite logic above
3. Updates the component's trustScore field
4. Returns the score and the contributing factors

Trust score levels:
- **90-100:** Verified — complete documentation, no flags
- **70-89:** Documented — minor issues, likely legitimate
- **50-69:** Caution — notable concerns, investigate before use
- **0-49:** Suspect — serious fraud indicators, DO NOT install

### 3. Seed Data for Counterfeit Demo

Ensure Component 5 (Counterfeit Suspect) triggers ALL of the following:
- Serial number format uses post-2019 convention but claims 2017 manufacture date
- No birth certificate (no manufacture 8130-3 in the system)
- Weight = 2.1 kg (OEM spec for 881700-1001 is 2.4 kg)
- No prior lifecycle history — appears at a broker with zero events before
- Trust score should calculate to ~20-25 (very suspicious)

Also ensure Component 1 (Perfect History) scores 95-100 to show the contrast.

### 4. API Routes

```
POST /api/fraud/scan/[componentId]
  - Runs all fraud detection rules for the component
  - Calculates and stores trust score
  - Returns: { trustScore, flags: FraudFlag[], recommendation: string }

GET /api/fraud/fleet-summary
  - Returns trust score distribution across all components
  - { verified: 5, documented: 1, caution: 0, suspect: 1, unscored: 1 }
```

### 5. Frontend: Fraud Alert on Part Detail Page

When a component has a trust score < 70, show a prominent alert banner at the TOP of the Part Detail page:

**Trust Score < 50 (Suspect):**
```
┌────────────────────────────────────────────────────────────────────┐
│ ⚠️ FRAUD ALERT — Trust Score: 23/100 — DO NOT INSTALL              │
│                                                                      │
│ Multiple counterfeit indicators detected:                            │
│ • Serial number format (SN-2017-04190) uses post-2019 convention    │
│   but claims 2017 manufacture — FORMAT MISMATCH                      │
│ • No birth certificate (8130-3) found in any records system          │
│ • Weight: 2.1 kg — OEM spec for 881700-1001 is 2.4 kg (12.5% low) │
│ • No lifecycle history prior to appearance at broker                 │
│                                                                      │
│ Recommendation: Quarantine this component. Do not install on any     │
│ aircraft. Contact Parker Aerospace OEM verification desk.            │
│                                                                      │
│ [Mark as Investigated] [Report to FAA] [View Full Analysis]         │
└────────────────────────────────────────────────────────────────────┘
```

Use a red background with white text for critical alerts. Make it impossible to miss.

**Trust Score 50-69 (Caution):**
- Yellow banner: "Documentation concerns detected — investigate before use"
- List each flag

**Trust Score 70-89 (Documented):**
- Small info badge: "Minor documentation items — see details"

**Trust Score 90-100 (Verified):**
- Green badge: "Verified — documentation complete" (small, positive reinforcement)

### 6. Frontend: Trust Score on Dashboard

On the main Dashboard (`/dashboard`) parts table, add a "Trust" column showing the trust score as a colored badge:
- 🟢 90-100
- 🟡 70-89
- 🟠 50-69
- 🔴 0-49
- ⚪ Not yet scored

### 7. Frontend: Fraud Dashboard Section

On the Integrity page (`/integrity`), add a "Counterfeit Detection" section ABOVE the exceptions list:

```
┌────────────────────────────────────────────────────────────────────┐
│ Counterfeit Detection                                               │
│                                                                      │
│ Fleet Trust Summary:                                                 │
│ 🟢 5 Verified  🟡 1 Documented  🟠 0 Caution  🔴 1 Suspect         │
│                                                                      │
│ ⚠️ Flagged Components:                                              │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ 🔴 881700-1001 (SN-2017-04190) — Trust Score: 23            │    │
│ │ 4 fraud indicators | Detected: Oct 2023                      │    │
│ │ Status: Open — Quarantined                                   │    │
│ │ [View Details]                                               │    │
│ └──────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

### 8. Auto-Check on Capture Scan

In the Capture workflow (Step 1: Scan & Receive), AFTER a component is identified by scanning:
- Automatically calculate trust score
- If trust score < 50: Show a blocking warning dialog:
  "WARNING: This component has fraud indicators. Trust Score: 23/100. Do you want to proceed?"
  With buttons: [View Details] [Proceed with Caution] [Reject Component]
- If trust score 50-69: Show a yellow banner warning but allow continuation
- If trust score >= 70: No warning needed

---

## Acceptance Criteria

- [ ] Serial number format validation checks S/N against OEM conventions for the claimed date era
- [ ] Weight discrepancy check flags components >5% different from OEM spec weight
- [ ] Missing birth certificate is detected as a fraud indicator
- [ ] Provenance gaps are flagged through a fraud lens (not just documentation gap)
- [ ] Duplicate serial numbers across components are detected
- [ ] Composite trust score (0-100) is calculated from all flags
- [ ] Component 5 (counterfeit suspect) scores <30 with 4+ fraud flags
- [ ] Component 1 (perfect history) scores >90
- [ ] Part Detail page shows prominent red fraud alert banner for trust score <50
- [ ] Part Detail page shows green "Verified" badge for trust score >90
- [ ] Dashboard parts table shows trust score column with colored badges
- [ ] Integrity page shows Counterfeit Detection section with fleet trust summary
- [ ] Capture scan auto-checks trust score and warns for suspect components
- [ ] `weight` field added to Component model and populated in seed data
- [ ] `trustScore` field added to Component model
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
