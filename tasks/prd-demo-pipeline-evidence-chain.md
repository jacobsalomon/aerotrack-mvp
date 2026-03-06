# PRD: AeroVision Demo Pipeline — Live AI Processing + Evidence Chain

## Overview
Wire up the AeroVision Capture mobile app's backend AI pipeline so that a live capture session produces real FAA compliance documents from video, audio, and photo evidence. Build an Evidence Chain Visualization on the web dashboard that lets anyone click a document field and see the exact source evidence that generated it — with multi-source corroboration showing when a field was confirmed by video + audio + photo independently.

Target: live demo to a HEICO repair station GM on March 9, 2026. The demo uses a physical prop (brake caliper or similar mechanical part with a printed Parker data plate) captured live on an iPhone via the AeroVision Capture app. No real aircraft parts or CMM manuals required.

## Goals
- Complete the capture-to-document pipeline so the mobile app produces real AI-generated FAA forms from live video, audio, and photo evidence
- Implement multi-source evidence fusion: video analysis, audio transcription, and photo OCR all contribute to every document field, with cross-corroboration increasing confidence
- Build a resilient multi-model fallback chain using the latest models (Gemini 3.1, GPT-5.4, Claude Sonnet 4.6) so the pipeline never fails during a live demo
- Add field-level provenance tracking so every generated document field traces back to its source evidence across all three modalities
- Build an interactive Evidence Chain UI on the web dashboard where clicking any document field reveals all corroborating evidence
- Make CMM context optional — the system works with or without a loaded CMM
- Enable live capture session results to be viewable on the web dashboard immediately after processing
- Deliver a demo-ready system by March 9, 2026

## Quality Gates

These commands must pass for every user story:
- `npm run build` — Next.js production build (in aerovision-mvp)
- `npm run lint` — ESLint checks (in aerovision-mvp)

## User Stories

### US-001: AI Service Layer with Multi-Model Fallback Chains
**Description:** As a system, I need a resilient AI service layer that tries the best available model first and automatically falls back to alternatives if a call fails or times out, so the pipeline never breaks during a live demo.

**Acceptance Criteria:**
- [ ] Create `lib/ai/provider.ts` with a generic `callWithFallback()` utility that accepts an ordered list of model configs and tries each in sequence
- [ ] Each attempt has a configurable timeout (default 60s for video analysis, 30s for document generation, 15s for OCR/transcription)
- [ ] On failure (timeout, 429, 500, network error), log the error and try the next model immediately
- [ ] If all models fail, return a pre-cached fallback response and flag it as `"source": "cached"`
- [ ] **Video analysis chain:** Gemini 3.1 Pro Preview (`gemini-3.1-pro-preview`) → Gemini 3.1 Flash (`gemini-3.1-flash`) → Gemini 3.0 Flash → cached fallback
- [ ] **Audio transcription chain:** `gpt-4o-transcribe` → `gpt-4o-mini-transcribe` → cached fallback
- [ ] **Photo OCR chain:** GPT-5.4 (`gpt-5.4`) → GPT-4o → Gemini 3.1 Flash → cached fallback
- [ ] **Document generation chain:** GPT-5.4 → Claude Sonnet 4.6 (`claude-sonnet-4-6`) → Gemini 3.1 Pro Preview → cached fallback
- [ ] **Document verification chain:** Claude Sonnet 4.6 → GPT-5.4 → cached fallback
- [ ] All API keys read from environment variables: `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- [ ] Each call logs: model attempted, model used (if fallback), latency in ms, success/failure, error message if failed
- [ ] Create `lib/ai/models.ts` with a centralized model registry — model IDs, provider, API base URLs, and pricing per model so they can be updated in one place

### US-002: Session Analysis Endpoint (Multi-Source Evidence Fusion)
**Description:** As a mobile app, I need `POST /api/mobile/analyze-session` to process all captured evidence (video, audio, photos) through the AI pipeline in parallel and return a fused analysis, so the results screen can show what the AI found across all modalities.

**Acceptance Criteria:**
- [ ] Endpoint accepts `{ sessionId }` in the request body
- [ ] Fetches all `CaptureEvidence` records for the session from the database
- [ ] Processes all three evidence types in parallel (not sequentially):
  - **Video → Gemini 3.1 Pro Preview:** Send video chunk URLs with a prompt that extracts: timestamped actions performed, parts/components visible (part numbers, serial numbers from data plates, gauge readings, tool settings), tools observed, measurements visible on gauges/instruments, condition observations. Uses fallback chain from US-001.
  - **Audio → GPT-4o-transcribe:** Send audio chunk URLs for word-level timestamped transcription. Uses fallback chain.
  - **Photos → GPT-5.4:** Send each photo for comprehensive extraction: part numbers, serial numbers, data plate text, gauge/instrument readings, measurements visible, condition observations, any text visible. Uses fallback chain.
- [ ] Video analysis prompt explicitly instructs the model to: read all visible data plates and part numbers, read gauge/instrument displays for measurements, identify tools and their settings (e.g., torque wrench value), describe component conditions observed
- [ ] CMM context is **optional** — if a CMM document URL or text is provided in the session metadata, include it in the video analysis prompt. If not, instruct the AI to use general aerospace maintenance knowledge and note any CMM references the mechanic mentions verbally.
- [ ] After all three complete, store a `SessionAnalysis` record containing: `videoAnalysis` (actions, parts, measurements from video), `audioTranscript` (timestamped text), `photoExtractions` (per-photo structured data), `processingMetadata` (models used, latencies, fallbacks triggered)
- [ ] Update session status to `analysis_complete`
- [ ] Return the full analysis object in the format the mobile results screen expects
- [ ] Total endpoint timeout: 120 seconds
- [ ] If any single modality fails entirely (all fallbacks exhausted), the endpoint still succeeds with the remaining modalities — partial analysis is better than no analysis

### US-003: Document Generation with Multi-Source Fusion and Field-Level Provenance
**Description:** As a mobile app, I need `POST /api/mobile/generate` to produce FAA compliance documents by fusing evidence from all three sources (video, audio, photo), with provenance metadata tracking which sources confirmed each field, so we can build the evidence chain visualization.

**Acceptance Criteria:**
- [ ] Endpoint accepts `{ sessionId }` in the request body
- [ ] Fetches the `SessionAnalysis`, all evidence records, and all extracted data for the session
- [ ] Constructs a comprehensive prompt for GPT-5.4 that includes ALL evidence:
  - Video analysis results (timestamped actions, parts identified, measurements observed, conditions noted)
  - Full audio transcript (timestamped)
  - Photo extraction results (part numbers, serial numbers, measurements, text)
  - CMM context if available, otherwise: "Use general aerospace maintenance knowledge. The mechanic may reference specific CMM sections verbally — include those references as stated."
- [ ] The prompt instructs the AI to generate FAA 8130-3, Form 337, and Form 8010-4 as structured JSON
- [ ] **Multi-source fusion rules** (included in the prompt):
  - Use ALL available sources to populate each field — don't rely on a single source when multiple are available
  - When multiple sources agree on a value (e.g., part number confirmed by video + audio + photo), report higher confidence
  - When sources conflict (e.g., audio says "1089" but photo OCR reads "1098"), flag a `DISCREPANCY` — do not silently pick one. Include both values and mark the field for mechanic review.
  - Video analysis is authoritative for: sequence of actions performed, tools used, physical steps taken
  - Audio narration is authoritative for: mechanic judgment calls (serviceable/replace), pass/fail determinations, CMM references cited
  - Photo OCR is authoritative for: data plate readings (part numbers, serial numbers, manufacturing data)
  - For measurements: prefer the source with highest precision (photo of gauge > verbal narration > video frame), but note all sources
- [ ] **Provenance output:** For each document field, the AI must output a `provenance` array:
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
- [ ] Store each generated document as a `DocumentGeneration` record with `contentJson` (form fields) and `provenanceJson` (the field-to-evidence mapping with all sources)
- [ ] Documents created with status `draft`, per-field confidence scores, and `lowConfidenceFields` array (fields below 0.8 confidence)
- [ ] **Discrepancy fields** (where sources conflict) are flagged separately in a `discrepancies` array with both conflicting values and their sources
- [ ] Update session status to `documents_generated`
- [ ] Return all generated documents with provenance and discrepancy data to the mobile app
- [ ] Uses fallback chain from US-001 for the generation call

### US-004: Document Verification Endpoint
**Description:** As a mobile app, I need `POST /api/mobile/verify-documents` to cross-check generated documents for internal consistency using a different AI model, so the demo can show that the system verifies its own work.

**Acceptance Criteria:**
- [ ] Endpoint accepts `{ sessionId }` in the request body
- [ ] Fetches all `DocumentGeneration` records for the session
- [ ] Sends all documents to Claude Sonnet 4.6 (primary) with a prompt that checks:
  - Part numbers consistent across all three documents (8130-3, Form 337, Form 8010-4)
  - Serial numbers consistent across all three documents
  - Every finding in the findings section has a corresponding work action
  - Test results referenced in the work order match the 8130-3 Block 7 remarks
  - Parts consumed listed consistently across documents
  - No logical contradictions (e.g., "no leaks" in one doc, "leak detected" in another)
  - Measurements cited match across documents
  - Any discrepancies flagged during generation (from US-003) are highlighted
- [ ] Returns a `VerificationResult` with: overall pass/fail, per-document issues array, discrepancies confirmed/resolved, cross-document consistency score, and the verification model used
- [ ] Stores the verification result linked to the session
- [ ] Update session status to `verified`
- [ ] Uses fallback chain from US-001

### US-005: Pre-Cached Fallback Data for Demo Reliability
**Description:** As a demo presenter, I need pre-cached realistic responses for every AI endpoint so that if all models fail during the live demo, the pipeline still completes seamlessly.

**Acceptance Criteria:**
- [ ] Create `lib/ai/cached-responses/` directory with JSON files for each response type
- [ ] `session-analysis.json` — realistic analysis of an HPC-7 pump overhaul including: video analysis with 8+ timestamped actions, audio transcript with part numbers and measurements, photo extractions with data plate readings
- [ ] `generated-documents.json` — complete 8130-3, Form 337, Form 8010-4 with all fields populated, multi-source provenance metadata, and one planted discrepancy (transposed part number digits between audio and photo sources)
- [ ] `verification-result.json` — verification result that catches the planted discrepancy and flags it
- [ ] Cached data uses part number 881700-1089 and serial number SN-2024-11432
- [ ] Cached provenance data includes examples of single, double, and triple corroboration across video/audio/photo sources
- [ ] When a cached response is used, the API response includes `"fallbackUsed": true` and `"fallbackReason": "all models failed"` — visible in logs but not shown to the audience
- [ ] Cached responses are structurally identical to real AI responses so the mobile app and web dashboard handle them identically

### US-006: Evidence Chain Data Model and API
**Description:** As a web dashboard, I need an API endpoint that returns provenance data for a generated document along with the actual evidence files (photo URLs, audio URLs, transcript text), so the Evidence Chain UI can display field-to-evidence mappings.

**Acceptance Criteria:**
- [ ] Add `provenanceJson` field to the `DocumentGeneration` model in the Prisma schema (Text field storing JSON string) if it doesn't already exist
- [ ] Create `GET /api/documents/[id]/provenance` endpoint
- [ ] Response includes:
  - Document type and all form fields
  - Per-field provenance array with all contributing sources (video, audio, photo)
  - For each evidence source: type, evidence ID, file URL (Vercel Blob URL for photos/videos/audio), relevant timestamp, excerpt/description, confidence score
  - Corroboration level per field ("single", "double", "triple")
  - Discrepancies array (fields where sources conflict)
  - Verification result (if available)
- [ ] The endpoint resolves evidence IDs to full evidence records (including blob URLs) so the UI doesn't need a second fetch
- [ ] Works with both live capture session data and seeded demo data
- [ ] Run `npx prisma db push` to apply schema changes

### US-007: Evidence Chain UI Component
**Description:** As a demo presenter, I want to click any field in a generated FAA document on the web dashboard and see a drawer showing all source evidence that produced that field — with corroboration indicators showing how many independent sources confirmed the value.

**Acceptance Criteria:**
- [ ] Create `components/evidence-chain-drawer.tsx` — a slide-out drawer (right side) using shadcn/ui Sheet component
- [ ] **Header section:**
  - Field name and current value
  - Corroboration badge: "Verified by 3 sources" (green), "2 sources" (blue), "1 source" (yellow)
  - Overall confidence percentage with color indicator (green 90%+, yellow 70-89%, red <70%)
- [ ] **Evidence cards section** (one card per source, ordered by confidence):
  - Each card shows:
    - Source type icon and label: camera icon + "Video Analysis", microphone icon + "Audio Transcript", image icon + "Photo OCR", book icon + "CMM Reference"
    - For video: description of what was observed, timestamp in the video (e.g., "at 2:21"), confidence score
    - For audio: transcript excerpt with the relevant words **bold highlighted**, timestamp (e.g., "at 2:18"), confidence score
    - For photo: thumbnail image (loaded from Vercel Blob URL), caption describing what was extracted, confidence score, click to enlarge
    - For measurement: parameter name, measured value, spec value, tolerance, pass/fail badge
    - For CMM reference: section number and title
  - Cards have a subtle left border color matching the source type (blue=video, green=audio, amber=photo)
- [ ] **Discrepancy alert** (if applicable):
  - Red banner at top of drawer: "Discrepancy Detected"
  - Shows conflicting values from different sources side by side
  - E.g., "Audio: 881700-1089 vs Photo OCR: 881700-1098 — Review Required"
- [ ] Drawer closes on clicking outside, pressing Escape, or clicking X
- [ ] Drawer is responsive at desktop width (min 400px wide)
- [ ] Loading state while provenance data is being fetched

### US-008: Integrate Evidence Chain into Parts Detail Page
**Description:** As a demo presenter, I want the Compliance Documents section on the parts detail page to have clickable fields that open the Evidence Chain drawer, so I can demonstrate traceability on live capture data.

**Acceptance Criteria:**
- [ ] On the parts detail page (`app/(dashboard)/parts/[id]/page.tsx`), modify the Compliance Documents card
- [ ] Each generated document is expandable — clicking the document card header reveals its form fields in a structured layout
- [ ] Each field row shows: field name, value, corroboration indicator (1/2/3 source icons), and a chain-link icon
- [ ] Fields with discrepancies show a red warning icon instead of the chain-link icon
- [ ] Fields with low confidence (<0.8) show a yellow warning icon next to the chain-link icon
- [ ] Clicking any field row (or its chain-link icon) opens the Evidence Chain drawer (US-007) for that field
- [ ] Fetches provenance data from `GET /api/documents/[id]/provenance` when a document is first expanded (lazy load, cached after first fetch)
- [ ] Works with live capture session documents (from US-003) and seeded demo documents
- [ ] If no provenance data exists for a document (legacy documents), fields render normally without chain-link icons — graceful degradation
- [ ] The document field layout matches the structure of each form type:
  - 8130-3: Block 1 through Block 14 in the standard grid
  - Form 337: sections as defined in the form
  - Form 8010-4: sections as defined in the form

### US-009: Live Session Viewer on Web Dashboard
**Description:** As a demo presenter, I need a way to view live capture session results on the web dashboard immediately after the AI pipeline processes them, so I can transition from "I just captured this on my phone" to "let me show you the evidence chain" on my laptop.

**Acceptance Criteria:**
- [ ] Create `app/(dashboard)/sessions/page.tsx` — a sessions list page showing all capture sessions, sorted by most recent first
- [ ] Each session card shows: status badge, part number (if identified), evidence count (photos, video chunks), duration, timestamp, number of documents generated
- [ ] Create `app/(dashboard)/sessions/[id]/page.tsx` — a session detail page showing:
  - Session metadata (technician, start/end time, status, duration)
  - Evidence gallery: photos as thumbnails (clickable to enlarge), video chunks with duration, audio chunks with transcript preview
  - AI analysis summary: key actions detected, parts identified, measurements extracted
  - Generated documents section — identical to the Compliance Documents section on the parts page, with the same clickable evidence chain functionality (reuse US-008 components)
  - Verification result banner (pass/fail, any issues found)
- [ ] Add "Sessions" link to the sidebar navigation
- [ ] The session detail page auto-refreshes while status is `processing` or `analyzing` (polls every 5 seconds), and stops polling once status reaches `documents_generated` or `verified`
- [ ] This is the primary page used during the demo — after capturing on the phone, the presenter navigates here on the laptop

### US-010: Seeded Backup Evidence Chain for Component 9
**Description:** As a demo presenter, I need the existing demo component (Component 9, `demo-hpc7-overhaul`) to have pre-loaded provenance data as a backup, so I can demonstrate the evidence chain even if the live pipeline has issues.

**Acceptance Criteria:**
- [ ] In `prisma/seed.ts`, add provenance data to the three existing `GeneratedDocument` records for Component 9
- [ ] Provenance maps key fields to realistic evidence sources with multi-source corroboration:
  - 8130-3 Block 4 (Part Number: 881700-1089) → photo OCR (confidence 0.97) + audio transcript (0.95) + video data plate reading (0.88) = triple corroboration
  - 8130-3 Block 5 (Serial Number) → photo OCR + audio = double corroboration
  - 8130-3 Block 7 (bore measurement) → audio excerpt + video gauge reading + photo of caliper display = triple corroboration
  - 8130-3 Block 7 (seal replacement) → audio excerpt + video showing seal removal = double corroboration
  - 8130-3 Block 7 (test results) → audio excerpt + video gauge reading = double corroboration
  - Include one discrepancy example: a part number where audio says "1089" but one photo OCR reads "1098"
- [ ] Include 3-4 placeholder images in `/public/demo/evidence/` (data plate, worn seal, bore measurement, test gauge)
- [ ] Include realistic audio transcript excerpts matching the demo narration script
- [ ] After seeding, the Evidence Chain drawer works for Component 9 with no AI calls needed
- [ ] This is the backup demo path only — primary demo uses live capture data via US-009

## Functional Requirements
- FR-1: The AI service layer must try each model in the fallback chain with independent timeouts — a slow primary model must not consume the entire timeout budget
- FR-2: Every AI API call must be logged with: provider, model ID, latency, token count (if available), outcome, and cost estimate
- FR-3: The document generation prompt must explicitly request provenance metadata for every field, with evidence from all three modalities (video, audio, photo)
- FR-4: Each provenance entry must support multiple evidence sources per field — the Evidence Chain drawer shows all contributing sources, not just the "best" one
- FR-5: When sources conflict, the system must flag a discrepancy rather than silently choosing one value — discrepancies are a feature, not a bug
- FR-6: The system must work without CMM context — if no CMM is loaded, the AI uses general aerospace maintenance knowledge and incorporates CMM references mentioned verbally by the mechanic
- FR-7: The system must handle partial evidence gracefully — if a session has video + audio but no photos, documents are still generated from available evidence
- FR-8: All new API endpoints must accept the same auth token the mobile app already sends
- FR-9: The web dashboard session viewer must display live capture data without requiring the data to be linked to an existing Component record — sessions can exist independently
- FR-10: Evidence files (photos, video, audio) are stored in Vercel Blob — the Evidence Chain UI loads them directly from blob URLs

## Non-Goals (Out of Scope)
- Changes to the mobile capture app (Expo/React Native) — it works as-is
- PDF rendering of the evidence chain
- Real-time streaming of AI results during processing
- Evidence chain on the mobile app (web dashboard only for now)
- Actual audio playback in the evidence chain drawer (show transcript text; audio player is nice-to-have if time permits)
- Automated E2E tests (sprint mode — manual verification)
- CMM upload or management UI
- User authentication or role-based access on the web dashboard
- Linking capture sessions to existing Component records (sessions stand alone for now)

## Technical Considerations
- **aerovision-mvp:** Next.js 15, Prisma 7, SQLite, Tailwind 4, shadcn/ui — at `~/Desktop/Primary_OIR/MVC/MVP/aerovision-mvp/`
- **aerovision-capture:** Expo SDK 54, React Native, on TestFlight — at `~/Desktop/Primary_OIR/MVC/MVP/aerovision-capture/`
- Mobile app talks to aerovision-mvp backend via `/api/mobile/*` routes
- Existing Prisma models: `CaptureSession`, `CaptureEvidence`, `DocumentGeneration`, `VideoAnnotation` — check schema before creating duplicates
- `serverExternalPackages` in `next.config.ts` is critical — don't remove
- Seed data in `prisma/seed.ts` (1,500+ lines) — add to it, don't rewrite
- Demo component ID: `demo-hpc7-overhaul` (deterministic)
- Environment variables needed: `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- Video tokenization at 258 tokens/sec at 1 FPS — a 2-min chunk is ~31K tokens
- Gemini 3.1 Pro Preview and Flash both support native video input via the File API
- GPT-5.4 has a 1M token context window — sufficient for all evidence + document generation in a single call
- Claude Sonnet 4.6 has a 1M token context window — sufficient for cross-document verification

## Execution Order

| Day | Stories | Focus |
|-----|---------|-------|
| **Day 1** | US-001, US-005 | AI service layer with fallback chains + cached safety net |
| **Day 2** | US-002, US-003, US-004 | Three backend endpoints — the live AI pipeline |
| **Day 3** | US-006, US-007, US-009 | Evidence chain data model + UI component + session viewer |
| **Day 4** | US-008, US-010 + rehearsal | Integration into parts page + backup seed data + full demo rehearsal |

## Success Metrics
- A live capture session on the phone produces AI-generated FAA documents within 90 seconds
- If primary AI models fail, fallback models produce results within 120 seconds
- If all AI models fail, pre-cached fallback data appears within 2 seconds
- Documents show multi-source provenance — fields confirmed by 2+ sources show corroboration badges
- Clicking any field in a generated document opens the Evidence Chain drawer with all contributing evidence sources
- At least one field shows a discrepancy between sources (the planted error or a naturally occurring one)
- The full demo flow works end-to-end: capture on phone → process → open web dashboard → show documents → click fields → see evidence chain
- The HEICO GM can pick any field and see its source evidence within 2 seconds

## Open Questions
- Are there existing placeholder/demo images in the aerovision-mvp `/public/` directory, or do we need to create new ones for US-010?
- Does the Prisma schema already have `CaptureSession` and `CaptureEvidence` models, or do these need to be created? (Need to check the schema file)
- What's the Vercel Blob storage configuration — is there a shared blob store between the capture app and the web dashboard, or separate stores?
