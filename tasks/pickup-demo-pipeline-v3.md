# Pickup Prompt: AeroVision Demo Pipeline + Evidence Chain (Session 3)

## Session Date
March 6, 2026 (America/Denver)

## Goal
Continue execution of:
- `tasks/prd-demo-pipeline-evidence-chain.md`

Proceed in PRD order from **US-004** onward.

---

## What Was Completed This Session

### US-002: Session Analysis Endpoint (COMPLETE)
`app/api/mobile/analyze-session/route.ts` was fully rewritten to match the PRD behavior:
- Accepts `{ sessionId }`
- Loads all evidence types (video/audio/photos)
- Runs modality processing in parallel
- Uses fallback-aware services:
  - Video: `analyzeSessionVideo()`
  - Audio: `transcribeAudio()`
  - Photo OCR: `analyzeImageWithFallback()`
- Handles partial failures (returns success with available modalities)
- Uses cached session-analysis fallback only if all modalities fail
- Stores fused `SessionAnalysis` fields:
  - `actionLog`, `partsIdentified`, `procedureSteps`, `anomalies`
  - `audioTranscript`, `photoExtractions`, `modelsUsed`
- Updates status to `analysis_complete`
- Returns fused payload expected by mobile
- Surfaces evidence conflicts explicitly (adds discrepancy-like anomaly entries)

### US-003: Document Generation with Multi-Source Fusion (IMPLEMENTED)
Changes were made in both generation prompt contract and persistence path:

#### `lib/ai/openai.ts`
- `DocumentGenerationResult` expanded with:
  - per-document `provenance`
  - per-document `discrepancies`
  - top-level `discrepancies`
- Generation prompt upgraded with explicit multi-source fusion rules:
  - use all sources, raise confidence on corroboration
  - do not silently resolve conflicts
  - emit discrepancy records for conflicts
  - source authority instructions (video/audio/photo)
- Output schema updated to request provenance arrays and discrepancy objects.

#### `app/api/mobile/generate/route.ts`
- `maxDuration` increased to `120`
- Existing-doc response now parses and returns `provenanceJson`
- Prefers `session.analysis.audioTranscript` when available
- Persists `provenanceJson` on each `DocumentGeneration2` record
- Keeps legacy `evidenceLineage` for backward compatibility
- Returns top-level `discrepancies` to mobile
- Session status now set to `documents_generated`

---

## Validation Status
After these changes:
- `npm run build` ✅ passed
- `npm run lint` ✅ passed

Do **not** re-debug build/lint unless regression occurs.

---

## Files Edited This Session
- `app/api/mobile/analyze-session/route.ts` (US-002 full rewrite)
- `app/api/mobile/generate/route.ts` (US-003 persistence/response updates)
- `lib/ai/openai.ts` (US-003 generation output contract + prompt rules)

Note: Repo is a dirty working tree with other pre-existing modifications. Do not revert unrelated files.

---

## Next Steps (Start Here)
1. Implement **US-004** in PRD order:
   - Primary files:
     - `lib/ai/verify.ts`
     - `app/api/mobile/verify-documents/route.ts`
   - Ensure verification output includes:
     - overall pass/fail
     - per-document issues
     - discrepancy confirmation/resolution status
     - cross-document consistency score
     - verification model used
   - Store verification linked to session/documents and update session status to `verified`.

2. Run validation:
   - `npm run build`
   - `npm run lint`

3. Continue to next PRD stories (US-006+).

---

## Constraints to Preserve
- Keep multi-source fusion intact (video + audio + photo)
- Conflicts must be surfaced, not silently resolved
- Keep plain-language explanations for non-technical audience
- Do not remove `serverExternalPackages`
- Do not revert unrelated working tree changes
