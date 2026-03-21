# AeroVision MVP — Architecture & Decisions

## What This Is

AeroVision is a product by The Mechanical Vision Corporation (MVC). A mechanic wearing smart glasses does their job — inspecting, overhauling, repairing aircraft parts — and the glasses observe what's happening through computer vision. The AI maps those observations to FAA/EASA form fields automatically. The mechanic reviews and signs. No narration, no extra steps.

This repo is the web MVP: a Next.js app that serves as the supervisor dashboard, document review system, and API backend for the iOS companion app. All app routes live under `app/aerovision/` to support the multi-zone basePath architecture.

**First client:** SilverWings, an MRO shop with 120 employees. Starting with measurement capture flowing into Quantum (their existing system).

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 (App Router, Turbopack) | SSR, API routes, Vercel deployment. Staying on 15 — v16 causes rewrite loops in multi-zone setup. |
| Database | PostgreSQL via Prisma 7 + Neon | Serverless Postgres on Vercel. Uses `@prisma/adapter-neon` (HTTP transport). 39 models. |
| Styling | Tailwind 4 + shadcn/ui | Rapid UI development with accessible components. |
| AI | Multi-provider with fallback chains | GPT-5.4, Claude Sonnet 4.6, Gemini 2.5, ElevenLabs Scribe v2. See `lib/ai/models.ts`. |
| PDF | pdf-lib v1.17.1 + pdfjs-dist | Generates FAA forms (8130-3, 337, 8010-4). pdfjs for CMM PDF rendering. |
| Auth | NextAuth v5 beta + password auth | Email/password login with org-based multi-tenancy. |
| File Storage | Vercel Blob | Evidence uploads (photos, video, audio), CMM PDFs — up to 5TB. |
| Email | Resend | Transactional emails (password reset, invites). |
| Monitoring | (none — Sentry removed during infra debug) | Error tracking needs to be re-enabled. |
| Hosting | Vercel | Auto-deploy from GitHub. Part of multi-zone setup with gateway + seed deck. |

## Multi-Zone Architecture

This app lives behind `mechanicalvisioncorp.com` alongside two other Next.js projects:

- **Gateway** (`mvc-gateway`) — landing page, rewrites `/aerovision-demo/*` and `/pitch/*` to the other apps
- **AeroVision MVP** (this repo) — `basePath: /aerovision-demo`
- **Seed Deck** (`aerovision-seed-deck`) — `basePath: /pitch`

The `basePath` setup means:
- `next/image` is broken on Vercel (use `unoptimized: true`)
- Internal `fetch()` calls need the `lib/api-url.ts` helper
- Static assets need manual path prefixing via `NEXT_PUBLIC_BASE_PATH`

**Important:** All three MVC projects must stay on Next.js 15. Version 16 causes rewrite loops in this multi-zone setup.

## Key Architectural Decisions

### Multi-Provider AI with Fallback Chains
Instead of depending on one AI provider, the system has ordered fallback chains per task type (defined in `lib/ai/models.ts`):

| Task | Primary | Fallback 1 | Fallback 2 |
|------|---------|------------|------------|
| Audio Transcription | ElevenLabs Scribe v2 | GPT-4o | GPT-4o Mini |
| Photo OCR | GPT-5.4 | Gemini 2.5 Flash | Claude 4.6 |
| Video Analysis | Gemini 2.5 Pro | Gemini 2.5 Flash | — |
| Document Generation | GPT-5.4 | Claude 4.6 | Gemini 2.5 Pro |
| Document Verification | Claude 4.6 | GPT-5.4 | — |
| CMM Index (Pass 1) | Gemini 2.5 Flash | — | — |
| CMM Extraction (Pass 2) | Gemini 2.5 Pro | GPT-5.4 | Claude 4.6 |

No cached fallbacks — errors are shown honestly.

### Unified Jobs Workflow
Sessions and Inspections were originally separate features with their own pages (`/sessions` and `/inspect`). They've been merged into a single `/jobs` page that shows all work in one place. Each job has a `sessionType` — either `"capture"` (freeform) or `"inspection"` (CMM-guided) — and the detail page routes to the right workspace automatically.

Legacy routes (`/sessions`, `/inspect`) still exist in the codebase but are hidden from the sidebar navigation.

### CMM Template Extraction
Upload a CMM PDF (up to 500 pages), and a two-pass AI pipeline extracts structured inspection templates:
1. **Pass 1 (Index):** Gemini 2.5 Flash scans pages quickly to identify figure numbers, tables, and section boundaries
2. **Pass 2 (Extract):** Gemini 2.5 Pro extracts per-section inspection items — measurements with tolerances, go/no-go checks, text entries, and configuration-specific applicability

Templates go through a lifecycle: draft → processing → ready → approved. Once approved, they power guided inspection jobs.

### Session-Based Capture Pipeline
Mobile capture sessions flow through stages: Captured → Drafting → Verified → Packaged → Completed. Background AI jobs process each stage asynchronously (`lib/session-processing-jobs.ts`, `lib/ai/pipeline-stages.ts`). The job detail page shows supervisors the AI verification results.

### Organization-Based Multi-Tenancy
Every user belongs to an Organization. Data is scoped per-org: sessions, templates, measurements, technicians, and documents are all org-specific. Orgs have invite codes (like `SLVR-8K2M`) for onboarding new team members.

Organizations can set custom AI Agent Instructions in Settings — markdown-formatted guidelines that get injected into every AI prompt. This lets each shop customize how the AI handles their specific procedures.

### Glasses Demo as Standalone Page
The glasses demo (`/glasses-demo`) is a self-contained 4-phase flow that simulates what the smart glasses see. It's separate from the main dashboard to keep the demo clean and focused. The HUD phase uses a dark green-on-black theme; the doc-review phase switches to the normal web app theme.

### Demo Component (Component 9)
A deterministic seed component (`demo-hpc7-overhaul`) exists specifically for demo walkthroughs. It has a complete lifecycle with 10 events and 3 generated documents. The glasses demo links directly to it.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection (pooled) |
| `DATABASE_URL_UNPOOLED` | Direct connection for migrations |
| `NEXTAUTH_SECRET` | Session encryption key |
| `OPENAI_API_KEY` | GPT-5.4, GPT-4o (OCR, doc gen, transcription fallback) |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.6 (doc gen, verification) |
| `GOOGLE_AI_API_KEY` | Gemini 2.5 (video analysis, CMM extraction) |
| `OPENROUTER_API_KEY` | Claude fallback via OpenRouter |
| `ELEVENLABS_API_KEY` | Scribe v2 (primary audio transcription) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage access |
| `NEXT_PUBLIC_BASE_PATH` | `/aerovision-demo` (for multi-zone routing) |
| `RESEND_API_KEY` | Transactional email |

## Prisma Notes

- Client generates to `lib/generated/prisma/` (configured in `prisma.config.ts`)
- Production: Neon Postgres (pooled connection via `@prisma/adapter-neon` HTTP transport)
- Dev: Connect to Neon dev branch or local Postgres via `DATABASE_URL`
- 39 models across auth, components, sessions, templates, measurements, and integrity
- `npm run prisma:generate` runs automatically via `predev` and `postinstall` scripts
- Migrations require `DATABASE_URL_UNPOOLED` (direct, non-pooled connection)
- **Never do unnecessary schema migrations** — a String→Json + model rename previously cost 24+ hours and broke production

## Mobile API

The iOS companion app communicates via endpoints under `/api/mobile/`:
- `POST /api/mobile/auth` — API key authentication
- `POST /api/mobile/sessions` — Create capture sessions
- `POST /api/mobile/evidence/upload` — Upload photos, video, audio chunks
- `POST /api/mobile/transcribe` — Audio transcription
- `POST /api/mobile/analyze-image` — Photo analysis
- `POST /api/mobile/analyze-session` — Full session analysis
- `POST /api/mobile/annotate-video` — Video annotation with timestamps
- `POST /api/mobile/generate` — Generate compliance documents
- `POST /api/mobile/verify-documents` — Document verification

Evidence files are uploaded to Vercel Blob via client-side upload, then the callback URL is stored in the database.
