# PRD: AeroVision MVP UI Polish

## Overview
Implement UI polish fixes identified in a comprehensive visual review of the AeroVision MVP. The goal is to make every demo-critical happy path feel like a finished product -- clear navigation, no visual glitches, and users always know where they are and what to do next.

The sidebar and landing page have already been redesigned (grouped nav sections, mobile-responsive sidebar, reviewer-first landing page). This PRD covers the remaining fixes.

## Goals
- Fix all visible UI glitches that could break the illusion during a live demo
- Ensure every clickable element looks clickable (hover states, cursors)
- Ensure every page has clear wayfinding (breadcrumbs, back buttons, matching titles)
- Make secondary pages (knowledge, sessions, capture) feel polished, not empty

## Quality Gates

These verifications apply to every user story:
- Visual verification in browser using Chrome DevTools screenshots after each change
- App builds without errors (`npm run build` as a sanity check on final story)

## User Stories

### US-001: Fix truncated "CRITICAL" badge on dashboard table
**Status:** done

**Description:** As a demo viewer, I want severity badges to display fully so the dashboard looks polished, not broken.

**Acceptance Criteria:**
- [ ] The "CRITICAL" badge on the Hydraulic Accumulator row in the dashboard table is fully visible -- not clipped or truncated
- [ ] Status + severity badges on the same row wrap gracefully (stack vertically or use abbreviated text like "CRIT") when space is tight
- [ ] No other badges in the table are truncated at typical viewport widths (1280px+)
- [ ] Visually verified via browser screenshot

**Technical notes:** File is `app/(dashboard)/dashboard/page.tsx`. Look at how StatusBadge and SeverityBadge render in the Status column of the table. The issue is likely the table cell not allowing enough width or the badges being forced onto one line.

---

### US-002: Add hover states to all clickable table rows
**Status:** done

**Description:** As a user, I want table rows that link somewhere to look clickable so I know I can interact with them.

**Acceptance Criteria:**
- [ ] Dashboard parts table rows show a subtle background highlight on hover and `cursor-pointer`
- [ ] Sessions table rows show hover state and `cursor-pointer`
- [ ] Technicians table rows show hover state and `cursor-pointer` (if they link anywhere; if not, no cursor change)
- [ ] Hover color is subtle -- e.g., `bg-slate-50` or similar -- not jarring
- [ ] Visually verified via browser screenshot showing hover state

**Technical notes:** Files: `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/sessions/page.tsx`, `app/(dashboard)/technicians/page.tsx`. Likely just adding `hover:bg-slate-50 cursor-pointer transition-colors` to `<TableRow>` wrappers and making the whole row a `<Link>`.

---

### US-003: Add breadcrumbs and back navigation to capture workflow
**Status:** done

**Description:** As a user in the capture workflow, I want a clear way to go back so I don't feel trapped.

**Acceptance Criteria:**
- [ ] The capture work page (`/capture/work/[componentId]`) has a breadcrumb showing: Capture > [Part Number] (e.g., "Capture > 881700-1089")
- [ ] The "Capture" breadcrumb segment links back to `/capture`
- [ ] Breadcrumb style matches the existing breadcrumb on the parts detail page (`/parts/[id]`)
- [ ] Visually verified via browser screenshot

**Technical notes:** File: `app/(dashboard)/capture/work/[componentId]/page.tsx`. Reference the breadcrumb pattern from `app/(dashboard)/parts/[id]/page.tsx`.

---

### US-004: Add exit button to glasses demo
**Status:** done

**Description:** As a user watching the glasses demo, I want an unobtrusive way to exit back to the app.

**Acceptance Criteria:**
- [ ] A small "x Exit" button appears in the top-right corner of the glasses demo pre-start screen
- [ ] The button links to the landing page (`/`)
- [ ] The button uses a subtle style that doesn't clash with the green-on-black terminal aesthetic (e.g., white/30 text, no background, slight hover brightening)
- [ ] During the HUD simulation phase, the exit button remains visible but minimally intrusive
- [ ] In the doc-review phase (light theme), the exit button adapts to be visible against the light background
- [ ] Visually verified via browser screenshot

**Technical notes:** File: `app/glasses-demo/page.tsx`. The page has distinct phases -- pre-start (dark), HUD (dark green), generating, doc-review (light). The exit button styling may need to adapt per phase.

---

### US-005: Make page titles match sidebar labels exactly
**Status:** done

**Description:** As a user, I want the page title to match what I clicked in the sidebar so I always know where I am.

**Acceptance Criteria:**
- [ ] Dashboard page title reads "Parts Fleet" (not "Parts Fleet Overview") -- matching the sidebar label
- [ ] Capture page title reads "Capture" (not "AeroVision Capture") -- matching the sidebar label
- [ ] Sessions page title reads "Review Queue" (not "Capture Sessions") -- matching the new sidebar label
- [ ] Knowledge page title reads "Knowledge" (not "Knowledge Library") -- matching the new sidebar label
- [ ] Subtitles beneath titles can remain different/descriptive -- only the H1 title must match
- [ ] Visually verified via browser screenshot of each changed page

**Technical notes:** Files: `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/capture/page.tsx`, `app/(dashboard)/sessions/page.tsx`, `app/(dashboard)/knowledge/page.tsx`. Simple text changes in the H1 elements.

---

### US-006: Center capture page content vertically
**Status:** done

**Description:** As a user on the capture page, I want the content to feel intentionally centered rather than floating at the top of a mostly empty page.

**Acceptance Criteria:**
- [ ] The "Identify Component" card on `/capture` is vertically centered in the available viewport space (accounting for the sidebar and page header)
- [ ] The page no longer has a large empty area below the card
- [ ] The page still looks correct if the card content causes it to be taller than the viewport (should scroll, not overflow)
- [ ] Visually verified via browser screenshot

**Technical notes:** File: `app/(dashboard)/capture/page.tsx`. Likely wrap the card in a flex container with `min-h-[calc(100vh-8rem)]` and `items-center justify-center`.

---

### US-007: Add component info to sessions table
**Status:** done

**Description:** As a reviewer looking at the sessions list, I want to see which component each session is for so I can quickly find the one I need.

**Acceptance Criteria:**
- [ ] The sessions table has a "Component" column showing the part number and component description (e.g., "881700-1089 -- HPC-7 Hydraulic Pump")
- [ ] The column appears after "Status" and before "Technician"
- [ ] If a session has no linked component, the cell shows a dash
- [ ] Visually verified via browser screenshot

**Technical notes:** File: `app/(dashboard)/sessions/page.tsx`. The session data likely needs to be joined with component data -- check what the `/api/sessions` endpoint returns and whether it includes component info. May need to update the API to include component details.

---

### US-008: Truncate knowledge library cards
**Status:** done

**Description:** As a user scanning the knowledge library, I want to quickly scan entries without reading full paragraphs.

**Acceptance Criteria:**
- [ ] Knowledge card body text is truncated to 3 lines with a "Show more" button/link
- [ ] Clicking "Show more" expands the card to show the full text, with the button changing to "Show less"
- [ ] The expand/collapse is smooth (no jarring layout shift -- use CSS transition or max-height animation)
- [ ] Tags and author info below the text remain visible in both collapsed and expanded states
- [ ] Visually verified via browser screenshot in both states

**Technical notes:** File: `app/(dashboard)/knowledge/page.tsx`. Use CSS `line-clamp-3` for truncation and a React state toggle for expansion.

---

### US-009: Fix executive demo diagonal text clipping
**Status:** done

**Description:** As a user on the Executive Demo page, I want the hero text to be fully readable without being cut by the diagonal design element.

**Acceptance Criteria:**
- [ ] The hero text on `/demo` ("Take a buyer from paperwork pain to verified ROI without leaving the product.") is fully readable -- no letters bisected by the diagonal overlay
- [ ] The diagonal design element still provides visual interest but doesn't interfere with text legibility
- [ ] The fix works at viewport widths from 1024px to 1920px
- [ ] Visually verified via browser screenshot

**Technical notes:** File: `app/(dashboard)/demo/page.tsx`. The issue is likely a CSS clip-path or diagonal gradient overlay that intersects with the text. Options: adjust the diagonal angle/position, add text padding, or change the text color where it crosses the diagonal.

---

### US-010: Verify dashboard layout with new sidebar width
**Status:** done

**Description:** As a user, I want the main content area to properly account for the new wider sidebar (w-72 = 18rem instead of w-60 = 15rem).

**Acceptance Criteria:**
- [ ] The dashboard layout already uses `lg:ml-72` -- verify this renders correctly with no content overlap or gap
- [ ] All dashboard pages display properly with the new sidebar width at 1280px, 1440px, and 1920px viewports
- [ ] Visually verified via browser screenshot

**Technical notes:** The dashboard layout (`app/(dashboard)/layout.tsx`) has already been updated to `lg:ml-72`. This story is a verification pass -- confirm it works and fix any edge cases.

---

## Functional Requirements
- FR-1: All table rows that navigate to a detail page must have visible hover states and cursor-pointer
- FR-2: All pages inside the dashboard layout must have H1 titles that exactly match their sidebar label
- FR-3: Every page deeper than one level must have breadcrumb navigation back to its parent
- FR-4: The glasses demo must have an exit mechanism visible in all phases
- FR-5: Badge text must never be visually truncated at viewport widths of 1280px or wider
- FR-6: Knowledge library cards must truncate long text with an expand/collapse mechanism

## Non-Goals
- Redesigning the sidebar (already done)
- Redesigning the landing page (already done)
- Adding new features or functionality
- Changing the color scheme or design system
- Mobile responsive fixes beyond what's already in the new sidebar
- Fixing the analytics page interactivity (out of scope -- mock data is fine for demo)
- Adding tooltips to Forms Library buttons (low priority, skip for now)

## Technical Considerations
- Project uses Next.js 15 + Tailwind CSS 4 + shadcn/ui
- Sidebar width changed from `w-60` (15rem) to `w-72` (18rem) -- all layout calculations must account for this
- The `basePath` is `/aerovision-demo` -- all links use Next.js `<Link>` which auto-prepends this
- Dev server runs on `localhost:3000` -- pages are at `localhost:3000/aerovision-demo/*`
- Passcode to access the app is `2206`

## Success Metrics
- Every page in the demo happy path (landing -> dashboard -> part detail -> glasses demo -> capture -> integrity) looks polished with no visual glitches
- A non-technical viewer watching a demo would not notice any "prototype-ish" rough edges
- All clickable elements have appropriate hover feedback
- Users always know where they are (breadcrumbs + matching titles) and how to get back

## Open Questions
- None -- all design decisions resolved in clarifying questions
