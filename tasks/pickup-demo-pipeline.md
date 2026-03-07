# Pickup Prompt: AeroVision Demo Pipeline + Evidence Chain

## What This Is
Building the end-to-end AI pipeline and Evidence Chain Visualization for a live demo to a HEICO repair station GM on **March 9, 2026** (4 days from task start on March 5).

## The PRD
Full PRD is at: `tasks/prd-demo-pipeline-evidence-chain.md`
10 user stories (US-001 through US-010). Read it first.

## What's Done

### US-001: AI Service Layer (PARTIALLY COMPLETE)
- **Created** `lib/ai/models.ts` — centralized model registry with current models:
  - Video: Gemini 3.1 Pro Preview → 3.1 Flash → 2.5 Flash
  - Transcription: gpt-4o-transcribe → gpt-4o-mini-transcribe
  - OCR: GPT-5.4 → GPT-4o → Gemini 3.1 Flash
  - Generation: GPT-5.4 → Claude Sonnet 4.6 → Gemini 3.1 Pro
  - Verification: Claude Sonnet 4.6 → GPT-5.4
- **Created** `lib/ai/provider.ts` — generic `callWithFallback()` utility + provider-specific helpers (`callGemini()`, `callOpenAI()`, `callAnthropic()`)
- **NOT done yet:** Update existing `lib/ai/gemini.ts`, `lib/ai/openai.ts`, `lib/ai/pipeline.ts`, `lib/ai/verify.ts` to USE the new fallback chains instead of direct API calls. These files still reference old models (Gemini 2.0/2.5 Flash, GPT-4o).

### What's NOT Started
- US-002 through US-010 — all pending

## Execution Order (from PRD)
| Day | Stories | Focus |
|-----|---------|-------|
| Day 1 | US-001, US-005 | AI service layer with fallback chains + cached safety net |
| Day 2 | US-002, US-003, US-004 | Three backend endpoints — the live AI pipeline |
| Day 3 | US-006, US-007, US-009 | Evidence chain data model + UI component + session viewer |
| Day 4 | US-008, US-010 + rehearsal | Integration into parts page + backup seed data + full demo rehearsal |

## Key Architecture Decisions

### Multi-Source Evidence Fusion
The AI doesn't just use audio OR video OR photos — it fuses ALL THREE:
- Video analysis captures: actions performed, data plates visible, gauge readings, tools, conditions
- Audio transcription captures: part numbers, measurements, judgments, CMM references
- Photo OCR captures: data plate text, gauge readings, conditions
- Document generation takes all three and produces FAA forms
- When sources agree = higher confidence (triple corroboration)
- When sources conflict = DISCREPANCY flagged (don't silently pick one)

### Provenance Structure
Every document field gets a `provenance` array showing all evidence sources:
```json
{
  "fieldName": "block7_bore_measurement",
  "value": "Bore diameter measured at 2.4985 in.",
  "provenance": [
    { "sourceType": "audio", "evidenceId": "ev_123", "timestamp": 142.5, "excerpt": "bore reads 2.4985 inches", "confidence": 0.95 },
    { "sourceType": "video", "evidenceId": "ev_456", "timestamp": 140.0, "excerpt": "gauge display showing 2.498", "confidence": 0.88 },
    { "sourceType": "photo", "evidenceId": "ev_789", "excerpt": "caliper display reading 2.4985", "confidence": 0.97 }
  ],
  "overallConfidence": 0.97,
  "corroborationLevel": "triple"
}
```

### CMM is Optional
The system works without a CMM file. The AI uses general aerospace knowledge and picks up CMM references the mechanic mentions verbally.

### Demo is LIVE, Not Seeded
Primary demo flow: Jake captures on his phone (brake caliper with printed Parker data plate) → AI processes video+audio+photos → documents appear on web dashboard → click any field → see evidence chain with real photos, real audio transcripts, real video analysis. US-010 (seeded data) is backup only.

## Existing Codebase (Important Context)

### Prisma Models Already Exist
- `CaptureSession` — mobile capture sessions with status tracking
- `CaptureEvidence` — photos/video/audio chunks with AI extraction fields
- `VideoAnnotation` — timestamped tags from video analysis
- `SessionAnalysis` — deep analysis results (actionLog, partsIdentified, procedureSteps, anomalies)
- `DocumentGeneration2` — generated compliance docs with confidence, lowConfidenceFields, evidenceLineage, verificationJson
- `ComponentManual` — CMM PDFs linked to part numbers
- `AuditLogEntry` — immutable audit trail

### API Routes Already Exist at `app/api/mobile/`
- `/auth` — technician API key login
- `/sessions` — CRUD for capture sessions
- `/evidence` — upload evidence
- `/generate` — document generation (needs upgrade)
- `/analyze-session` — video analysis (needs upgrade)
- `/analyze-image` — photo OCR (needs upgrade)
- `/annotate-video` — video chunk tagging (needs upgrade)
- `/transcribe` — audio transcription (needs upgrade)
- `/verify-documents` — AI verification (needs upgrade)

### AI Library Files at `lib/ai/`
- `gemini.ts` — Gemini File API upload + video annotation + deep analysis (uses OLD models)
- `openai.ts` — transcription + document generation (uses OLD models, has `evidenceLineage` support already!)
- `pipeline.ts` — orchestrates full post-session processing (stitch transcripts → video analysis → doc gen)
- `verify.ts` — Claude Sonnet verification via OpenRouter
- `utils.ts` — confidence clamping
- `models.ts` — **NEW** model registry (created this session)
- `provider.ts` — **NEW** fallback chain utility (created this session)

### Environment Variables (.env.local)
All API keys are set: GOOGLE_AI_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, BLOB_READ_WRITE_TOKEN
Model selection vars exist but point to OLD models — need updating.

### Key Config
- `serverExternalPackages` in next.config.ts includes @anthropic-ai/sdk, Prisma, pdf-lib — DON'T REMOVE
- basePath: "/aerovision-demo"
- SQLite database at prisma/dev.db
- Seed data in prisma/seed.ts (1,500+ lines) — ADD to it, don't rewrite

## What to Build Next

### Immediate (US-001 completion):
1. Update `lib/ai/gemini.ts` to use `callWithFallback()` from provider.ts with VIDEO_MODELS and ANNOTATION_MODELS
2. Update `lib/ai/openai.ts` to use `callWithFallback()` with TRANSCRIPTION_MODELS, OCR_MODELS, GENERATION_MODELS
3. Update `lib/ai/verify.ts` to use `callWithFallback()` with VERIFICATION_MODELS (call Anthropic directly instead of via OpenRouter)
4. Update `lib/ai/pipeline.ts` to handle partial failures gracefully
5. Update .env.local model variables

### Then US-005 (cached fallbacks):
Create `lib/ai/cached-responses/` with session-analysis.json, generated-documents.json, verification-result.json

### Then US-003 (the big one — provenance):
Update the document generation prompt to request multi-source provenance. The existing `evidenceLineage` field in `openai.ts` is a start but needs to support MULTIPLE sources per field, not just one.

### Then US-006-009 (evidence chain UI):
- Add `provenanceJson` to DocumentGeneration2 model if not already there
- Create GET /api/documents/[id]/provenance endpoint
- Build `components/evidence-chain-drawer.tsx` (shadcn Sheet component)
- Build `/sessions` page and `/sessions/[id]` page on web dashboard
- Integrate clickable fields into parts detail page

## Critical Rules
- Jake is non-technical — explain in plain language
- NEVER say the glasses require narration — they OBSERVE, mechanic just works
- Demo audience: GM at a HEICO repair station (technical, knows real maintenance)
- Multi-source fusion: video + audio + photo all capture everything, conflicts = discrepancy
- Use CLAUDE.md Ralph Loop for complex tasks
- `npm run build && npm run lint` must pass for every story
