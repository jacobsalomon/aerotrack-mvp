[PRD]
# PRD: Reviewer Cockpit on Session Detail

## Overview

Upgrade the existing session detail page into a reviewer-first cockpit for generated maintenance documents. The feature should help a QA reviewer, certifier, or supervisor understand session readiness at a glance, prioritize blockers, inspect field-level evidence lineage, and complete document review faster without leaving the session workflow.

This feature intentionally reuses the existing `/sessions/[id]` route instead of creating a separate review surface. A capture session is already the natural unit for review because it contains the evidence, AI analysis, generated documents, provenance data, and approve/reject actions in one place.

**Status:** Implemented on `/sessions/[id]` with reviewer summary, blockers, field-level evidence jumps, and approve-all-ready flow.

## Goals

- Make the session detail page feel like a true reviewer workspace instead of a raw debug/detail screen.
- Surface review blockers before the reviewer scrolls through evidence and documents.
- Preserve and emphasize field-level evidence linkage for document review.
- Reduce reviewer confusion by adding a clear “what needs attention” summary and “review next” flow.
- Keep implementation scoped to the existing web dashboard session experience.

## Quality Gates

These commands must pass for every user story:
- `npm test` - Unit tests
- `npm run lint` - Linting
- `npm run build` - Production build

## User Stories

### US-001: Add reviewer cockpit summary
**Description:** As a reviewer, I want a cockpit summary at the top of the session detail page so that I can understand readiness and risk before inspecting individual documents.

**Acceptance Criteria:**
- [x] Add a top-of-page reviewer cockpit section to `/app/(dashboard)/sessions/[id]/page.tsx`
- [x] Show counts for total documents, pending review, approved, rejected, evidence items, and high-risk fields
- [x] Show a single readiness label based on session document state and detected blockers
- [x] Show at least one primary CTA that scrolls or jumps the user to the next document needing review

### US-002: Surface review blockers
**Description:** As a reviewer, I want a prioritized list of blockers so that I know what could stop approval.

**Acceptance Criteria:**
- [x] Derive blockers from document status, low-confidence fields, verification issues, and provenance discrepancies
- [x] Display blockers in a dedicated card near the top of the page
- [x] Each blocker includes document label, severity, and concise reviewer-facing text
- [x] Blockers can be used to navigate to the related document in the page

### US-003: Add document review queue metadata
**Description:** As a reviewer, I want each document card to show review metadata so that I can quickly compare which document to open first.

**Acceptance Criteria:**
- [x] Each document header shows counts for low-confidence fields, provenance-linked fields, and verification issues when available
- [x] Each document card has a stable anchor or targetable identifier for in-page navigation
- [x] The first pending-review document opens by default when the page loads if no document is manually expanded yet

### US-004: Extract and test cockpit summary logic
**Description:** As a developer, I want reviewer summary logic in a pure helper so that it is testable and reusable.

**Acceptance Criteria:**
- [x] Add a new helper module under `lib/` for deriving reviewer summary metrics and blockers from session documents
- [x] Add unit tests under `tests/unit/` covering readiness state, blocker generation, and document summary counts
- [x] The session detail page consumes the helper instead of duplicating summary logic inline

## Functional Requirements

### FR-1
The system must treat the existing `/sessions/[id]` page as the reviewer cockpit entry point.

### FR-2
The system must compute reviewer summary metrics from session documents using:
- document status
- low confidence fields
- verification issues
- provenance discrepancies

### FR-3
The system must render a reviewer cockpit section above the existing evidence and documents sections.

### FR-4
The system must show a reviewer readiness label with one of these states:
- Ready to Review
- Blocked
- Awaiting Documents
- Review Complete

### FR-5
The system must render a prioritized blocker list that references the related document.

### FR-6
The system must allow the reviewer to jump from a blocker or CTA to the related document section in the page.

### FR-7
Each generated document card must expose enough metadata in its header for quick triage without opening the full form body.

### FR-8
Field-level evidence lineage behavior must remain available for document fields and cannot be removed by this feature.

### FR-9
The reviewer summary logic must be implemented in a pure helper module with unit test coverage.

## Non-Goals

- No upload-first evidence intake in this slice
- No mobile capture changes
- No new API endpoints
- No new database schema
- No redesign of the part detail page
- No bulk review across multiple sessions

## Technical Considerations

- The existing session detail page already loads document provenance lazily and supports field-level evidence inspection through `EvidenceChainDrawer`.
- The feature should reuse the existing session document data shape and avoid new backend dependencies.
- The helper logic should accept plain document data so it can be unit-tested without React or the database.
- In-page navigation should use stable document IDs or generated element anchors.

## Success Metrics

- Reviewers can identify which document to open next without scanning the full page manually.
- Review blockers are visible before the reviewer reaches the document section.
- Field-level evidence linkage remains discoverable and unchanged.
- The page builds cleanly and summary logic is covered by unit tests.

## Open Questions

- Should future versions support bulk review across the session list’s review queue?
- Should readiness state eventually include SLA or aging logic for pending sessions?
- Should the blocker list later differentiate “approval blocker” vs “recommended attention” more explicitly?
- Should blockers evolve into field-level reviewer dispositions such as "accepted with rationale" or "manually verified"?
[/PRD]
