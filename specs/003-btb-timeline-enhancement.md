# 003: Back-to-Birth Trace Timeline Enhancement

**Priority:** 2 (HEICO DEMO — build first, foundation for digital thread visualization)
**Estimated effort:** Medium
**Dependencies:** Spec 001 (exceptions data displayed on timeline)

---

## Overview

Enhance the existing lifecycle timeline on the Part Detail page to match and exceed ProvenAir's flagship feature — a visual back-to-birth trace. The current timeline shows events in order, but it needs:
- A **trace completeness score** (how documented is this part's life?)
- **Gap visualization** (red highlights where documentation is missing)
- **Company ownership markers** (clearly show when a part changed hands)
- **Document counts per event** (how much evidence supports each event?)
- **PDF export** (generate a shareable trace report)

For the Parker/HEICO demo, this is the visual centerpiece. Executives should see the "perfect" timeline for Component 1 and immediately contrast it with the "gap" timeline for Component 2. The message: "This is what complete looks like. This is what incomplete looks like. Which do you want?"

---

## What to Build

### 1. Trace Completeness Score

Create `/lib/trace-completeness.ts`:

```typescript
export function calculateTraceCompleteness(component: ComponentWithEvents): {
  score: number;          // 0-100 percentage
  documentedDays: number;
  totalDays: number;
  gapCount: number;
  totalGapDays: number;
  rating: "complete" | "good" | "fair" | "poor";
} {
  // 1. Calculate total days from manufacture date to today (or retirement date)
  // 2. For each event, mark the days around it as "documented"
  //    - An event covers the day it occurred
  //    - An "install" event covers all days until the next "remove" event
  //    - A "manufacture" event covers day 0
  // 3. Count undocumented days (gaps between coverage periods)
  // 4. Score = (documentedDays / totalDays) * 100
  // 5. Rating: complete (>95%), good (80-95%), fair (60-80%), poor (<60%)
}
```

### 2. Enhanced Timeline Component

Replace or significantly enhance the existing `/components/parts/lifecycle-timeline.tsx`:

**Visual design:**

```
Trace Completeness: 94% ████████████████████░░ Good
6 years, 8 months documented | 2 gaps identified (47 days total)

─── TIMELINE ────────────────────────────────────────────────────

  🏭 MANUFACTURED                                    Mar 15, 2019
  │  Parker Aerospace — Hydraulic Systems Division, Irvine CA
  │  8130-3 Birth Certificate issued
  │  📄 2 documents
  │
  │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 3 months ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  │
  ✈️ INSTALLED on Delta N401DL (A320neo)              Jun 22, 2019
  │  Delta TechOps, Atlanta GA
  │  📄 1 document
  │  ────── Transferred to Delta Air Lines ──────
  │
  │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 21 months ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  │
  🔍 ROUTINE INSPECTION                              Mar 10, 2021
  │  Delta TechOps, Atlanta GA
  │  Hours: 4,200 | Cycles: 2,800
  │  📄 1 document  📷 0 photos  🎤 0 voice notes
  │
  │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 10 months ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  │
  🔧 REMOVED for scheduled overhaul                  Jan 8, 2022
  │  Delta TechOps, Atlanta GA
  │  Hours: 8,000 | Cycles: 5,100
  │
  │  ▬▬▬▬ 4 weeks ▬▬▬▬
  │
  🔧 OVERHAULED                                      Feb 12, 2022
  │  ACE Services Singapore
  │  Full overhaul per CMM 29-10-01 Rev. 12
  │  📄 4 documents  📷 3 photos  🎤 1 voice note
  │  "Clean unit overall. Normal wear patterns for 8,000-hr pump."
  │
  ...
```

**Key visual elements:**

- **Event icons:** Different icon per event type (🏭 manufacture, ✈️ install, 🔧 repair/remove, 🔍 inspect, 📦 transfer, ⛔ retire)
- **Company transfer markers:** Horizontal divider with text when ownership changes: `────── Transferred to United Airlines ──────`
- **Duration bars:** Between events, show a gray bar with duration text. For GAPS (from exception data), show a RED dashed bar: `┄┄┄┄ ⚠️ 14 MONTHS — NO DOCUMENTATION ┄┄┄┄` in red text
- **Document/evidence counts:** Show icons with counts: 📄 docs, 📷 photos, 🎤 voice notes
- **Voice note excerpts:** If a voice transcription exists, show a brief italic excerpt
- **Hours/cycles at event:** When available, show in small gray text

### 3. Gap Visualization

When exception data (from spec 001) includes `documentation_gap` exceptions for this component:
- Render the gap as a distinct red section in the timeline
- Show the gap duration prominently
- Add explanatory text: "No records between [last event] and [next event]. [Duration] unaccounted."
- If severity is critical (>180 days): Add a warning icon and larger text

### 4. Event Detail Expansion

Clicking any event on the timeline should expand it inline to show:
- Full event description
- Linked evidence gallery:
  - Photos as a thumbnail row (click to enlarge)
  - Voice note transcriptions (full text)
  - Measurements table
  - Parts consumed list
- Linked documents:
  - Generated documents (8130-3, work orders) with "View" button
  - Uploaded legacy documents with "View" button
- SHA-256 hash of the event data
- Technician name and certificate number

### 5. Trace Completeness Display

At the top of the timeline section, show:

```
┌─────────────────────────────────────────────────────────────────┐
│ Back-to-Birth Trace                                              │
│                                                                   │
│ Completeness: 94%  ████████████████████░░  Good                  │
│                                                                   │
│ 📅 6 years, 8 months total lifecycle                             │
│ 📋 14 documented events                                          │
│ ⚠️  2 gaps identified (47 days total)                            │
│ 📄 23 documents on file                                          │
│                                                                   │
│ [Export Trace Report (PDF)]  [Run Verification]                  │
└─────────────────────────────────────────────────────────────────┘
```

Color coding for the progress bar:
- Green fill for >95%
- Yellow fill for 80-95%
- Orange fill for 60-80%
- Red fill for <60%

### 6. PDF Export

Create an API route `GET /api/export/trace/[componentId]` that generates a PDF trace report using `pdf-lib`:

**PDF layout:**
- **Page 1: Cover**
  - "Component Trace Report"
  - AeroTrack logo area (text-based for MVP)
  - Component: P/N, S/N, Description, OEM
  - Trace Completeness: XX%
  - Generated: [date]
  - Report hash: [SHA-256]

- **Page 2+: Timeline**
  - Chronological list of all events with details
  - Gaps highlighted with "DOCUMENTATION GAP" labels
  - Each event shows: date, type, facility, hours/cycles, description, document references

- **Final page: Summary**
  - Total events: X
  - Total documents: X
  - Gaps identified: X (Y total days)
  - Exceptions: X open
  - Trust score: XX/100

Add "Export Trace Report (PDF)" button to the trace completeness display area. When clicked, generate and download the PDF.

---

## Acceptance Criteria

- [ ] Trace completeness score (0-100%) calculates correctly based on documented vs. total days
- [ ] Score is displayed prominently at the top of the timeline section with a progress bar
- [ ] Timeline shows different icons for each event type (manufacture, install, remove, repair, inspect, transfer, retire)
- [ ] Company ownership changes are shown as distinct horizontal dividers with company names
- [ ] Duration between events is displayed on connecting bars
- [ ] Documentation gaps from exception data are shown as red sections with gap duration
- [ ] Gaps >180 days are visually larger/more prominent than gaps 30-180 days
- [ ] Each event shows document/evidence counts (docs, photos, voice notes)
- [ ] Clicking an event expands it to show full details, evidence, and linked documents
- [ ] Voice note excerpts are shown inline on the timeline for events that have them
- [ ] Hours and cycles are displayed at each event where available
- [ ] "Export Trace Report (PDF)" button generates a downloadable PDF
- [ ] PDF contains cover page, chronological timeline, and summary
- [ ] Component 1 (perfect history) shows a high completeness score (>90%) with a clean timeline
- [ ] Component 2 (the gap) shows a lower score with the 14-month gap prominently highlighted in red
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
