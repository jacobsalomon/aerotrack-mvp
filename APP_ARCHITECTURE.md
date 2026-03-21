# AeroVision MVP — Application Architecture

## What Is This App?

AeroVision is an AI-powered system that **automates aviation maintenance paperwork**. When a mechanic overhauls an airplane part, they currently spend 60-90 minutes filling out FAA forms by hand. AeroVision lets them just **work** — the smart glasses observe what they're doing, and the AI writes all the paperwork automatically. The mechanic reviews and signs. No narration, no extra steps.

**Core pitch:** *"The mechanic works. The paperwork writes itself."*

**First client:** SilverWings, an MRO shop with 120 employees. Starting with measurement capture flowing into Quantum (their existing system).

---

## The Big Picture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        AeroVision MVP                                │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  iOS APP     │  │  WEB APP     │  │  CMM TEMPLATE ENGINE     │   │
│  │  (Companion) │  │  (Dashboard) │  │  (Inspection Templates)  │   │
│  │              │  │              │  │                          │   │
│  │  Captures    │  │  /jobs       │  │  /library                │   │
│  │  photos,     │  │  /forms      │  │  Upload CMM PDFs →       │   │
│  │  video,      │  │  /technicians│  │  AI extracts sections,   │   │
│  │  audio on    │  │  /settings   │  │  tolerances, checklists  │   │
│  │  the shop    │  │              │  │                          │   │
│  │  floor       │  │  Review &    │  │  Powers guided           │   │
│  │              │  │  approve     │  │  inspections             │   │
│  │              │  │  AI-drafted  │  │                          │   │
│  │              │  │  documents   │  │                          │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘   │
│         │                 │                        │                 │
│         └─────────────────┼────────────────────────┘                 │
│                           │                                          │
│                    ┌──────▼───────┐                                  │
│                    │  AI ENGINE   │                                  │
│                    │  (Multi-     │                                  │
│                    │   Provider)  │                                  │
│                    │              │                                  │
│                    │ • GPT-5.4   │                                  │
│                    │ • Claude 4.6│                                  │
│                    │ • Gemini 2.5│                                  │
│                    │ • ElevenLabs│                                  │
│                    │   Scribe    │                                  │
│                    └──────┬───────┘                                  │
│                           │                                          │
│                    ┌──────▼───────┐                                  │
│                    │  DATABASE    │                                  │
│                    │  (Neon       │                                  │
│                    │   Postgres)  │                                  │
│                    │              │                                  │
│                    │ 39 models    │                                  │
│                    │ Components,  │                                  │
│                    │ sessions,    │                                  │
│                    │ templates,   │                                  │
│                    │ measurements │                                  │
│                    └──────────────┘                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Every Page in the App

The app has two types of pages: **protected** (behind login + sidebar) and **public** (standalone).

### Protected Pages (behind sidebar)

```
JOBS (/jobs)  ← The main page. Where all the work lives.
│   Unified list of all work orders and inspections.
│   • Two types: "Freeform Capture" and "Guided Inspection"
│   • Status badges: In Progress, Ready to Review, Complete, Cancelled
│   • Shows: Work Order #, Component (P/N + S/N), Mechanic, Type
│   • Create new jobs with the "New Job" button
│
├── JOB DETAIL (/jobs/[id])
│       Opens the right workspace based on job type:
│       • Freeform → Session detail with evidence, AI analysis, documents
│       • Guided → CMM-guided inspection workspace with checklist items
│       Sub-pages:
│       • /jobs/[id]/audit — Full audit trail of everything that happened
│       • /jobs/[id]/review — Supervisor review and sign-off
│
├── FORMS (/forms)
│       Form builder and testing tools
│
├── TEMPLATES (/library)
│   │   CMM inspection template management:
│   │   • Upload CMM PDFs (up to 500 pages)
│   │   • AI extracts sections, measurements, tolerances, checklists
│   │   • Review and approve templates before use
│   │   • Templates link to specific part numbers
│   │
│   └── TEMPLATE REVIEW (/library/[templateId]/review)
│           Detailed view of extracted sections and items
│           • Edit/reextract individual sections
│           • Approve or reject the full template
│
├── TEAM (/technicians)
│       Manage your shop's mechanics:
│       • Add technicians with badge numbers
│       • FAA license verification
│       • Assign techs to inspection jobs
│
├── SETTINGS (/settings)
│       Organization-wide configuration:
│       • Org name display
│       • AI Agent Instructions (markdown-formatted)
│       • Instructions get injected into ALL AI prompts
│         (transcription, measurement extraction, doc generation)
│
├── DASHBOARD (/dashboard)
│       Fleet overview — all components at a glance
│       • Search/filter by part number, serial number, status
│       • Status breakdown chart
│       • Click any part → part detail page
│
├── PARTS DETAIL (/parts/[id])
│       Everything about one specific component:
│       • Full lifecycle timeline
│       • All evidence (photos, voice notes, measurements)
│       • Compliance documents (8130-3, Work Order, Findings)
│       • Download PDFs
│       • Alerts and exceptions
│
└── ANALYTICS (/analytics)
        Fleet-wide charts and metrics
```

### Public Pages (no login required)

```
LOGIN (/login)              Email + password authentication
REGISTER (/register)        Create account + join/create organization
JOIN ORG (/join-org)         Join existing org with invite code
FORGOT PASSWORD              Password reset flow
GLASSES DEMO (/glasses-demo) Smart glasses simulation (4 phases)
DOCS (/docs)                 User guide and help documentation
```

---

## The Database — What Data Lives Here

The database uses **PostgreSQL** (hosted on Neon) with **39 models** managed by Prisma.

```
┌──────────────────────────────────────────────────────────────────┐
│                    DATABASE (Neon Postgres)                       │
│                                                                  │
│  ── CORE TRACKING ──────────────────────────────────────────     │
│                                                                  │
│  ┌─────────────────┐      ┌──────────────────┐                  │
│  │   COMPONENT     │      │  LIFECYCLE EVENT │                  │
│  │   (The Part)    │──1:N─│  (What happened) │                  │
│  │                 │      │                  │                  │
│  │ • Part Number   │      │ • Type (mfg,     │                  │
│  │ • Serial Number │      │   install, repair│                  │
│  │ • Description   │      │   overhaul, test,│                  │
│  │ • OEM           │      │   release, etc.) │                  │
│  │ • Status        │      │ • Date           │                  │
│  │ • Total Hours   │      │ • Facility       │                  │
│  │ • Total Cycles  │      │ • Who did it     │                  │
│  │ • Is Life-      │      │ • Hours/Cycles   │                  │
│  │   Limited?      │      │ • Notes          │                  │
│  │ • Location      │      │                  │                  │
│  │ • Aircraft      │      │                  │                  │
│  │ • Operator      │      │                  │                  │
│  └─────────────────┘      └────────┬─────────┘                  │
│                                    │                             │
│                    ┌───────────────┼───────────────┐             │
│              ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐      │
│              │ EVIDENCE  │  │ GENERATED │  │  PARTS    │      │
│              │           │  │ DOCUMENT  │  │ CONSUMED  │      │
│              │ • Photo   │  │           │  │           │      │
│              │ • Video   │  │ • 8130-3  │  │ • Part #  │      │
│              │ • Voice   │  │ • Work    │  │ • Serial #│      │
│              │   Note    │  │   Order   │  │ • Qty     │      │
│              │ • Doc     │  │ • Findings│  │ • Vendor  │      │
│              │   Scan    │  │ • 8010-4  │  │           │      │
│              │ • Measure │  │           │  │           │      │
│              │   -ment   │  │           │  │           │      │
│              └───────────┘  └───────────┘  └───────────┘      │
│                                                                  │
│  ── CAPTURE & INSPECTION ───────────────────────────────────     │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────┐            │
│  │  CAPTURE SESSION    │    │  CAPTURE EVIDENCE    │            │
│  │                     │    │                      │            │
│  │ • sessionType:      │1:N │ • PHOTO, VIDEO,      │            │
│  │   "capture" or      │────│   AUDIO_CHUNK        │            │
│  │   "inspection"      │    │ • fileUrl (Blob)     │            │
│  │ • status (pipeline) │    │ • transcription      │            │
│  │ • workOrderRef      │    │ • aiExtraction       │            │
│  │ • templateId        │    │ • GPS coordinates    │            │
│  │ • configVariant     │    │                      │            │
│  │ • signedOffBy/At    │    └──────────────────────┘            │
│  └─────────────────────┘                                        │
│                                                                  │
│  ── CMM TEMPLATES ──────────────────────────────────────────     │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────┐                │
│  │ INSPECTION TEMPLATE │    │ INSPECTION       │                │
│  │                     │    │ SECTION          │                │
│  │ • title             │1:N │                  │                │
│  │ • partNumbersCovered│────│ • figureNumber   │                │
│  │ • configOptions     │    │ • referenceImages│                │
│  │ • revisionDate      │    │ • config applic. │                │
│  │ • totalPages        │    │                  │                │
│  │ • status (draft →   │    │  ┌──────────────┐│                │
│  │   processing →      │    │  │ INSPECTION   ││                │
│  │   ready → approved) │    │  │ ITEM         ││                │
│  └─────────────────────┘    │  │              ││                │
│                              │  │ • go_no_go   ││                │
│                              │  │ • measurement││                │
│                              │  │ • text_entry ││                │
│                              │  │ • tolerances ││                │
│                              │  └──────────────┘│                │
│                              └──────────────────┘                │
│                                                                  │
│  ── MEASUREMENTS ───────────────────────────────────────────     │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────┐                │
│  │ MEASUREMENT SPEC    │    │ MEASUREMENT      │                │
│  │                     │    │                  │                │
│  │ • partNumber        │    │ • value          │                │
│  │ • specName          │    │ • unit           │                │
│  │ • nominalValue      │    │ • source         │                │
│  │ • tolerances        │    │ • sessionId      │                │
│  │ • units             │    │ • componentId    │                │
│  └─────────────────────┘    └──────────────────┘                │
│                                                                  │
│  ── AUTH & ORG ─────────────────────────────────────────────     │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │ ORGANIZATION   │  │ USER           │  │ INVITE CODE    │     │
│  │                │  │                │  │                │     │
│  │ • name         │  │ • email        │  │ • code         │     │
│  │ • FAA cert #   │  │ • role         │  │ • "SLVR-8K2M"  │     │
│  │ • address      │  │ • badgeNumber  │  │ • usesLeft     │     │
│  │ • agentInstr.  │  │ • faaLicense   │  │                │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
│                                                                  │
│  ── INTEGRITY ──────────────────────────────────────────────     │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │ EXCEPTION      │  │ ALERT          │  │ AUDIT LOG      │     │
│  │ (auto-detected)│  │ (manual flags) │  │                │     │
│  │ Missing docs,  │  │ Counterfeit,   │  │ Who did what,  │     │
│  │ # mismatches,  │  │ overdue insp., │  │ when           │     │
│  │ cycle gaps     │  │ provenance gap │  │                │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

---

## How the AI Pipeline Works

Turning mechanic work into FAA-compliant documents using multiple AI providers with automatic fallbacks:

```
MECHANIC CAPTURES EVIDENCE                    AI PROCESSES
┌──────────────────────┐                     ┌──────────────────────┐
│                      │                     │                      │
│  Takes photos        │                     │  TRANSCRIPTION       │
│  Records audio       │ ──── sent to ────→  │  ElevenLabs Scribe   │
│  Captures video      │                     │  (fallback: GPT-4o)  │
│  Logs measurements   │                     │                      │
│                      │                     │  PHOTO OCR            │
└──────────────────────┘                     │  GPT-5.4 → Gemini    │
                                             │  → Claude 4.6        │
                                             │                      │
                                             │  VIDEO ANALYSIS       │
                                             │  Gemini 2.5 Pro      │
                                             │                      │
                                             │  DOC GENERATION       │
                                             │  GPT-5.4 → Claude    │
                                             │  → Gemini 2.5 Pro    │
                                             └──────────┬───────────┘
                                                        │
                                                        ▼
                                             ┌──────────────────────┐
                                             │  AI generates        │
                                             │  3 documents:        │
                                             │                      │
                                             │  1. FAA 8130-3       │
                                             │     (Release cert)   │
                                             │                      │
                                             │  2. Work Order       │
                                             │     (What was done)  │
                                             │                      │
                                             │  3. Findings Report  │
                                             │     (What was found) │
                                             └──────────┬───────────┘
                                                        │
                                                        ▼
                                             ┌──────────────────────┐
                                             │  VERIFICATION        │
                                             │  Claude 4.6 checks   │
                                             │  docs for accuracy   │
                                             │                      │
                                             │  Mechanic reviews    │
                                             │  and signs digitally │
                                             └──────────────────────┘

                              60-90 minutes of paperwork → ~30 seconds
```

---

## CMM Template Extraction Pipeline

This is the system for turning paper Component Maintenance Manuals into digital inspection checklists:

```
  UPLOAD CMM PDF                  AI PASS 1 (INDEX)              AI PASS 2 (EXTRACT)
┌──────────────┐              ┌──────────────────┐           ┌──────────────────────┐
│              │              │  Gemini 2.5      │           │  Gemini 2.5 Pro      │
│  PDF up to   │              │  Flash (fast)    │           │  (detailed)          │
│  500 pages   │ ──────────→  │                  │ ───────→  │                      │
│              │              │  Identifies:     │           │  Extracts per        │
│  Stored in   │              │  • Figure numbers│           │  section:            │
│  Vercel Blob │              │  • Tables        │           │  • Checklist items   │
│              │              │  • Section       │           │  • Measurements      │
└──────────────┘              │    boundaries    │           │  • Tolerances        │
                              │  • Page ranges   │           │  • Go/No-Go checks   │
                              └──────────────────┘           │  • Config variants   │
                                                             └──────────┬───────────┘
                                                                        │
                                                                        ▼
                                                             ┌──────────────────────┐
                                                             │  REVIEW & APPROVE    │
                                                             │                      │
                                                             │  Supervisor reviews  │
                                                             │  extracted template  │
                                                             │  Can reextract       │
                                                             │  individual sections │
                                                             │  Approve → ready     │
                                                             │  for inspections     │
                                                             └──────────────────────┘
```

---

## Two Types of Jobs

```
┌─────────────────────────────────────────────────────────────────┐
│                         /jobs                                    │
│                                                                  │
│  ┌───────────────────────┐    ┌───────────────────────────────┐ │
│  │  FREEFORM CAPTURE     │    │  GUIDED INSPECTION            │ │
│  │                       │    │                               │ │
│  │  Mechanic captures    │    │  Follows a CMM template       │ │
│  │  evidence freely:     │    │  step by step:                │ │
│  │  photos, video,       │    │                               │ │
│  │  voice notes          │    │  Each section has items:      │ │
│  │                       │    │  • Go/No-Go (pass/fail)       │ │
│  │  AI analyzes and      │    │  • Measurement (with specs)   │ │
│  │  drafts documents     │    │  • Text entry (notes)         │ │
│  │  automatically        │    │                               │ │
│  │                       │    │  Progress tracked per item    │ │
│  │  Good for: ad-hoc     │    │  Technician assigned per      │ │
│  │  repairs, quick jobs  │    │  section                      │ │
│  │                       │    │                               │ │
│  │  sessionType:         │    │  Good for: scheduled          │ │
│  │  "capture"            │    │  overhauls, routine           │ │
│  │                       │    │  inspections                  │ │
│  │                       │    │                               │ │
│  │                       │    │  sessionType:                 │ │
│  │                       │    │  "inspection"                 │ │
│  └───────────────────────┘    └───────────────────────────────┘ │
│                                                                  │
│  Both types flow through the same pipeline:                      │
│  Captured → Drafting → Verified → Packaged → Completed          │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
aerovision-mvp/
│
├── app/                              ← All pages and API routes
│   ├── layout.tsx                    ← Root layout (fonts, global styles)
│   ├── login/                        ← Email/password login
│   ├── register/                     ← Account creation + org setup
│   ├── join-org/                     ← Join org with invite code
│   ├── glasses-demo/                 ← Smart glasses simulation (public)
│   ├── docs/                         ← User documentation (public)
│   │
│   ├── (dashboard)/                  ← Protected pages (sidebar + auth)
│   │   ├── layout.tsx                ← Sidebar, auth check, org name fetch
│   │   ├── jobs/                     ← Unified work orders + inspections
│   │   │   ├── page.tsx              ← Job list with filters
│   │   │   └── [id]/                 ← Job detail (routes to right workspace)
│   │   │       ├── page.tsx
│   │   │       ├── audit/            ← Audit trail
│   │   │       └── review/           ← Supervisor sign-off
│   │   ├── forms/                    ← Form management
│   │   ├── library/                  ← CMM template management
│   │   │   ├── page.tsx              ← Template list
│   │   │   └── [templateId]/review/  ← Template detail + approval
│   │   ├── technicians/              ← Team management
│   │   ├── settings/                 ← Org settings + AI instructions
│   │   ├── dashboard/                ← Fleet overview
│   │   ├── parts/[id]/               ← Component detail pages
│   │   ├── capture/                  ← Evidence capture workflow
│   │   └── analytics/                ← Fleet charts and metrics
│   │
│   └── api/                          ← Backend (89 API routes)
│       ├── auth/                     ← Login, register, password reset
│       ├── sessions/                 ← Capture session CRUD + processing
│       ├── jobs/                     ← Unified job endpoints
│       ├── inspect/                  ← CMM-guided inspection endpoints
│       ├── library/                  ← Template upload, extraction, approval
│       ├── mobile/                   ← iOS companion app endpoints
│       ├── components/               ← Component data operations
│       ├── documents/                ← PDF generation + download
│       ├── measurements/             ← Measurement CRUD
│       ├── measurement-specs/        ← Measurement specifications
│       ├── technicians/              ← Technician management
│       ├── org/                      ← Organization settings + documents
│       ├── exceptions/               ← Integrity engine scanning
│       └── ai/                       ← Direct AI endpoints
│
├── components/                       ← Reusable UI components
│   ├── layout/                       ← Sidebar, navigation
│   ├── ui/                           ← shadcn/ui primitives
│   ├── inspect/                      ← Inspection workspace components
│   ├── sessions/                     ← Session detail components
│   └── demo/                         ← Demo overlay components
│
├── lib/                              ← Shared logic
│   ├── ai/                           ← AI provider configs + fallback chains
│   │   ├── models.ts                 ← Provider definitions per task
│   │   └── pipeline-stages.ts        ← Session processing stages
│   ├── db.ts                         ← Prisma client singleton
│   ├── auth.ts                       ← NextAuth configuration
│   ├── api-url.ts                    ← basePath-aware URL helper
│   └── generated/prisma/             ← Auto-generated Prisma client
│
├── prisma/
│   ├── schema.prisma                 ← 39 models
│   ├── seed.ts                       ← Demo data
│   └── migrations/                   ← Database migrations
│
└── public/                           ← Static assets
```

---

## The Integrity Engine

Automated auditor that scans every component for data problems:

```
           "SCAN ALL"
               │
               ▼
  ┌────────────────────────┐
  │   For each component:  │
  │                        │
  │   Serial numbers       │──→  Match across all events?
  │   match?               │
  │                        │
  │   Part numbers         │──→  Same P/N in every record?
  │   consistent?          │
  │                        │
  │   Hours & cycles       │──→  Only go UP over time?
  │   make sense?          │     (going backwards = tampering?)
  │                        │
  │   Required docs        │──→  Birth cert? Release cert?
  │   present?             │     Work orders for all repairs?
  │                        │
  │   Dates logical?       │──→  Installed BEFORE manufactured?
  │                        │     That's a problem.
  │                        │
  │   Documents signed?    │──→  Unsigned 8130-3 = not airworthy
  │                        │
  └────────┬───────────────┘
           │
           ▼
  ┌────────────────────────┐
  │   FINDINGS             │
  │   CRITICAL   Missing birth certificate        │
  │   CRITICAL   Unauthorized modification        │
  │   WARNING    Documentation gap found          │
  │   WARNING    Life limit approaching           │
  │   INFO       Unsigned draft document          │
  └────────────────────────┘
```
