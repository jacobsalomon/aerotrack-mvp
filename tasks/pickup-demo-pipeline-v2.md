# Pickup Prompt: AeroVision Demo Pipeline + Evidence Chain (Session 2)

## What This Is
Continuing the build of the end-to-end AI pipeline and Evidence Chain Visualization for a live demo to a HEICO repair station GM on **March 9, 2026**.

## The PRD
Full PRD is at: `tasks/prd-demo-pipeline-evidence-chain.md`
10 user stories (US-001 through US-010). Read it first.

## What's Done

### US-001: AI Service Layer (COMPLETE)
All four AI library files updated to use `callWithFallback()` from `lib/ai/provider.ts`:
- **`lib/ai/gemini.ts`** — `annotateVideoChunk()` uses `ANNOTATION_MODELS` chain, `analyzeSessionVideo()` uses `VIDEO_MODELS` chain. Both return `modelUsed`.
- **`lib/ai/openai.ts`** — `transcribeAudio()` uses `TRANSCRIPTION_MODELS` chain, `generateDocuments()` uses `GENERATION_MODELS` chain (routes to OpenAI/Anthropic/Google based on provider). Returns `modelUsed`.
- **`lib/ai/verify.ts`** — Calls Anthropic directly (removed OpenRouter dependency), uses `VERIFICATION_MODELS` chain (Claude Sonnet 4.6 → GPT-5.4).
- **`lib/ai/pipeline.ts`** — Uses `modelUsed` from analysis result instead of hardcoded env var.

### US-005: Cached Fallback Data (COMPLETE)
Created `lib/ai/cached-responses/` with:
- `session-analysis.json` — Realistic HPC-7 overhaul: 11 timestamped actions, 3 parts, 6 procedure steps, audio transcript, 4 photo extractions
- `generated-documents.json` — Complete 8130-3, Form 337, 8010-4 with multi-source provenance metadata. **Planted discrepancy:** transposed part number (1089→1098 in 8010-4)
- `verification-result.json` — Catches the planted discrepancy as critical issue
- `index.ts` — Barrel export for all cached responses

### Schema Changes (APPLIED)
Added to `prisma/schema.prisma` and pushed with `prisma db push`:
- **SessionAnalysis** — Added `audioTranscript` (String?), `photoExtractions` (String? JSON), `modelsUsed` (String? JSON)
- **DocumentGeneration2** — Added `provenanceJson` (String? for multi-source provenance)

### US-002: Session Analysis Endpoint (IN PROGRESS — 90% DONE)
The rewrite of `app/api/mobile/analyze-session/route.ts` is **written but NOT saved to disk yet** due to a tool permission issue. The new version:
- Processes ALL evidence types in parallel (video + audio + photos) using `Promise.all`
- Video → Gemini via `analyzeSessionVideo()` with fallback chain
- Audio → Each chunk transcribed via `transcribeAudio()` with fallback, then stitched with timestamps
- Photos → Each photo OCR'd via new `extractFromPhoto()` helper using `OCR_MODELS` chain
- Partial failure handling: if one modality fails, others continue
- If ALL modalities fail, uses `cachedSessionAnalysis` from US-005
- Saves fused results to `SessionAnalysis` with new fields (audioTranscript, photoExtractions, modelsUsed)
- Updates session status to `analysis_complete`

**TO FINISH US-002:**
1. Write the new `app/api/mobile/analyze-session/route.ts` — the full replacement code is in this pickup prompt below
2. Run `npm run build && npm run lint`

### What's NOT Started
- US-003: Document generation with multi-source provenance
- US-004: Document verification endpoint upgrade
- US-006: Evidence chain data model and API (`GET /api/documents/[id]/provenance`)
- US-007: Evidence chain UI component (`components/evidence-chain-drawer.tsx`)
- US-008: Integrate evidence chain into parts detail page
- US-009: Live session viewer (`/sessions` and `/sessions/[id]` pages)
- US-010: Seeded backup evidence chain for Component 9

## Execution Order (from PRD)
| Day | Stories | Focus |
|-----|---------|-------|
| Day 1 | US-001, US-005 | AI service layer + cached safety net — **DONE** |
| Day 2 | US-002, US-003, US-004 | Three backend endpoints — the live AI pipeline |
| Day 3 | US-006, US-007, US-009 | Evidence chain data model + UI component + session viewer |
| Day 4 | US-008, US-010 + rehearsal | Integration into parts page + backup seed data + full demo rehearsal |

## Critical Architecture

### Files Created/Modified This Session
```
lib/ai/models.ts          — Model registry (created last session)
lib/ai/provider.ts         — callWithFallback + callGemini/callOpenAI/callAnthropic (created last session)
lib/ai/gemini.ts           — MODIFIED: uses callWithFallback with VIDEO_MODELS/ANNOTATION_MODELS
lib/ai/openai.ts           — MODIFIED: uses callWithFallback with TRANSCRIPTION_MODELS/GENERATION_MODELS
lib/ai/verify.ts           — MODIFIED: direct Anthropic calls, VERIFICATION_MODELS chain
lib/ai/pipeline.ts         — MODIFIED: uses analysis.modelUsed
lib/ai/cached-responses/   — NEW: session-analysis.json, generated-documents.json, verification-result.json, index.ts
prisma/schema.prisma       — MODIFIED: added audioTranscript, photoExtractions, modelsUsed to SessionAnalysis; provenanceJson to DocumentGeneration2
```

### Multi-Source Evidence Fusion (Critical Pattern)
- Video analysis: timestamped actions, parts, measurements, conditions
- Audio transcription: part numbers, mechanic judgments, CMM references
- Photo OCR: data plate text, gauge readings, precise measurements
- When sources agree = higher confidence (corroboration)
- When sources conflict = DISCREPANCY flagged, not silently resolved

### Provenance Structure (for US-003)
Every document field gets a `provenance` array with ALL contributing sources:
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

## The US-002 analyze-session Code to Save

The complete replacement for `app/api/mobile/analyze-session/route.ts` is below. **Just write this file, then build+lint.**

Key changes from the old version:
- `maxDuration` increased from 60 to 120
- Loads ALL evidence types (removed the `where: { type: "VIDEO" }` filter)
- Splits evidence into video/audio/photo arrays
- Runs all three in parallel with `Promise.all`
- New `extractFromPhoto()` helper for photo OCR with fallback chain
- Cached fallback if all modalities fail
- Saves audioTranscript, photoExtractions, modelsUsed to SessionAnalysis
- Status updates to `analysis_complete` instead of leaving it in `processing`

## Environment / Build Notes
- **Prisma `effect` module corruption**: The `@prisma/config/node_modules/effect` package gets corrupted on `npm install`. Fix: `rm -rf node_modules/@prisma/config/node_modules/effect && npm install`
- **std-env missing**: Same root cause. After reinstall, verify: `ls node_modules/std-env/dist/index.cjs`
- `npm run build` passed after US-001+US-005 changes
- `npm run lint` passed clean
- `npx prisma db push` and `npx prisma generate` completed successfully after fixing effect module
- `serverExternalPackages` in next.config.ts includes @anthropic-ai/sdk, Prisma, pdf-lib — DON'T REMOVE

## Critical Rules
- Jake is non-technical — explain in plain language
- NEVER say the glasses require narration — they OBSERVE, mechanic just works
- Demo audience: GM at a HEICO repair station (technical, knows real maintenance)
- Multi-source fusion: video + audio + photo all contribute, conflicts = discrepancy
- `npm run build && npm run lint` must pass for every story
- Read the PRD at `tasks/prd-demo-pipeline-evidence-chain.md` for full acceptance criteria
- This project's CLAUDE.md points to `.specify/memory/constitution.md` — read that too
