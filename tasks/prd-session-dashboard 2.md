[PRD]
# PRD: Capture Sessions Dashboard — Detail View, Review Queue, and Approve/Reject

## Overview

The AeroVision web MVP already has a basic sessions list page at `/sessions` with summary cards, status filtering, and a table. This PRD adds the missing pieces: a full session detail page with media playback and AI metadata, a "Review Queue" tab for supervisors, and an approve/reject workflow for generated documents. The goal is both a demo-ready showcase ("look, the supervisor sees everything the AI captured") and a functional tool design partners can use in real shops.

**Existing foundation:**
- Sessions list page: `app/(dashboard)/sessions/page.tsx` (summary cards, status filter, table)
- Sessions API: `app/api/sessions/route.ts` (GET with status filter)
- Sidebar already links to `/sessions` as "Capture Sessions"
- Prisma models: CaptureSession, CaptureEvidence, DocumentGeneration2, VideoAnnotation, SessionAnalysis, AuditLogEntry
- PDF renderers exist for 8130-3, 337, 8010-4 (via `/api/documents/download/[id]`)
- No auth required — page shows all sessions for the org (demo mode)

## Goals

- Make the sessions list rows clickable, linking to a full detail page at `/sessions/[id]`
- Build a rich session detail page with: media playback (photos, video, audio), AI transcripts, video annotations, session analysis, and generated documents
- Add a "Review Queue" tab to the list page showing only sessions awaiting supervisor review
- Enable supervisors to approve or reject individual generated documents with optional notes
- Allow approved documents to be downloaded as PDF
- Create `AuditLogEntry` records for every approve/reject action
- All pages match existing AeroVision design patterns (dark sidebar, shadcn/ui, Space Grotesk headings)

## Quality Gates

These commands must pass for every user story:
- `npx next lint` — Linting
- `npx tsc --noEmit` — TypeScript type checking
- `npm run build` — Production build

For UI stories, also include:
- Verify in browser using Chrome DevTools

## User Stories

### US-001: Session Detail API Endpoint

**Description:** As a frontend developer, I want a single API endpoint that returns all session data (evidence, documents, annotations, analysis, technician info) so that the detail page can render everything in one fetch.

**Acceptance Criteria:**
- [ ] `GET /api/sessions/[id]` endpoint at `app/api/sessions/[id]/route.ts`
- [ ] Returns CaptureSession with all relations: technician (name, badge), organization (name), evidence (all fields + videoAnnotations), documents (all fields including reviewedBy), analysis (if exists)
- [ ] Returns 404 if session not found
- [ ] Protected by `requireDashboardAuth`
- [ ] Evidence items ordered by `createdAt` ascending (capture order)
- [ ] Documents ordered by `generatedAt` ascending

---

### US-002: Approve/Reject API Endpoints

**Description:** As a supervisor, I want API endpoints to approve or reject individual generated documents so that the review workflow persists to the database.

**Acceptance Criteria:**
- [ ] `POST /api/sessions/[id]/review` endpoint at `app/api/sessions/[id]/review/route.ts`
- [ ] Request body: `{ documentId: string, action: "approve" | "reject", notes?: string }`
- [ ] On approve: sets `DocumentGeneration2.status` to `"approved"`, sets `reviewedAt` to now
- [ ] On reject: sets `DocumentGeneration2.status` to `"rejected"`, sets `reviewedAt` to now, stores `reviewNotes`
- [ ] Creates an `AuditLogEntry` for every approve/reject action with: action (`"document_approved"` or `"document_rejected"`), entityType `"DocumentGeneration2"`, entityId, and metadata JSON containing the session ID and any notes
- [ ] After reviewing all documents in a session: if all are approved, update `CaptureSession.status` to `"approved"`; if any are rejected, update to `"rejected"`
- [ ] Returns the updated document record
- [ ] Returns 404 if session or document not found

---

### US-003: Make Session Rows Clickable + Add Review Queue Tab

**Description:** As a supervisor, I want to click a session row to see its details, and I want a "Review Queue" tab showing only sessions that need my review.

**Acceptance Criteria:**
- [ ] Each table row in `sessions/page.tsx` is clickable and navigates to `/sessions/[id]`
- [ ] Rows show a hover effect (subtle background change) to indicate they're clickable
- [ ] Add a tab bar above the table with two tabs: "All Sessions" (current view) and "Review Queue"
- [ ] "Review Queue" tab filters to sessions with status `"submitted"` or `"documents_generated"`
- [ ] Tab bar uses shadcn/ui `Tabs` component or equivalent, matching existing design patterns
- [ ] Review Queue tab shows a badge count of pending items
- [ ] Active tab is visually indicated

---

### US-004: Session Detail Page — Header and Evidence Gallery

**Description:** As a supervisor, I want to see a session's full details — who did it, when, what was captured — with full media playback for all evidence items.

**Acceptance Criteria:**
- [ ] New page at `app/(dashboard)/sessions/[id]/page.tsx`
- [ ] Page header shows: technician name + badge, session status badge, start time, duration, description (if any)
- [ ] "Back to Sessions" link at top of page
- [ ] Evidence gallery section with all captured items in chronological order
- [ ] **Photos:** click thumbnail to enlarge in a modal/lightbox view. Show AI extraction data (from `aiExtraction` JSON) below each photo — part numbers found, text detected, etc.
- [ ] **Videos:** HTML5 `<video>` player with playback controls. Show duration and file size. If video has `VideoAnnotation` records, show them as a clickable list below the video — clicking an annotation seeks to that timestamp
- [ ] **Audio chunks:** HTML5 `<audio>` player with playback controls. Show transcription text (from `transcription` field) below each audio item
- [ ] All media loaded via their `fileUrl` (R2 signed URLs or direct paths)
- [ ] Empty state if no evidence yet ("No evidence captured in this session")
- [ ] Matches existing AeroVision design: shadcn/ui cards, Space Grotesk headings, dark neutral palette

---

### US-005: Session Detail Page — AI Analysis and Transcript

**Description:** As a supervisor, I want to see the AI's analysis of the session — what parts were identified, what procedures were performed, any anomalies — and the full audio transcript.

**Acceptance Criteria:**
- [ ] "AI Analysis" section shown if a `SessionAnalysis` record exists for this session
- [ ] Displays parsed JSON from: `actionLog` (timestamped actions), `partsIdentified` (part numbers/serials), `procedureSteps` (maintenance steps), `anomalies` (flagged concerns)
- [ ] Each section rendered in a readable card format — action log as a timeline, parts as chips/badges, procedure steps as a numbered list, anomalies as warning-styled callouts
- [ ] Shows model used, processing time, confidence score, and estimated cost
- [ ] "Full Transcript" section showing stitched audio transcription from all audio evidence chunks, in chronological order
- [ ] If no analysis exists, show a muted "AI analysis not yet available" message
- [ ] Confidence score shown as a colored indicator (green > 0.8, amber 0.5-0.8, red < 0.5)

---

### US-006: Session Detail Page — Documents Review and Approve/Reject

**Description:** As a supervisor, I want to review each AI-generated document, approve or reject it with notes, and download approved documents as PDF.

**Acceptance Criteria:**
- [ ] "Generated Documents" section showing all `DocumentGeneration2` records for the session
- [ ] Each document displayed as a card showing: document type (e.g., "FAA 8130-3"), status badge (draft/pending_review/approved/rejected), confidence score, count of low-confidence fields, generated timestamp
- [ ] Clicking a document card expands it to show the full `contentJson` rendered as a readable form preview (key-value pairs of form fields)
- [ ] Low-confidence fields (from `lowConfidenceFields` JSON array) highlighted with an amber/yellow background
- [ ] If `verificationJson` exists, show AI verification results (field-level issues flagged by the verification pass)
- [ ] **Approve button:** updates document status to approved via `/api/sessions/[id]/review`, shows success toast, refreshes the card
- [ ] **Reject button:** opens a dialog/textarea for rejection notes, then calls the review API, shows confirmation toast
- [ ] **Download PDF button** on approved documents — links to existing `/api/documents/download/[id]` endpoint (only shown when status is `"approved"`)
- [ ] If a document was already reviewed: show reviewer info (if `reviewedBy` exists) and review timestamp
- [ ] After all documents are approved, the session status badge auto-updates to "Approved"

---

### US-007: Session Detail Page — Audit Log

**Description:** As a supervisor or auditor, I want to see the full audit trail for this session — every action that was taken, by whom, and when.

**Acceptance Criteria:**
- [ ] "Audit Trail" section at the bottom of the session detail page
- [ ] Fetches `AuditLogEntry` records filtered by `entityId` matching the session ID, OR by `metadata` containing the session ID
- [ ] Add a new API endpoint `GET /api/sessions/[id]/audit` that returns relevant audit log entries
- [ ] Each entry shown as a row: timestamp, action description (human-readable, e.g., "Document 8130-3 approved"), actor (technician name if available), and any notes from metadata
- [ ] Entries in reverse chronological order (newest first)
- [ ] Collapsible section (default collapsed) to keep the page clean
- [ ] If no audit entries, show "No audit trail entries for this session"

## Functional Requirements

- FR-1: The sessions list must remain functional with zero sessions (empty state already exists)
- FR-2: All API endpoints must be protected by `requireDashboardAuth`
- FR-3: Evidence media files are loaded directly from their `fileUrl` — no proxying needed
- FR-4: PDF download uses the existing renderer infrastructure at `/api/documents/download/[id]`
- FR-5: The review workflow updates both the document record and (when all documents are reviewed) the parent session status
- FR-6: All approve/reject actions create immutable `AuditLogEntry` records
- FR-7: The detail page must gracefully handle sessions at any status — from "capturing" (minimal data) to "approved" (everything populated)
- FR-8: JSON fields (`contentJson`, `aiExtraction`, `actionLog`, etc.) must be parsed safely with try/catch — malformed JSON should not crash the page

## Non-Goals (Out of Scope)

- Real authentication / user roles (demo mode — no login)
- Editing document field values from the web dashboard (mechanic edits on mobile only)
- Push notifications to the mobile app on rejection (status update only — mobile polls)
- Seeding demo capture sessions (page works with zero data, real data comes from mobile app)
- Technician filtering on the list page (status filter is sufficient for now)
- Batch approve/reject multiple documents at once
- Real-time updates via WebSocket (page refreshes on action)

## Technical Considerations

- **Project location:** `~/Desktop/Primary_OIR/MVC/MVP/aerovision-mvp/`
- **Existing patterns:** Follow the same component style as `sessions/page.tsx` — `"use client"`, shadcn/ui cards/tables, `apiUrl()` for fetch calls, Space Grotesk for headings, dark neutral color palette
- **`serverExternalPackages`** in `next.config.ts` is critical — don't remove it
- **`basePath: '/aerovision-demo'`** — all internal links must account for this (Next.js handles it via `<Link>`, but raw `<a>` tags need the prefix)
- **R2 signed URLs** for evidence files may expire — if media fails to load, show a fallback placeholder rather than crashing
- **Large JSON fields** (rawResponse, contentJson) can be very large — don't render rawResponse by default, use collapsible/expandable sections
- **Existing PDF download endpoint** at `/api/documents/download/[id]` — this endpoint looks up a `DocumentGeneration2` record by its own ID field, not by `GeneratedDocument` ID. Verify the exact endpoint behavior before wiring up the download button.

## Success Metrics

- Supervisor can view all capture sessions and filter by status
- Supervisor can click into any session and see all evidence with media playback
- Supervisor can read the full AI analysis, transcript, and video annotations
- Supervisor can approve or reject each generated document with notes
- Approved documents can be downloaded as PDF
- All actions are logged in the audit trail
- Page renders cleanly with zero sessions, one session, and many sessions

## Open Questions

- Should the "Review Queue" tab auto-refresh on a timer (e.g., every 30 seconds) to catch new submissions? Or is manual refresh sufficient?
- The existing `/api/documents/download/[id]` endpoint — does it use `DocumentGeneration2.id` or a different ID scheme? Need to verify during implementation.
[/PRD]
