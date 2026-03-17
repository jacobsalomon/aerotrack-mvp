# AeroVision MVP — Architecture & Decisions

## What This Is

AeroVision is a product by The Mechanical Vision Corporation (MVC). A mechanic wearing smart glasses does their job — inspecting, overhauling, repairing aircraft parts — and the glasses observe what's happening through computer vision. The AI maps those observations to FAA/EASA form fields automatically. The mechanic reviews and signs. No narration, no extra steps.

This repo is the web MVP: a Next.js app that serves as the supervisor dashboard, document review system, and API backend for the iOS companion app. All app routes live under `app/aerovision/` to support the multi-zone basePath architecture.

**First client:** SilverWings, an MRO shop with 120 employees. Starting with measurement capture flowing into Quantum (their existing system).

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 (App Router) | SSR, API routes, Vercel deployment. Was briefly on 16, downgraded due to manifest bug. |
| Database | SQLite via Prisma 7 | Simple, local-first for MVP. Production uses Turso (hosted SQLite). |
| Styling | Tailwind 4 + shadcn/ui | Rapid UI development with accessible components. |
| AI | Multi-provider (OpenAI, Anthropic, Google) | Fallback chains for reliability. See `lib/ai/models.ts`. |
| PDF | pdf-lib v1.17.1 | Generates FAA forms (8130-3, 337, 8010-4). |
| Auth | NextAuth v5 beta + passcode gate | Simple auth for MVP demo access. |
| Monitoring | Sentry | Error tracking and performance. |
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

## Key Architectural Decisions

### Multi-Provider AI with Fallback Chains
Instead of depending on one AI provider, the system has ordered fallback chains per task type (defined in `lib/ai/models.ts`). If OpenAI's API is down, it falls through to Anthropic, then Google. No cached fallbacks — errors are shown honestly.

### Session-Based Capture Pipeline
Mobile capture sessions flow through stages: Captured -> Drafting -> Verified -> Packaged -> Completed. Background AI jobs process each stage asynchronously (`lib/session-processing-jobs.ts`, `lib/ai/pipeline-stages.ts`). The Reviewer Cockpit (`/aerovision-demo/sessions/[id]`) shows supervisors the AI verification results.

### Glasses Demo as Standalone Page
The glasses demo (`/aerovision-demo/glasses-demo`) is a self-contained 4-phase flow that simulates what the smart glasses see. It's separate from the main dashboard to keep the demo clean and focused. The HUD phase uses a dark green-on-black theme; the doc-review phase switches to the normal web app theme.

### Demo Component (Component 9)
A deterministic seed component (`demo-hpc7-overhaul`) exists specifically for demo walkthroughs. It has a complete lifecycle with 10 events and 3 generated documents. The glasses demo links directly to it.

### Shift-Based Measurement System
Shifts (`/aerovision-demo/shifts`) represent desk mic recording sessions where mechanics narrate measurements while working. The system transcribes audio, extracts measurements via AI, and reconciles them against specs. This is the SilverWings integration path.

## Prisma Notes

- Client generates to `lib/generated/prisma/` (configured in `prisma.config.ts`)
- SQLite dev database at `prisma/dev.db`
- 17 seeded components via `prisma/seed.ts`
- 3 migrations so far (init, analysis fields, background jobs)
- `npm run prisma:generate` runs automatically via `predev` and `postinstall` scripts
