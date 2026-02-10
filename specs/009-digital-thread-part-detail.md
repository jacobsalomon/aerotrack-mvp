# 009: Digital Thread Visualization on Part Detail Page

**Priority:** 3 (HEICO DEMO — build after spec 003, adds visual digital thread layer)

**Estimated effort:** Medium
**Dependencies:** Spec 001 (Exception Detection — built), Spec 003 (Back-to-Birth
Timeline — covers the timeline enhancements). This spec adds the VISUAL LAYER
that makes the digital thread feel alive.

---

## Why This Matters

Spec 003 covers the enhanced timeline (completeness score, gap visualization,
document counts, PDF export). This spec goes further — it adds the visual
"digital thread" metaphor that makes the HEICO CEO think: "I can SEE the
part's life."

The digital thread isn't just a timeline. It's:
- A **facility map** showing every shop the part has visited
- A **provenance chain** showing every hand the part has passed through
- An **evidence gallery** showing the actual photos, voice notes, and documents
  captured at each event
- A **trust indicator** showing how confident you can be in the part's history

Think of it like a detective's evidence board — everything connected by strings,
with photos pinned at every node.

---

## What to Build

### 1. Digital Thread Hero Section

Replace the current identity card on the part detail page with an expanded
"Digital Thread" hero section that tells the part's story at a glance:

```
┌──────────────────────────────────────────────────────────────┐
│  DIGITAL THREAD                                              │
│  HP-2847A  •  S/N: HP-A-1001  •  Hydraulic Pump Assembly    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │   Parker     Delta    ACE      Parker    United      │   │
│  │   Irvine  →  Atlanta → Singapore → Dist. → Chicago  │   │
│  │   MFG'19    FLY'19-22  OH'22    DIST'22   FLY'22+   │   │
│  │    🟢        🟢        🟢       🟢        🟢        │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Trace: 94% ████████████████████░  │  Age: 5yr 10mo         │
│  Events: 14   Docs: 23   Gaps: 0  │  Hours: 12,847         │
│  Status: ✅ Serviceable            │  Cycles: 8,231         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The **facility flow** at the top is a horizontal chain showing every company/facility
the part has been through, with:
- Abbreviated descriptions (MFG = manufactured, FLY = in service, OH = overhaul, DIST = distribution)
- Date ranges below each
- Green/yellow/red dots indicating documentation quality at each stop
- Arrows connecting them (the "thread")

### 2. Facility Journey Map

Below the hero section, add a "Journey" visualization — a horizontal flow diagram
showing the part's physical path through the supply chain:

```
  ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐
  │ Parker  │      │  Delta  │      │   ACE   │      │ United  │
  │ Irvine  │─────▶│ Atlanta │─────▶│Singapore│─────▶│ Chicago │
  │   OEM   │      │ Airline │      │   MRO   │      │ Airline │
  └─────────┘      └─────────┘      └─────────┘      └─────────┘
   Mar 2019         Jun 2019          Feb 2022         Sep 2022
   Manufactured     Installed         Overhauled       Installed
   📄 2 docs        📄 3 docs         📄 8 docs        📄 2 docs
                    📷 0 photos       📷 12 photos     📷 0 photos
                                     🎤 3 voice notes
```

**Interaction:**
- Clicking a facility expands to show all events that happened there
- Events at each facility show evidence counts (docs, photos, voice notes)
- Hovering shows date ranges
- If there's a GAP between facilities (from exception data), show a red
  dashed line with "⚠ XX days unaccounted"

### 3. Evidence Gallery

When a facility node is expanded (clicked), show the evidence captured there:

```
┌─────────────────────────────────────────────────────────┐
│  📍 ACE Aerospace Services, Singapore                    │
│     Feb 2, 2022 — Mar 15, 2022 (41 days)                │
│                                                          │
│  Events:                                                 │
│  ├── Feb 2:  Receiving Inspection                        │
│  ├── Feb 8:  Teardown                                    │
│  ├── Feb 15: Detailed Inspection  📷 4 photos            │
│  │   "Clean unit overall. Normal wear patterns for       │
│  │    8,000-hr pump. Main gear shaft bearing within      │
│  │    limits at 0.0012" play."                           │
│  ├── Feb 22: Repair — Seal replacement                   │
│  ├── Mar 5:  Functional Test  📷 2 photos                │
│  │   Flow: 12.4 GPM ✓  Pressure: 3,000 PSI ✓           │
│  └── Mar 15: Release to Service                          │
│       📄 8130-3 Generated  📄 Work Order Generated       │
│                                                          │
│  Documents:                                              │
│  📄 8130-3 Release Certificate (AI-generated)            │
│  📄 Work Order WO-2025-0892                              │
│  📄 Test Results Report                                  │
│  📄 CMM 29-10-01 Rev. 12 (reference)                    │
└─────────────────────────────────────────────────────────┘
```

### 4. Trust Indicators

Each section of the digital thread should show trust indicators:

- **🟢 Verified** — Event has supporting documents, facility is certified, no exceptions
- **🟡 Partial** — Event exists but documentation is incomplete (missing certs, no photos)
- **🔴 Gap** — No records for this period, or active exceptions/alerts
- **⬜ Unknown** — Part existed but no records at all

The overall thread trust is the combination of all sections:
```
Thread Trust: 🟢🟢🟢🟢🟡🟢 → 94% Verified
```

### 5. "What If" Comparison Mode

Add a toggle: "Compare with industry average"

This shows what a TYPICAL part's documentation looks like vs. this one:

```
This Component:    🟢🟢🟢🟢🟡🟢  94% documented
Industry Average:  🟢🟡🔴🟡🔴🟡  38% documented
```

The stat (38% or similar) reinforces that most parts in the industry have
terrible documentation — and AeroTrack fixes that.

### 6. Integration with Existing Parts Page

The current parts detail page has:
- Identity card
- Exception badge + alerts
- Lifecycle timeline
- Documents sidebar
- Provenance chain

**Reorganize the page layout:**

```
┌──────────────────────────────────────────────────────────┐
│  DIGITAL THREAD HERO (new — spec 009)                    │
│  Part identity + facility flow + trust score              │
├──────────────────────────────────────────────────────────┤
│  FACILITY JOURNEY MAP (new — spec 009)                   │
│  Horizontal flow with expandable evidence                 │
├──────────────────────────────────────────────────────────┤
│  BACK-TO-BIRTH TIMELINE (enhanced — spec 003)            │
│  Vertical timeline with gap visualization                 │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │  EXCEPTIONS      │  │  DOCUMENTS       │             │
│  │  (existing)      │  │  (existing)      │             │
│  └──────────────────┘  └──────────────────┘             │
└──────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

- [ ] Digital Thread hero section replaces old identity card at top of parts page
- [ ] Facility flow shows every company/shop the part has visited as a horizontal chain
- [ ] Each facility node shows: name, location, type (OEM/airline/MRO/distributor), date range
- [ ] Green/yellow/red trust dots appear at each facility based on documentation quality
- [ ] Facility Journey Map shows the part's physical path with arrows connecting stops
- [ ] Clicking a facility expands to show all events and evidence at that location
- [ ] Evidence gallery shows photos, voice note transcriptions, and document counts
- [ ] Gaps between facilities show as red dashed connections with warning text
- [ ] Overall trust score displays as percentage with colored progress bar
- [ ] Component 1 (complete history) shows a fully green thread with high trust score
- [ ] Component 2 (14-month gap) shows a red gap section with lower trust score
- [ ] Page layout reorganized: hero → journey map → timeline → exceptions/documents
- [ ] Trust indicators: green (verified), yellow (partial), red (gap), gray (unknown)
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
