[PRD]
# PRD: Background AI Jobs With Progressive Session States

## Overview
Move AeroVision's heavy post-capture AI work out of the synchronous request path and into background jobs, with clear progressive UI states on both mobile and web. Instead of leaving users in long, ambiguous waits, the product should visibly advance through `Captured`, `Drafting`, `Verified`, and `Packaged`.

This feature is primarily about perceived responsiveness and user trust. The system should acknowledge capture completion immediately, continue analysis/generation/verification/export asynchronously, and keep the user informed with resumable, inspectable progress.

## Goals
- Eliminate long blank waits after a capture session ends.
- Make post-capture AI work asynchronous, retryable, and resumable.
- Show a simple, user-facing progress model on both mobile and web.
- Preserve the reviewer workflow by making `Verified` mean "AI verification complete / ready for human review," not final human approval.
- Add a final `Packaged` state when exportable deliverables are assembled.

## Quality Gates

These commands must pass for every user story:
- `npm test` - unit/integration tests
- `npm run build` - production build
- `npm run lint` - linting

For UI stories, also include:
- Browser verification against the session flow on the web dashboard

## User Stories

### US-001: Add background job state model for post-capture processing
**Description:** As the system, I want post-capture AI work represented as explicit job stages so that long-running work can happen asynchronously and the UI can show meaningful progress.

**Acceptance Criteria:**
- [ ] Add a persistent job/stage model for session post-processing, either as a new table or explicit fields on `CaptureSession`, with enough data to track stage, attempt count, timestamps, and error state
- [ ] The backend tracks these canonical internal stages: `queued`, `analyzing`, `drafting`, `verifying`, `packaging`, `completed`, `failed`
- [ ] A user-facing state mapper translates internal stages into `Captured`, `Drafting`, `Verified`, `Packaged`
- [ ] Stage progress survives page refreshes and server restarts
- [ ] Failures are stored with stage-specific error metadata instead of leaving the session in a generic stuck state

### US-002: Enqueue post-capture work instead of blocking the request
**Description:** As a technician, I want ending a capture session to return quickly so that I immediately know my evidence was saved and the AI is working in the background.

**Acceptance Criteria:**
- [ ] The mobile/session completion flow creates or schedules a background job instead of waiting for analysis/generation/verification/export inline
- [ ] The completion response returns within a short acknowledgment window and includes the current session/job state
- [ ] The session is immediately marked as user-facing `Captured` after evidence capture is done
- [ ] Existing synchronous code paths in `app/api/mobile/analyze-session/route.ts`, `app/api/mobile/generate/route.ts`, and `lib/ai/pipeline.ts` are refactored so heavy work can run via the job runner
- [ ] Duplicate enqueue attempts for the same session do not create duplicate processing jobs

### US-003: Split heavy AI work into resumable background stages
**Description:** As the system, I want analysis, drafting, verification, and packaging to run as resumable stages so that a failure in one step does not force the whole session back to the beginning.

**Acceptance Criteria:**
- [ ] Analysis, document drafting, AI verification, and packaging/export are executed as distinct stages
- [ ] Each stage records `startedAt`, `completedAt`, `attemptCount`, and `lastError`
- [ ] A failed stage can be retried without repeating already-completed earlier stages unless inputs changed
- [ ] Verification runs after documents exist; packaging runs after verification output exists
- [ ] Packaging produces a concrete artifact or package record (for example, export metadata, compiled doc bundle, or evidence pack) rather than being a UI-only label

### US-004: Expose session progress through a status API contract
**Description:** As a client app, I want a stable API for session progress so that mobile and web can show the same state language and timing details.

**Acceptance Criteria:**
- [ ] Session detail APIs include the current internal job stage and the mapped user-facing state
- [ ] The API includes stage timestamps and current/last error information when relevant
- [ ] The API can distinguish `in_progress`, `completed`, and `failed` for each stage
- [ ] Legacy sessions without background-job metadata degrade gracefully and still render a sensible status
- [ ] The API contract is shared by both mobile session views and web session/reviewer views

### US-005: Show progressive states in the mobile capture flow
**Description:** As a technician, I want the mobile app to show `Captured`, `Drafting`, `Verified`, and `Packaged` so I am never left wondering whether the system is working.

**Acceptance Criteria:**
- [ ] After capture completion, the mobile UI immediately shows `Captured` with confirmation that evidence was saved
- [ ] While background work runs, the UI shows the active state with a non-blocking progress treatment instead of a blank wait screen
- [ ] The mobile UI updates automatically as the session moves from `Captured` to `Drafting` to `Verified` to `Packaged`
- [ ] If a stage fails, the UI shows which stage failed and offers retry or return-later behavior
- [ ] The user can leave the screen and later return to the same session without losing progress visibility

### US-006: Show progressive states in the web session/reviewer UI
**Description:** As a reviewer or supervisor, I want the web dashboard to reflect post-capture progress clearly so I know whether a session is still drafting, verified and ready for review, or fully packaged.

**Acceptance Criteria:**
- [ ] The session detail page shows the same user-facing state vocabulary as mobile: `Captured`, `Drafting`, `Verified`, `Packaged`
- [ ] The web UI shows which internal stage is active when useful, without exposing low-signal implementation detail to end users
- [ ] `Verified` is presented as "AI-verified / ready for review" and does not imply final human approval
- [ ] Existing reviewer actions continue to use document `approved` / `rejected` states without collision with the new progress labels
- [ ] The page polls or refreshes progress while a session is still processing, then stops when terminal work is complete

### US-007: Preserve human review as a separate post-verification workflow
**Description:** As a reviewer, I want AI verification and human approval to remain distinct so the UI does not imply that AI verification is regulatory sign-off.

**Acceptance Criteria:**
- [ ] Session/document review actions still culminate in human-driven `approved` or `rejected` outcomes
- [ ] The UI copy for `Verified` explicitly indicates readiness for review rather than final approval
- [ ] Reviewer cockpit logic continues to derive blocker states from document review data, not just job completion
- [ ] No workflow change causes `verified` to auto-promote a session to `approved`
- [ ] The PRD implementation notes reference existing review endpoints and document states so this distinction remains explicit in code

### US-008: Add retry, recovery, and telemetry for long-running jobs
**Description:** As the team, we want background processing to be observable and recoverable so that reliability improves along with UX.

**Acceptance Criteria:**
- [ ] Each stage logs latency, success/failure, and retry count
- [ ] Job telemetry captures time spent in each stage and total time from capture completion to packaged
- [ ] Operators or developers can identify sessions stuck in a stage from stored status data
- [ ] Failures no longer silently fall back to vague session states when a more precise failed-stage state is available
- [ ] Success metrics needed by product are instrumented: time to first visible state update, time to draft, time to verified, time to packaged, failure rate by stage

## Functional Requirements
1. FR-1: The system must acknowledge session completion immediately after evidence capture and offload heavy AI work to background execution.
2. FR-2: The system must represent post-capture work as staged jobs covering analysis, drafting, verification, and packaging.
3. FR-3: The system must map internal stages to the user-facing states `Captured`, `Drafting`, `Verified`, and `Packaged`.
4. FR-4: The system must show those user-facing states on both mobile and web.
5. FR-5: The system must persist stage progress, timestamps, retries, and errors so progress is durable and resumable.
6. FR-6: The system must treat `Verified` as AI/system verification complete and ready for human review, not final reviewer approval.
7. FR-7: The system must keep human review outcomes separate as `approved` or `rejected`.
8. FR-8: The system must provide a concrete packaging stage that assembles final deliverables or an exportable bundle.
9. FR-9: The system must support retrying failed stages without redoing already-completed work unnecessarily.
10. FR-10: The system must expose enough progress metadata for polling or refresh-driven UIs.

## Non-Goals
- Replacing the existing reviewer approval workflow with full automation
- Redesigning the underlying document review criteria
- Changing regulatory semantics so AI verification counts as certifier sign-off
- Building real-time streaming tokens or live websocket infrastructure if polling is sufficient
- Reworking the evidence lineage model beyond what is needed for progress visibility
- Expanding scope into bulk multi-session queue management for admins

## Technical Considerations
- Current code already has a richer status vocabulary than the Prisma comment suggests. `lib/session-status.ts` includes `capture_complete`, `analysis_complete`, `documents_generated`, `verified`, `approved`, `rejected`, `failed`, and `cancelled`, while `CaptureSession`'s schema comment is outdated.
- Current implementation sets session status to `verified` in `lib/ai/verify.ts`, which confirms that `verified` is presently an AI/system verification state.
- Human review is separate: `app/api/sessions/[id]/review/route.ts` moves documents to `approved` or `rejected` and only then promotes the session to `approved` or `rejected`.
- Current post-capture work is still largely synchronous across `app/api/mobile/analyze-session/route.ts`, `app/api/mobile/generate/route.ts`, and `lib/ai/pipeline.ts`. This feature should consolidate around a true background execution path rather than adding another synchronous branch.
- The reviewer UI on `app/(dashboard)/sessions/[id]/page.tsx` already understands review readiness and blocker states. The new progress model should complement that page, not replace it.
- Packaging should be defined concretely during implementation: likely an assembled document/evidence export package, not just "all async work finished."

## Success Metrics
- Median time from capture completion to first visible user-facing state update is under 2 seconds.
- Users no longer experience blank or ambiguous waiting states after ending capture.
- Median time to `Drafting`, `Verified`, and `Packaged` is instrumented and visible.
- Stage-specific failure rate and retry success rate are measurable.
- Reviewer confusion about whether a session is "AI-verified" versus "human-approved" decreases, as measured by usability feedback or reduced support/debug friction.

## Open Questions
- What concrete artifact defines `Packaged` in v1: export ZIP, PDF bundle, evidence pack metadata, or all of the above?
- Should background execution use an existing platform primitive or a lightweight DB-backed worker loop inside the app first?
- Should users be able to manually trigger "retry failed stage" from the UI in v1, or is operator/developer retry enough initially?
- Should `Captured` remain visible until drafting actually starts, or should the UI show a short-lived intermediate like "Queued" internally but not expose it to users?
- Are there any compliance or customer-facing reasons to rename `Verified` in the UI to `AI Verified` or `Ready for Review` even if the backend keeps `verified`?

[/PRD]
