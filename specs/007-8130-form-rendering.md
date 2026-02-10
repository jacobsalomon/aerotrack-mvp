# 007: FAA Form 8130-3 Visual Rendering & PDF Export

**Priority:** 4 (HEICO DEMO — the "money shot", 8130-3 rendered as a real FAA form)

**Estimated effort:** Medium
**Dependencies:** Existing AI generate-8130 API route (already built)

---

## Why This Matters

Right now, when the capture workflow generates an 8130-3, it produces structured JSON data
with all 14 blocks filled in. That's technically correct, but visually underwhelming.

HEICO's CEO doesn't want to see JSON. He wants to see the actual government form —
the same one his shops fill out by hand today — except it's already filled in.
The reaction should be: "Wait, it just... did it? That's the form. That's done."

The before/after is visceral:
- **Before:** Mechanic spends 45-90 minutes hand-writing the form, looking up references,
  cross-checking part numbers
- **After:** Mechanic finishes work, taps "Generate" — and a completed form appears in seconds

---

## What to Build

### 1. 8130-3 Form Preview Component

Create `/components/documents/form-8130-preview.tsx`:

A React component that renders the FAA Form 8130-3 in a format that looks like the
real government form. It doesn't need to be pixel-perfect — it needs to be recognizable.

**Visual layout** (mimics the actual FAA Form 8130-3):

```
┌────────────────────────────────────────────────────────────────┐
│  AUTHORIZED RELEASE CERTIFICATE — FAA Form 8130-3             │
│  OMB No. 2120-0020                                             │
├────────────────────────────────────────────────────────────────┤
│ 1. Approving Authority    │ 2. Form Tracking No.              │
│  ✈ Federal Aviation       │  AeroTrack-8130-2025-0247         │
│    Administration          │                                    │
├────────────────────────────────────────────────────────────────┤
│ 3. Organization Name/Address                                   │
│  ACE Aerospace Services                                        │
│  12 Aviation Way, Singapore 539940                             │
│  FAA Cert: ACEY123R                                            │
├────────────────────────────────────────────────────────────────┤
│ 4. Work Order No.   │ 5. Item Name         │ 6. Quantity       │
│  WO-2025-0892       │  Hydraulic Pump Assy  │  1               │
│  Contract/PO: ...   │  P/N: HP-2847A        │  S/N: HP-A-1001  │
├────────────────────────────────────────────────────────────────┤
│ 7. Description / Status of Work                                │
│                                                                 │
│  Component received for scheduled overhaul per CMM 29-10-01    │
│  Rev. 12.                                                       │
│                                                                 │
│  FINDINGS:                                                      │
│  - Main gear shaft bearing: wear within limits (0.0012" play)  │
│  - Input seal: hardness 62 Shore A (min 58), serviceable       │
│  - Pressure relief valve: tested at 3,247 PSI (spec: 3,000     │
│    ±250 PSI) — within limits                                    │
│                                                                 │
│  WORK PERFORMED:                                                │
│  - Complete teardown and inspection per CMM 29-10-01            │
│  - Replaced O-ring seals (5 ea.) — P/N: OR-2847-KIT           │
│  - Functional test completed: all parameters within spec       │
│                                                                 │
│  PARTS CONSUMED:                                                │
│  - O-Ring Seal Kit (OR-2847-KIT) — Vendor: Parker Hannifin     │
│    C of C: COC-2025-3847                                        │
│                                                                 │
│  TEST RESULTS:                                                  │
│  - Flow rate: 12.4 GPM @ 3,000 PSI (spec: 12 ±1 GPM) ✓       │
│  - Pressure hold: 3,000 PSI for 5 min, 0 PSI drop ✓           │
│  - Leak test: No external leakage detected ✓                   │
├────────────────────────────────────────────────────────────────┤
│ 8-10. Eligibility/Conformity                                   │
│  ☑ Condition for safe operation                                │
│  ☑ FAR § 43.9, 14 CFR Part 145                                │
├────────────────────────────────────────────────────────────────┤
│ 11. Status/Work    │ ☑ Overhauled   ☐ Repaired                │
│                    │ ☐ Inspected    ☐ Modified                 │
├────────────────────────────────────────────────────────────────┤
│ 12. Remarks                                                    │
│  Component returned to serviceable condition.                   │
│  Next overhaul due at 16,000 flight hours.                     │
├────────────────────────────────────────────────────────────────┤
│ 13. Authorized Signature                                       │
│  ┌──────────────────────┐                                      │
│  │  [e-Signature Area]  │  Date: Feb 7, 2025                  │
│  │  James Mitchell      │  Auth: IA-2847591                   │
│  │  Senior Inspector    │  Cert: A&P / IA                     │
│  └──────────────────────┘                                      │
├────────────────────────────────────────────────────────────────┤
│ 14. AeroTrack Digital Verification                             │
│  Hash: 7a3f...c829 │ Tamper-evident │ Generated by AI v1.0    │
└────────────────────────────────────────────────────────────────┘
```

**Design details:**
- Light gray background with darker borders (looks like a printed form)
- Monospace or serif fonts for form fields (feels official)
- Checkboxes that appear checked/unchecked
- A subtle "GENERATED BY AI — PENDING REVIEW" watermark until signed
- Green check marks next to test results that pass
- The signature area should show the e-signature if one exists
- Responsive — works on both desktop and the glasses demo

### 2. Integration into Capture Workflow

In the existing capture workflow (`capture/work/[componentId]/page.tsx`), Step 6 (Release)
currently shows the raw generated document data. Replace that with the form preview component.

**The reveal sequence should be theatrical:**
1. "Generating 8130-3..." with a loading animation
2. The form "types itself in" — fields appear one section at a time over 2-3 seconds
   (like watching a form being filled out at superhuman speed)
3. Final form rendered with all blocks filled
4. "Download PDF" and "Send for Signature" buttons appear

### 3. PDF Download

Using the existing `pdf-lib` dependency, generate a downloadable PDF that matches the
visual rendering. The PDF should:
- Use a clean, official-looking layout
- Include all 14 blocks
- Show the AeroTrack digital verification hash at the bottom
- Be formatted to print on standard letter paper
- Include page numbers if Block 7 (remarks) is long enough to overflow

Create API route: `POST /api/documents/render-8130-pdf`
- Input: The generated 8130 JSON data
- Output: PDF buffer for download
- Uses pdf-lib to create the form layout

### 4. Before/After Split View (for demo)

Add an optional "See What This Replaced" toggle on the form preview that shows
a split-screen comparison:

```
┌──────────────────┬──────────────────┐
│   THE OLD WAY    │  THE AEROTRACK   │
│                  │      WAY         │
│                  │                  │
│  [Photo of a     │  [The rendered   │
│   hand-written   │   8130-3 form    │
│   8130-3 form    │   with all data  │
│   with messy     │   filled in      │
│   handwriting,   │   perfectly]     │
│   coffee stains, │                  │
│   white-out]     │                  │
│                  │                  │
│  ⏱ 45-90 min    │  ⏱ 8 seconds    │
│  ❌ 15% error    │  ✅ AI-verified  │
│     rate         │     accuracy     │
└──────────────────┴──────────────────┘
```

For the MVP, use a stock photo or illustration of a messy hand-written form
on the left side. The right side shows the live AI-generated form.

---

## Acceptance Criteria

- [ ] 8130-3 form renders visually as a recognizable FAA form (not raw JSON)
- [ ] All 14 blocks display with proper data from the AI generation
- [ ] Block 7 (remarks) shows findings, work performed, parts consumed, and test results
- [ ] Test results show green checkmarks for passing results
- [ ] Form shows "GENERATED BY AI" watermark until signed
- [ ] "Download PDF" button generates a clean, printable PDF using pdf-lib
- [ ] Form preview replaces raw data in the capture workflow Step 6 (Release)
- [ ] Form "reveal" animation types fields in sequentially (2-3 seconds)
- [ ] Before/After toggle shows comparison with old manual process
- [ ] Time saved counter shows prominently (e.g., "Time saved: ~87 minutes")
- [ ] Works in both the capture workflow and as a standalone viewer
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
