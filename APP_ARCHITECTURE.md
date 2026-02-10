# AeroTrack MVP — Application Architecture

## What Is This App?

AeroTrack is an AI-powered system that **automates aviation maintenance paperwork**. When a mechanic overhauls an airplane part, they currently spend 60-90 minutes filling out FAA forms by hand. AeroTrack lets them just **work** — capturing photos, voice notes, and measurements — and the AI writes all the paperwork for them.

**Core pitch:** *"The mechanic works. The paperwork writes itself."*

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AeroTrack MVP                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  SMART       │  │  WEB APP     │  │  EXECUTIVE DEMO          │  │
│  │  GLASSES     │  │  (Dashboard) │  │  (Pitch to HEICO)        │  │
│  │  DEMO        │  │              │  │                          │  │
│  │  /glasses-   │  │  /dashboard  │  │  /demo                   │  │
│  │  demo        │  │  /capture    │  │  (7-step guided tour)    │  │
│  │              │  │  /parts      │  │                          │  │
│  │  Shows what  │  │  /integrity  │  │  Shows the business      │  │
│  │  a mechanic  │  │  /knowledge  │  │  case with ROI           │  │
│  │  sees through│  │  /analytics  │  │  calculator              │  │
│  │  AR glasses  │  │              │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                 │                        │                │
│         └─────────────────┼────────────────────────┘                │
│                           │                                         │
│                    ┌──────▼───────┐                                 │
│                    │   AI ENGINE  │                                 │
│                    │   (Claude)   │                                 │
│                    │              │                                 │
│                    │ • Reads docs │                                 │
│                    │ • Parses     │                                 │
│                    │   voice      │                                 │
│                    │ • Generates  │                                 │
│                    │   FAA forms  │                                 │
│                    └──────┬───────┘                                 │
│                           │                                         │
│                    ┌──────▼───────┐                                 │
│                    │   DATABASE   │                                 │
│                    │   (SQLite)   │                                 │
│                    │              │                                 │
│                    │ 17 components│                                 │
│                    │ 100+ events  │                                 │
│                    │ Evidence,    │                                 │
│                    │ documents,   │                                 │
│                    │ exceptions   │                                 │
│                    └──────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Every Page in the App

Think of the app like a building with different rooms. Here's what's in each room:

```
HOME PAGE (/)
│   Dark landing page. Three doors to enter:
│   "Dashboard" · "Capture Tool" · "Glasses Demo"
│
├── DASHBOARD (/dashboard)
│   │   Fleet overview — see ALL your parts at a glance
│   │   • Search/filter by part number, serial number, status
│   │   • Pie chart showing how many parts are serviceable vs in-repair
│   │   • Click any part → goes to its detail page
│   │
│   ├── PARTS DETAIL (/parts/[id])
│   │       Everything about one specific part:
│   │       • Full lifecycle timeline (manufactured → installed → repaired → etc.)
│   │       • All evidence (photos, voice notes, measurements)
│   │       • Compliance documents (8130-3, Form 337, 8010-4)
│   │       • Download PDFs of any document
│   │       • Alerts and exceptions flagged for this part
│   │
│   ├── CAPTURE TOOL (/capture)
│   │   │   Where the real work happens. Two ways to start:
│   │   │   • SCAN: Point camera at a document → AI reads it
│   │   │   • MANUAL: Type in part number + serial number
│   │   │
│   │   └── OVERHAUL WORKFLOW (/capture/work/[componentId])
│   │           6-step guided process:
│   │           ┌─────────┐  ┌──────────┐  ┌─────────┐
│   │           │ RECEIVE  │→ │ TEARDOWN │→ │ INSPECT │→
│   │           │ Checklist│  │ Photos   │  │ Measure │
│   │           └─────────┘  └──────────┘  └─────────┘
│   │           ┌─────────┐  ┌──────────┐  ┌─────────┐
│   │        → │ REPAIR   │→ │  TEST    │→ │ RELEASE │
│   │           │ Parts    │  │ Pass/Fail│  │ AI makes│
│   │           │ replaced │  │ results  │  │ all the │
│   │           └─────────┘  └──────────┘  │ forms!  │
│   │                                       └─────────┘
│   │
│   ├── INTEGRITY (/integrity)
│   │       The "detective" — scans all parts for problems:
│   │       • Missing paperwork
│   │       • Serial numbers that don't match
│   │       • Cycle counts that went backwards (suspicious!)
│   │       • Unsigned documents
│   │       • Date inconsistencies
│   │       Color-coded: 🔴 Critical  🟡 Warning  🔵 Info
│   │
│   ├── KNOWLEDGE (/knowledge)
│   │       Wisdom library — captures what experienced mechanics know
│   │       • "When you see scoring on the turbine blades..."
│   │       • Searchable by topic, part family, expert
│   │       • Links to CMM (Component Maintenance Manual) references
│   │
│   └── ANALYTICS (/analytics)
│           Fleet-wide charts (mock data for now):
│           • No Fault Found rates
│           • Mean Time Between Removals
│           • Turnaround time by facility
│           • Record quality (digital vs scanned vs missing)
│
├── GLASSES DEMO (/glasses-demo)
│       43-second simulation of what a mechanic sees through smart glasses:
│       Phase 1: Green terminal screen → "Press Start"
│       Phase 2: HUD overlay — crosshairs, part ID, live voice transcription,
│                findings list, measurements, BOM checklist
│       Phase 3: "Generating documentation..." (3.5 sec progress bar)
│       Phase 4: Three FAA forms appear, fully filled out
│       → "View Part Details" button links to /parts/demo-hpc7-overhaul
│
└── EXECUTIVE DEMO (/demo)
        7-step guided pitch for showing HEICO:
        Step 1: The Problem (animated stats: $180M cost, 15% error rate)
        Step 2: The Mechanic's View (link to glasses demo)
        Step 3: Evidence → Documents (watch AI generate forms)
        Step 4: The Digital Thread (compare clean vs gapped part history)
        Step 5: Fleet Intelligence (live exception scan)
        Step 6: The HEICO Opportunity (editable ROI calculator)
        Step 7: Try It Yourself (links to all features)
```

---

## The Database — What Data Lives Here

Think of the database as a filing cabinet. Here are the drawers:

```
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE (SQLite)                        │
│                                                             │
│  ┌─────────────────┐      ┌──────────────────┐             │
│  │   COMPONENT     │      │  LIFECYCLE EVENT │             │
│  │   (The Part)    │──1:N─│  (What happened) │             │
│  │                 │      │                  │             │
│  │ • Part Number   │      │ • Type (mfg,     │             │
│  │ • Serial Number │      │   install, repair│             │
│  │ • Description   │      │   test, etc.)    │             │
│  │ • OEM           │      │ • Date           │             │
│  │ • Status        │      │ • Facility       │             │
│  │ • Total Hours   │      │ • Who did it     │             │
│  │ • Total Cycles  │      │ • Hours/Cycles   │             │
│  │ • Is Life-      │      │   at this point  │             │
│  │   Limited?      │      │ • Notes          │             │
│  └─────────────────┘      └────────┬─────────┘             │
│                                    │                        │
│                    ┌───────────────┼───────────────┐        │
│                    │               │               │        │
│              ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  │
│              │ EVIDENCE  │  │ GENERATED │  │  PARTS    │  │
│              │           │  │ DOCUMENT  │  │ CONSUMED  │  │
│              │ • Photo   │  │           │  │           │  │
│              │ • Video   │  │ • 8130-3  │  │ • Part #  │  │
│              │ • Voice   │  │ • Work    │  │ • Serial #│  │
│              │   Note    │  │   Order   │  │ • Qty     │  │
│              │ • Doc     │  │ • Findings│  │ • Vendor  │  │
│              │   Scan    │  │ • Form 337│  │           │  │
│              │ • Measure │  │ • 8010-4  │  │ What sub- │  │
│              │   -ment   │  │           │  │ parts were│  │
│              │           │  │ The FAA   │  │ used in   │  │
│              │ Raw proof │  │ forms AI  │  │ the repair│  │
│              │ captured  │  │ generates │  │           │  │
│              └───────────┘  └───────────┘  └───────────┘  │
│                                                             │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   EXCEPTION     │  │    ALERT     │  │  KNOWLEDGE   │  │
│  │                 │  │              │  │   ENTRY      │  │
│  │ Auto-detected   │  │ Manual flags │  │              │  │
│  │ problems:       │  │ raised by    │  │ Mechanic     │  │
│  │ • Missing docs  │  │ humans:      │  │ wisdom:      │  │
│  │ • # mismatches  │  │ • Counterfeit│  │ • Tips       │  │
│  │ • Cycle gaps    │  │   suspect    │  │ • Gotchas    │  │
│  │ • Date errors   │  │ • Overdue    │  │ • "When you  │  │
│  │ • Unsigned docs │  │   inspection │  │   see this,  │  │
│  │                 │  │ • Provenance │  │   do that"   │  │
│  │ Severity:       │  │   gap        │  │              │  │
│  │ 🔴🟡🔵         │  │              │  │ Searchable   │  │
│  └─────────────────┘  └──────────────┘  └──────────────┘  │
│                                                             │
│  ┌─────────────────┐                                       │
│  │   DOCUMENT      │                                       │
│  │   (Source)      │                                       │
│  │                 │                                       │
│  │ Original docs   │                                       │
│  │ that exist in   │                                       │
│  │ the real world: │                                       │
│  │ • CMMs          │                                       │
│  │ • Service       │                                       │
│  │   Bulletins     │                                       │
│  │ • Certificates  │                                       │
│  │ • Legacy paper  │                                       │
│  │   records       │                                       │
│  └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## The 17 Demo Components (Your Test Data)

Each represents a real-world scenario a maintenance shop would face:

```
 #  │ Part                          │ Scenario / Story
────┼───────────────────────────────┼──────────────────────────────────────
 1  │ Parker HPC-7 Pump             │ "Perfect History" — clean traceability
 2  │ Parker HPC-7 Pump             │ "The Gap" — 14-month documentation hole
 3  │ Parker HPC-7 Pump             │ Currently in repair (demo workflow)
 4  │ Hamilton Sundstrand FCU       │ Previously quarantined, repaired
 5  │ Honeywell GTCP36-150 APU     │ Large complex component
 6  │ Collins WXR-840 Radar         │ Avionics with software
 7  │ Safran CFM56 Compressor       │ Engine module — high value
 8  │ Parker 3411 Fuel Valve        │ Simple component, clean history
 9  │ Parker HPC-7 (Demo)           │ Glasses demo component (deterministic ID)
────┼───────────────────────────────┼──────────────────────────────────────
    │        ↑ EXISTED BEFORE       │
    │        ↓ ADDED THIS SESSION   │
────┼───────────────────────────────┼──────────────────────────────────────
10  │ Honeywell 131-9A APU          │ "Workhorse" — JetBlue→Air India, 2 overhauls
11  │ Safran MLG Retract Actuator   │ "Life Limit" — at 93% of 20K cycle limit ⚠️
12  │ Collins AHC-3000 AHRS         │ "AD Required" — needs firmware update per FAA
13  │ Parker Fuel Manifold           │ "Broker Chain" — 3 broker transfers 🔄
14  │ Eaton Hydraulic Accumulator    │ "Shelf Life Expired" — quarantined 🔴
15  │ Hamilton Sundstrand IDG       │ "Cross-Border" — FAA→EASA jurisdiction
16  │ Moog Servo Valve               │ "Fleet SB" — service bulletin compliance
17  │ Collins Transponder            │ "Unauthorized Mod" — non-approved connector 🚨
```

---

## How the AI Pipeline Works

This is the "magic" — turning mechanic work into FAA-compliant documents:

```
MECHANIC CAPTURES EVIDENCE                    AI PROCESSES
┌──────────────────────┐                     ┌──────────────────┐
│                      │                     │                  │
│  📸 Takes photos     │                     │  Claude Vision   │
│  🎤 Records voice    │ ──── sent to ────→  │  reads photos,   │
│  📏 Logs measurements│                     │  transcribes     │
│  📋 Checks boxes     │                     │  voice, parses   │
│                      │                     │  measurements    │
└──────────────────────┘                     └────────┬─────────┘
                                                      │
                                                      ▼
                                             ┌──────────────────┐
                                             │  AI generates    │
                                             │  3 documents:    │
                                             │                  │
                                             │  1. FAA 8130-3   │
                                             │     (Release     │
                                             │      Certificate)│
                                             │                  │
                                             │  2. Work Order   │
                                             │     (What was    │
                                             │      done)       │
                                             │                  │
                                             │  3. Findings     │
                                             │     Report       │
                                             │     (What was    │
                                             │      found)      │
                                             └────────┬─────────┘
                                                      │
                                                      ▼
                                             ┌──────────────────┐
                                             │  Mechanic        │
                                             │  reviews forms,  │
                                             │  signs digitally │
                                             │                  │
                                             │  Documents get   │
                                             │  SHA-256 hashed  │
                                             │  (tamper-proof)  │
                                             └──────────────────┘

                              ⏱️ 60-90 minutes of paperwork → ~30 seconds
```

---

## The Integrity Engine (Exception Detection)

Think of this as an automated auditor that checks every part for problems:

```
             "SCAN ALL"
                 │
                 ▼
    ┌────────────────────────┐
    │   For each component:  │
    │                        │
    │   ✓ Serial numbers     │──→  Do they match across all events?
    │     match?             │
    │                        │
    │   ✓ Part numbers       │──→  Same P/N in every record?
    │     consistent?        │
    │                        │
    │   ✓ Hours & cycles     │──→  Do they only go UP over time?
    │     make sense?        │     (going backwards = tampering?)
    │                        │
    │   ✓ Required docs      │──→  Birth cert? Release cert?
    │     present?           │     Work orders for all repairs?
    │                        │
    │   ✓ Dates logical?     │──→  Installed BEFORE manufactured?
    │                        │     That's a problem.
    │                        │
    │   ✓ Documents signed?  │──→  Unsigned 8130-3 = not airworthy
    │                        │
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────┐
    │   FINDINGS             │
    │                        │
    │   🔴 CRITICAL          │  Missing birth certificate
    │   🔴 CRITICAL          │  Unauthorized modification
    │   🟡 WARNING           │  Documentation gap found
    │   🟡 WARNING           │  Life limit approaching
    │   🔵 INFO              │  Unsigned draft document
    │                        │
    └────────────────────────┘
```

---

## File Structure (Simplified)

```
aerotrack-mvp/
│
├── app/                          ← All the pages you see in the browser
│   ├── page.tsx                  ← Home/landing page
│   ├── glasses-demo/             ← Smart glasses simulation
│   ├── (dashboard)/              ← Everything behind the sidebar
│   │   ├── dashboard/            ← Fleet overview
│   │   ├── capture/              ← Evidence capture + overhaul workflow
│   │   ├── parts/[id]/           ← Individual part detail pages
│   │   ├── integrity/            ← Exception/alert detection
│   │   ├── knowledge/            ← Mechanic wisdom library
│   │   ├── analytics/            ← Charts and metrics
│   │   └── demo/                 ← Executive demo (HEICO pitch)
│   └── api/                      ← Backend logic (invisible to user)
│       ├── ai/                   ← Claude AI integration
│       ├── components/           ← Part data operations
│       ├── exceptions/           ← Integrity engine
│       ├── documents/            ← PDF generation
│       └── knowledge/            ← Knowledge base operations
│
├── components/                   ← Reusable UI pieces
├── lib/                          ← Shared logic (database, integrity engine)
├── prisma/                       ← Database schema + seed data
│   ├── schema.prisma             ← Defines the data structure
│   ├── seed.ts                   ← All 17 demo components
│   └── dev.db                    ← The actual database file
│
└── generated/prisma/             ← Auto-generated database code
```

---

## Key URLs to Explore

| URL | What You'll See |
|-----|----------------|
| http://localhost:3000 | Landing page |
| http://localhost:3000/dashboard | All 17 parts in a searchable table |
| http://localhost:3000/glasses-demo | 43-second smart glasses simulation |
| http://localhost:3000/demo | 7-step HEICO pitch with ROI calculator |
| http://localhost:3000/capture | Start an overhaul capture workflow |
| http://localhost:3000/integrity | Run the exception scanner |
| http://localhost:3000/knowledge | Browse mechanic knowledge base |
| http://localhost:3000/analytics | Fleet analytics (mock data) |
| http://localhost:3000/parts/demo-hpc7-overhaul | Component 9 detail (glasses demo part) |
