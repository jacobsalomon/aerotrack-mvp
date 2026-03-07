# PRD: In-Product Executive Demo Flow

## Overview

Add a guided executive demo flow directly inside the desktop app so a founder, salesperson, or external buyer can move through a clear 10-12 minute story without explanation-heavy navigation. The flow should live within the product, use a seeded-first guided path, and allow optional jumps into real product pages when useful.

This feature builds on the existing HEICO demo concept in `specs/008-heico-executive-demo.md` and should make the desktop app itself the main sales asset. The core narrative is: pain, proof, trust, and ROI.

## Goals

- Let a presenter run a polished executive demo in one guided path
- Let a buyer understand the product with minimal live narration
- Tie pain, proof, and ROI together in a single session
- Keep the demo inside the existing product rather than as a separate prototype
- Preserve flexibility so the presenter can branch into live product pages when useful
- Make the flow reliable and fast enough for customer-facing meetings

## Quality Gates

These commands must pass for every user story:
- `npm run build` - Production build must succeed
- `npm run lint` - Linting must succeed

For UI stories, also include:
- Verify in browser visually that the guided flow, overlays, navigation, and responsive states work as intended

## User Stories

### US-001: Add Demo Entry Point
**Description:** As a presenter or buyer, I want a clear in-product entry point for the executive demo so that I can start the guided flow without hunting through the app.

**Acceptance Criteria:**
- [ ] Add a dedicated executive demo route within the desktop app
- [ ] Add a visible entry point from existing in-product navigation or landing surfaces
- [ ] The entry screen explains the purpose of the demo in one short value proposition
- [ ] The entry screen offers a primary CTA to start the guided demo
- [ ] The entry screen offers secondary jump options for direct exploration of key product areas
- [ ] The route works without requiring custom URL parameters to initialize

### US-002: Build Guided Demo Shell
**Description:** As a presenter, I want a reusable guided demo shell so that the story has a clear structure and pacing.

**Acceptance Criteria:**
- [ ] The demo shell displays current step, total steps, and progress
- [ ] The shell supports `Back`, `Next`, and exit actions
- [ ] The shell supports optional jump links to major demo sections
- [ ] The shell can render contextual tooltips, callouts, or narration cards without obscuring core content
- [ ] The shell preserves the current step when navigating within the guided flow
- [ ] The shell supports resetting the demo to the first step

### US-003: Implement Pain-to-Proof Narrative Steps
**Description:** As a buyer, I want the demo to guide me through a coherent business story so that I understand why the product matters before seeing details.

**Acceptance Criteria:**
- [ ] The guided flow includes a defined sequence that covers pain, proof, trust, and ROI
- [ ] Each step includes concise on-screen guidance that reduces the need for presenter narration
- [ ] Each step has a single primary message and does not overload the screen with unrelated content
- [ ] The first step explains the maintenance documentation pain and stakes in executive-friendly language
- [ ] At least one step demonstrates evidence-backed document generation
- [ ] At least one step demonstrates discrepancy or gap detection
- [ ] At least one step demonstrates digital thread or provenance value
- [ ] The final business step demonstrates ROI or executive impact

### US-004: Wire Guided Steps to Existing Product Surfaces
**Description:** As a presenter, I want the demo steps to reuse real product surfaces where possible so that the experience feels like the actual product, not a slideshow.

**Acceptance Criteria:**
- [ ] Guided steps can frame and highlight existing app pages or components rather than duplicating them
- [ ] The flow can open relevant existing product views for sessions, parts, verification, and evidence/provenance
- [ ] The flow visually highlights the exact area or component the user should focus on
- [ ] Existing pages remain usable when opened from the demo flow
- [ ] Returning from an opened product view preserves demo step context
- [ ] The demo does not require duplicating entire existing dashboards or detail pages unless necessary

### US-005: Add Seeded-First Hybrid Demo Data Mode
**Description:** As a presenter, I want the guided path to default to stable seeded scenarios while still allowing optional jumps into real pages so that the demo is reliable but flexible.

**Acceptance Criteria:**
- [ ] The guided demo defaults to seeded scenarios and expected outputs
- [ ] The guided demo can branch into normal product pages when explicitly requested by the presenter
- [ ] Demo-specific seeded content remains available even if normal app data changes
- [ ] Any branch into live product pages is clearly distinguishable from the seeded guided path
- [ ] The user can return from a live page back into the guided flow without losing demo progress
- [ ] The seeded path avoids runtime dependence on unstable or incomplete live data

### US-006: Add Executive-Friendly ROI Step
**Description:** As a buyer, I want to see the business impact inside the demo so that I can connect product features to operational and financial value.

**Acceptance Criteria:**
- [ ] The guided flow includes a dedicated ROI or executive impact step
- [ ] The ROI step shows concrete value drivers relevant to MRO, lessor, or OEM buyers
- [ ] The ROI step supports a small set of editable assumptions
- [ ] Updating assumptions recalculates the displayed impact without a page reload
- [ ] The ROI step avoids requiring spreadsheet-like interaction to understand the result
- [ ] The default copy and inputs are suitable for a HEICO-style executive meeting

### US-007: Add Presenter Aids and Reduced-Narration UI
**Description:** As a presenter, I want built-in guidance so that I can run the meeting smoothly without memorizing every transition.

**Acceptance Criteria:**
- [ ] Each guided step can show short presenter-facing hints or tooltips
- [ ] Presenter aids can be hidden for buyer-led exploration
- [ ] Presenter hints do not appear by default as dense blocks of text
- [ ] The UI can explain why the current screen matters in one or two sentences
- [ ] The demo can be understood even if the presenter says very little
- [ ] The system avoids modal interruptions that break the flow unnecessarily

### US-008: Add Demo Reliability, Reset, and Fast Paths
**Description:** As a presenter, I want the demo to be dependable in meetings so that I do not get stuck on slow loads or broken state.

**Acceptance Criteria:**
- [ ] Demo-critical content loads predictably and avoids unnecessary waiting states
- [ ] The guided flow supports a one-click reset to a known clean starting state
- [ ] The flow degrades gracefully if a linked live page is unavailable
- [ ] The demo can be completed end-to-end without requiring manual data setup during the meeting
- [ ] The UI provides clear recovery actions if a step cannot be rendered as expected
- [ ] Demo-critical seeded assets are available locally within the app codebase or seeded data path

### US-009: Validate End-to-End Demo Experience in Browser
**Description:** As the product team, I want the executive demo validated as a real customer-facing flow so that it is trustworthy for meetings.

**Acceptance Criteria:**
- [ ] Verify the full guided flow in a browser from entry to ROI step
- [ ] Verify linear navigation, jump navigation, and return-to-flow behavior
- [ ] Verify overlays, tooltips, and highlighted regions do not block required interactions
- [ ] Verify the seeded path works consistently after refresh
- [ ] Verify optional branching into live product pages and returning back to the guided flow
- [ ] Verify the demo remains understandable without verbal explanation-heavy guidance

## Functional Requirements

1. FR-1: The system must provide a dedicated in-product executive demo route.
2. FR-2: The system must provide a seeded-first guided flow designed for a 10-12 minute meeting.
3. FR-3: The system must support a linear default path with optional jump points to major sections.
4. FR-4: The system must display persistent demo progress and current step context.
5. FR-5: The system must provide concise step-level guidance through tooltips, callouts, or narration cards.
6. FR-6: The system must reuse existing product views where practical instead of recreating static demo-only screens.
7. FR-7: The system must support highlighting or focusing specific product regions relevant to the current step.
8. FR-8: The system must default to stable seeded demo scenarios and outputs.
9. FR-9: The system must allow optional branching into normal product pages from the guided flow.
10. FR-10: The system must preserve demo progress when users branch into and return from linked product pages.
11. FR-11: The system must include at least one proof step for evidence-backed document generation.
12. FR-12: The system must include at least one proof step for exception, discrepancy, or gap detection.
13. FR-13: The system must include at least one trust step for digital thread, provenance, or evidence chain review.
14. FR-14: The system must include an executive impact step with editable ROI assumptions.
15. FR-15: The system must provide a reset mechanism that returns the demo to a known start state.
16. FR-16: The system must degrade gracefully when optional live pages are unavailable or incomplete.
17. FR-17: The system must avoid requiring external setup, special data imports, or manual presenter prep before each run.
18. FR-18: The system must be visually understandable by an external buyer with minimal narration.

## Non-Goals

- Building a separate standalone demo app outside the main desktop product
- Replacing the normal app navigation for non-demo users
- Building new core business workflows solely for the demo if existing flows can be framed and reused
- Supporting real-time analytics instrumentation or CRM integration in this phase
- Adding new mobile capture features as part of this PRD
- Building a full slide deck replacement with speaker notes as the primary interface
- Supporting every possible buyer persona with different demo scripts in v1

## Technical Considerations

- Reuse the existing HEICO demo narrative in `specs/008-heico-executive-demo.md` as the base content structure.
- Prefer implementation inside the existing Next.js app under the dashboard/app shell.
- Reuse existing pages and components where available, especially session detail, parts detail, verification outputs, digital thread, and evidence chain surfaces.
- Seeded demo scenarios should remain stable even if the underlying normal app data evolves.
- Guided overlays should be additive and removable, not hard-coded into normal product pages in a way that harms everyday UX.
- Preload or cache demo-critical data where practical to reduce customer-facing latency.
- Browser verification should include the exact narrative flow a presenter would use in a meeting.

## Success Metrics

- A presenter can run the default executive demo path in 10-12 minutes.
- A first-time buyer can identify the product's pain, proof, trust, and ROI story without heavy verbal guidance.
- The demo completes successfully from a clean state without manual setup.
- The flow reliably reaches seeded proof moments such as evidence-backed generation, discrepancy review, and provenance visibility.
- The guided path feels like the real product rather than a disconnected pitch artifact.
- The team can use the flow repeatedly in customer meetings with low risk of demo failure.

## Open Questions

- What exact copy should be used for the executive-facing pain and ROI claims in v1?
- Should presenter hints be visible only behind a toggle, or adapt automatically by user role?
- Which existing live pages are approved for branching in the first release?
- Should the ROI calculator be generic or have one default industry persona such as HEICO/MRO network?
- Should the executive demo route be visible to all users or only in a demo mode/navigation state?
- Do we want lightweight analytics for demo step completion in v1, or defer that entirely?
