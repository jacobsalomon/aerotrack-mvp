# AeroVision MVP

**AI-powered documentation for aerospace maintenance.**

A mechanic wearing smart glasses does their job — inspecting, overhauling, repairing aircraft parts — and the glasses observe what's happening through computer vision. The AI maps those observations to FAA/EASA form fields automatically. The mechanic reviews and signs. No narration, no extra steps.

This repo is the web MVP: supervisor dashboard, document review system, CMM template library, and API backend for the iOS companion app and Mentra smart glasses miniapp.

Built by [The Mechanical Vision Corporation](https://mechanicalvisioncorp.com).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5.9 |
| Database | PostgreSQL (Neon) via Prisma 7 + `@prisma/adapter-neon` |
| Styling | Tailwind CSS 4 + shadcn/ui |
| AI | Multi-provider: GPT-5.4, Claude Sonnet 4.6, Gemini 2.5, ElevenLabs Scribe v2 |
| PDF | pdf-lib (form generation) + pdfjs-dist (CMM rendering) |
| Auth | NextAuth v5 (email/password + OAuth) |
| File Storage | Vercel Blob |
| Email | Resend |
| Charts | Recharts |
| Icons | Lucide React |
| QR Codes | qrcode.react |

---

## Getting Started

### Prerequisites

- **Node.js** 20.x (`>=20 <21` — pinned to avoid Vercel compatibility issues)
- **npm** (comes with Node.js)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/jacobsalomon/aerovision-mvp.git
cd aerovision-mvp

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Fill in DATABASE_URL (Neon Postgres connection string) and API keys

# 4. Generate the Prisma client
npx prisma generate

# 5. Push schema and seed the database with demo data
npx prisma db push
npx prisma db seed

# 6. Start the dev server
npm run dev
```

Open **http://localhost:3000/aerovision** — you should see the AeroVision dashboard.

> **Note:** This app uses `basePath: /aerovision` as part of the MVC multi-zone architecture. All routes are served under this prefix. The first page load after starting the dev server takes ~10 seconds to compile (Tailwind 4 behavior). Subsequent loads are instant.

---

## Key Features

| Feature | Path | Description |
|---------|------|-------------|
| **Jobs** | `/jobs` | Unified work list — capture sessions and CMM-guided inspections in one place |
| **Job Workspace** | `/jobs/[id]` | Live inspection workspace with evidence feed, measurement tracking, and progress |
| **Template Library** | `/library` | Upload CMM PDFs, AI extracts structured inspection templates (two-pass pipeline) |
| **Template Review** | `/library/[id]` | Review and approve extracted inspection items section by section |
| **Dashboard** | `/dashboard` | Fleet overview with component status, alerts, and metrics |
| **Analytics** | `/analytics` | Charts and metrics for component health across the fleet |
| **Integrity** | `/integrity` | Exception and anomaly tracking |
| **Glasses Demo** | `/glasses-demo` | Full AR glasses simulation — 4 phases from HUD to document review |
| **Demo Walkthrough** | `/demo` | Interactive step-by-step walkthrough of the digital thread concept |

---

## Project Structure

```
aerovision-mvp/
├── app/
│   ├── (dashboard)/                # Main app (sidebar layout)
│   │   ├── jobs/                   # Unified jobs list & detail
│   │   ├── jobs/[id]/              # Job workspace (inspection or capture)
│   │   ├── jobs/[id]/review/       # Supervisor review
│   │   ├── jobs/[id]/audit/        # Full audit trail
│   │   ├── library/                # CMM template management
│   │   ├── library/[templateId]/   # Template detail & review
│   │   ├── technicians/            # Team management
│   │   ├── settings/               # Org settings (AI instructions)
│   │   ├── dashboard/              # Fleet overview
│   │   ├── analytics/              # Charts & metrics
│   │   ├── integrity/              # Exceptions & alerts
│   │   ├── capture/                # Evidence capture UI
│   │   └── demo/                   # Interactive walkthrough
│   ├── glasses-demo/               # AR glasses simulation (standalone)
│   ├── api/                        # 91+ API routes
│   │   ├── jobs/                   # Job detail
│   │   ├── inspect/sessions/       # Inspection session endpoints
│   │   ├── library/                # CMM template endpoints
│   │   ├── glasses/                # Pairing & connection
│   │   ├── mobile/                 # iOS & Mentra companion API
│   │   ├── measurements/           # Measurement ledger
│   │   ├── documents/              # Form rendering & signing
│   │   └── auth/                   # NextAuth routes
│   ├── auth/                       # Auth pages
│   ├── login/                      # Email/password login
│   ├── register/                   # Sign up + org creation
│   └── join-org/                   # Join with invite code
├── components/                     # 79 React components
│   ├── ui/                         # shadcn/ui base components
│   ├── inspect/                    # Inspection workspace components
│   ├── library/                    # Template review components
│   ├── documents/                  # FAA form renderers
│   └── layout/                     # Sidebar, headers
├── lib/                            # Utilities & services
│   ├── ai/                         # Multi-provider AI (21 files)
│   ├── inspect/                    # Inspection helpers
│   ├── auth.ts                     # NextAuth config
│   ├── db.ts                       # Prisma singleton
│   └── ...                         # 50+ utility files
├── prisma/
│   ├── schema.prisma               # 39 models
│   └── seed.ts                     # Demo data
├── next.config.ts                  # basePath: /aerovision, Turbopack
├── vercel.json                     # Cron: retry-stuck extractions
└── package.json
```

---

## Environment Variables

See [`.env.example`](.env.example) for all required variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection (pooled) |
| `DATABASE_URL_UNPOOLED` | Migrations | Direct connection for `prisma migrate` |
| `NEXTAUTH_SECRET` | Yes | Session encryption key |
| `OPENAI_API_KEY` | For AI | GPT-5.4, GPT-4o (OCR, doc gen, transcription fallback) |
| `ANTHROPIC_API_KEY` | For AI | Claude Sonnet 4.6 (doc gen, verification) |
| `GOOGLE_AI_API_KEY` | For AI | Gemini 2.5 (video analysis, CMM extraction) |
| `ELEVENLABS_API_KEY` | For AI | Scribe v2 (primary transcription) |
| `OPENROUTER_API_KEY` | For AI | Claude fallback via OpenRouter |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob storage |
| `RESEND_API_KEY` | For email | Transactional email |
| `NEXT_PUBLIC_BASE_PATH` | Yes | `/aerovision` (for multi-zone routing) |

---

## Scripts

| Command | What It Does |
|---------|-------------|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npx prisma db seed` | Seed the database with demo data |
| `npx prisma studio` | Open the database GUI |

---

## Deployment

Deploys to **Vercel** with **Neon Postgres** as the cloud database. Part of a multi-zone setup at `mechanicalvisioncorp.com`:

- **Gateway** (`mvc-gateway`) — landing page at root, rewrites `/aerovision/*` and `/pitch/*`
- **AeroVision MVP** (this repo) — `basePath: /aerovision`
- **Seed Deck** (`aerovision-seed-deck`) — `basePath: /pitch`

All three auto-deploy from `main` via GitHub. Node.js is pinned to 20.x.

---

## License

Private. All rights reserved.
