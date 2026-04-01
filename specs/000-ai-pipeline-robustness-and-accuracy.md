# 000: AI Pipeline Robustness and Accuracy Hardening

## Status: COMPLETE

## Overview

Harden AeroVision's AI pipeline so capture evidence is processed deterministically, late evidence is not silently omitted from generated documents, and the client/server responsibilities are consistent.

This spec comes from the April 1, 2026 end-to-end investigation of the active AeroVision MVP web repo and companion clients.

## Existing Fixes To Preserve

The current working tree already includes these confirmed fixes:

- Preserve transcription fallback metadata in `lib/ai/openai.ts`
- Use the incremented retry attempt count in `lib/session-processing-jobs.ts`
- Parse valid zero GPS coordinates in `app/api/mobile/evidence/route.ts`
- Link auto-analyzed photos back to matched components in `app/api/mobile/evidence/route.ts`

Do not revert or regress them.

## What To Build

### 1. Explicit Evidence Analysis State

Make evidence analysis status explicit for the mobile capture pipeline.

Requirements:

- Every evidence item registered through `POST /api/mobile/evidence` must end up in a terminal per-evidence analysis state for its AI work:
  - `completed`
  - `failed`
  - `skipped`
- Track enough metadata to distinguish "not done yet" from "done but empty" and "done but failed".
- Reuse existing schema if possible. Avoid Prisma schema changes unless they are clearly necessary.
- Preserve the actual OCR payloads and transcript data already used elsewhere in the app.

### 2. Gate Session Processing On Evidence Readiness

Do not let a non-inspection capture session draft documents from partially analyzed evidence.

Requirements:

- Session processing must not advance into drafting until evidence captured before the session completion cutoff is in a terminal analysis state.
- If evidence is still pending analysis, processing should pause/retry rather than fail the whole job.
- Packaging and verification should operate on the same evidence snapshot the drafting stage used.

### 3. Handle Late Evidence Deterministically

Late evidence is expected because uploads can complete after the mechanic ends the session or after the app reconnects.

Requirements:

- Registering new evidence for a non-inspection capture session after capture has ended must invalidate stale downstream pipeline results as needed and requeue processing.
- The regenerated output must include the late evidence.
- Avoid duplicate processing loops and keep the existing lease-based job model intact.

### 4. Make The Backend The Authoritative Post-Upload Processor

The backend now auto-processes evidence registration, but the iOS client still triggers separate AI endpoints after upload.

Requirements:

- Remove automatic post-upload `analyze-image`, `annotate-video`, and `transcribe` calls from the iOS upload path and queued upload recovery path.
- Keep the manual/mobile endpoints available for explicit use elsewhere if they are still needed.
- Update comments so the client code reflects the actual architecture.

### 5. Defer CMM Pass 2 Retries Across Invocations

Pass 2 page failures currently burn retries immediately inside a single cron tick.

Requirements:

- A failed Pass 2 page attempt should be retried on a later cron invocation, not immediately in the same `processSection()` loop.
- Preserve the existing page-level resumability and section-level lease model.
- Keep the "skip after max retries" behavior, but only after genuinely separate attempts.

### 6. Validation

Add tests for the most failure-prone logic added in this spec.

Minimum expectations:

- Cover the new evidence readiness / requeue behavior with unit tests where practical
- Cover the deferred Pass 2 retry behavior with unit tests where practical
- Run:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

## Acceptance Criteria

- Non-inspection sessions do not draft documents while required evidence AI work is still pending.
- Late evidence can trigger the session pipeline to regenerate stale downstream output.
- The iOS app no longer automatically duplicates backend post-upload AI work.
- Pass 2 page retries are deferred across invocations instead of being consumed in one tight loop.
- Existing working-tree fixes remain intact.
- Local validation passes with no new lint errors.
