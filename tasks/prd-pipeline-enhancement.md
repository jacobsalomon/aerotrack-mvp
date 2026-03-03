# PRD: Capture-to-Documents Pipeline Enhancement

## Overview
The AeroVision capture pipeline collects rich evidence (photos, video, audio) and runs multi-model AI analysis, but the generated FAA documents don't fully leverage this data. This PRD addresses three key gaps: (1) ensuring all AI analysis flows into every document generation path, (2) adding field-level evidence citations so reviewers can trace every claim back to its source, and (3) making flagged fields editable so reviewers can correct uncertain data before approving.

## Goals
- Every document generation path (mobile generate, web create-document, standalone AI routes) includes session analysis data when available
- Each generated document field cites which evidence it came from (photo, video analysis, transcript) with a confidence score
- Reviewers on the web dashboard can edit low-confidence or incorrect fields inline, save changes, and trigger re-verification
- Verification results display as structured, human-readable cards (not raw JSON)

## Quality Gates

These commands must pass for every user story:
- `npx tsc --noEmit` — TypeScript type checking (0 errors in touched files)
- `npx eslint` — ESLint (0 errors in touched files)
- `npx jest --passWithNoTests` — Existing test suite passes

For UI stories, also include:
- Verify in browser against a session with documents (dev server at localhost:3000)

## User Stories

### US-001: Enhance GPT-4o generation prompt to explicitly use session analysis
**Description:** As the system, I want the document generation prompt to explicitly instruct GPT-4o to use actionLog, procedureSteps, and anomalies data so that generated documents reflect the full AI analysis.

**Acceptance Criteria:**
- [ ] `generateDocuments()` in `lib/ai/openai.ts` receives video annotations as a separate field alongside videoAnalysis
- [ ] The GPT-4o system prompt explicitly instructs: "Use the ACTION LOG to populate work-performed sections", "Use PROCEDURE STEPS to verify CMM compliance in remarks", "Use ANOMALIES to flag defects or non-conformances in the appropriate document fields"
- [ ] The GPT-4o prompt includes video annotations (timestamped tags) as a new `VIDEO ANNOTATIONS` section in the user message
- [ ] The mobile generate route (`app/api/mobile/generate/route.ts`) passes `videoAnnotations` from evidence records into `generateDocuments()`
- [ ] The web create-document route (`app/api/sessions/[id]/create-document/route.ts`) also passes video annotations

### US-002: Update standalone web AI routes to accept session context
**Description:** As a web dashboard user, I want the standalone "Generate 8130-3" and "Generate Work Order" routes to use session analysis when available, so manually triggered generation is as informed as the mobile flow.

**Acceptance Criteria:**
- [ ] `app/api/ai/generate-8130/route.ts` accepts an optional `sessionId` in the request body
- [ ] When `sessionId` is provided, the route loads session analysis, evidence extractions, and audio transcript from the database and includes them in the prompt
- [ ] `app/api/ai/generate-workorder/route.ts` receives the same treatment
- [ ] Both routes fall back to body-only data when no `sessionId` is provided (backwards compatible)

### US-003: Add evidence lineage to document generation output
**Description:** As a reviewer, I want each document field to cite which evidence it came from so I can verify claims against source material.

**Acceptance Criteria:**
- [ ] The GPT-4o prompt in `generateDocuments()` instructs the model to return an `evidenceLineage` object alongside each document's `contentJson`
- [ ] `evidenceLineage` maps field names to `{ source: "photo_extraction" | "video_analysis" | "audio_transcript" | "cmm_reference" | "ai_inferred", detail: string, confidence: number }`
- [ ] The `DocumentGenerationResult` type in `lib/ai/openai.ts` includes `evidenceLineage` per document
- [ ] The mobile generate route stores `evidenceLineage` in a new column or in `contentJson` alongside field data
- [ ] The web create-document route does the same

### US-004: Add evidenceLineage column to DocumentGeneration2 schema
**Description:** As the system, I want to persist evidence lineage separately from content so it can be displayed and queried independently.

**Acceptance Criteria:**
- [ ] Add `evidenceLineage String?` column to `DocumentGeneration2` in `prisma/schema.prisma` (JSON string, nullable for backwards compatibility)
- [ ] Run `npx prisma db push` to apply the migration
- [ ] Update the mobile generate route to store `JSON.stringify(doc.evidenceLineage)` in the new column
- [ ] Update the web create-document route to store lineage similarly
- [ ] Update the session detail API (`app/api/sessions/[id]/route.ts`) to include `evidenceLineage` in the response

### US-005: Display evidence lineage in web document review UI
**Description:** As a reviewer, I want to see which evidence supports each document field, so I can make informed approval decisions.

**Acceptance Criteria:**
- [ ] In `app/(dashboard)/sessions/[id]/page.tsx`, each form field row shows a small source badge (e.g., camera icon for photo, video icon for video analysis, mic icon for transcript)
- [ ] Hovering or clicking the badge shows: source type, detail text, and confidence percentage
- [ ] Fields sourced from "ai_inferred" (no direct evidence) get a distinct "AI inferred" badge in amber
- [ ] Fields with confidence < 0.7 show the badge in amber; >= 0.7 in green

### US-006: Display verification results as structured cards
**Description:** As a reviewer, I want verification results displayed as readable cards instead of raw JSON, so I can quickly understand what was verified and what needs attention.

**Acceptance Criteria:**
- [ ] Replace the raw `JSON.stringify(verification)` `<pre>` block with structured cards
- [ ] Each verification issue shows: field name, issue description, severity badge (critical=red, warning=amber, info=blue)
- [ ] Show overall verification status: green checkmark if verified, red X if critical issues found
- [ ] Show verification confidence as a percentage with colored indicator

### US-007: Make document fields editable for draft/pending documents
**Description:** As a reviewer, I want to click on a document field and edit its value, so I can correct AI mistakes before approving.

**Acceptance Criteria:**
- [ ] Each form field in the expanded document view has an "Edit" icon button (pencil icon)
- [ ] Clicking "Edit" turns that field's value into a text input pre-filled with the current value
- [ ] "Save" and "Cancel" buttons appear inline
- [ ] Saving calls `PATCH /api/sessions/[sessionId]/documents/[docId]` with the updated field data
- [ ] Only fields on documents with status "draft" or "pending_review" are editable (not approved/rejected)
- [ ] Edited fields get a visual indicator ("edited" badge) so reviewers know what changed
- [ ] Low-confidence fields (yellow highlighted) are editable with the same mechanism

### US-008: Create PATCH endpoint for document field updates
**Description:** As the system, I need an API to update individual fields in a generated document's contentJson.

**Acceptance Criteria:**
- [ ] Create `PATCH /api/sessions/[id]/documents/[docId]/route.ts`
- [ ] Accepts `{ fields: { fieldName: newValue, ... } }` in request body
- [ ] Merges updated fields into existing `contentJson` (does not replace the whole object)
- [ ] Only allows updates on documents with status "draft" or "pending_review"
- [ ] Creates an audit log entry recording which fields were changed, by whom, with old and new values
- [ ] Returns the updated document
- [ ] Protected by dashboard auth

### US-009: Re-verify documents after field edits
**Description:** As the system, I want to automatically re-verify documents after a reviewer edits fields, so verification results stay current.

**Acceptance Criteria:**
- [ ] After a successful PATCH to document fields, the endpoint triggers re-verification via `verifyDocuments()`
- [ ] The re-verification uses the updated `contentJson` (not the original)
- [ ] Updated verification results are stored in `verificationJson` and `verifiedAt`
- [ ] The UI refreshes to show the new verification status after save completes
- [ ] If re-verification fails (e.g., no OpenRouter key), the save still succeeds but verification shows "pending"

## Functional Requirements
- FR-1: `generateDocuments()` must accept and use video annotations and session analysis in its prompt
- FR-2: Every generated document must include `evidenceLineage` mapping fields to their source evidence
- FR-3: The web document review UI must display lineage badges on each field
- FR-4: Draft/pending documents must have editable fields via inline editing
- FR-5: Field edits must be persisted via a PATCH API with audit logging
- FR-6: Edited documents must be re-verified automatically
- FR-7: Verification results must display as structured cards, not raw JSON
- FR-8: All changes must be backwards-compatible — existing documents without lineage data still display correctly

## Non-Goals
- Mobile app field editing (web dashboard only for now)
- Photo quality assessment during capture
- Evidence completeness checker during capture
- Video timestamp linking (clicking a field to jump to video moment)
- Per-field confidence scoring in the generation AI (we use lineage confidence instead)

## Technical Considerations
- `evidenceLineage` is stored as a nullable JSON string column for backwards compatibility
- The GPT-4o prompt change may increase token usage slightly (~200 extra tokens for lineage output)
- Re-verification after field edits requires the OpenRouter API key — if not configured, skip silently
- The inline edit UI should use controlled inputs to avoid React state issues with the expandable document cards
- Existing `contentJson` is a flat `Record<string, string>` — field edits merge into this structure

## Success Metrics
- All generation paths include session analysis data
- Generated documents include field-level evidence citations
- Reviewers can edit and save flagged fields without page reload
- Re-verification runs automatically after edits
- Zero regressions in existing test suite

## Open Questions
- Should we track edit history per field (array of {old, new, editedBy, editedAt}) or just current + audit log?
