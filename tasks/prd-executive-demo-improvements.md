# PRD: AeroTrack Executive Demo Flow Improvements

## Overview

The AeroTrack executive demo is a 7-step guided presentation at `/demo` designed to pitch AeroTrack's value to aerospace executives (primary target: HEICO CEO). The demo currently tells a solid story but several steps are underdeveloped — Step 1 lacks the most powerful industry stats, Step 3 only shows one FAA form instead of three, Step 4 uses static cards instead of dramatic visual timelines, Step 6 only calculates labor savings, and the closing is weak.

This PRD covers 7 improvements that transform the demo from "good product walkthrough" into "CEO leaves the room saying I need this."

**Primary file:** `app/(dashboard)/demo/page.tsx` (~53KB, contains all 7 step components inline)
**Supporting files:** `components/documents/form-8130-preview.tsx`, `app/glasses-demo/page.tsx` (contains Form 337 and 8010-4 renderers to reference), `prisma/seed.ts` (component data)
**Tech stack:** Next.js 15, Tailwind 4, shadcn/ui, TypeScript

## Goals

- Make Step 1 emotionally powerful with the strongest industry stats (McKinsey, AOG Technics, workforce crisis)
- Show all 3 FAA forms (8130-3, 337, 8010-4) in Step 3 with the AI pattern-detection wow moment
- Replace static Step 4 cards with animated side-by-side lifecycle timelines fetching real data
- Expand Step 6 ROI calculator to show the full $25M+ value story (not just labor savings)
- Add a strong closing statement to Step 7
- Fill presenter notes gaps across all steps with research-backed talking points
- Maintain visual consistency with existing shadcn/ui design patterns and the overall app aesthetic

## Quality Gates

These commands must pass for every user story:
- `npx next lint` — Linting
- `npx next build` — Type checking and build validation

For major visual stories (US-001, US-004, US-005, US-006, US-008), also:
- Verify in dev browser that the step renders correctly at 1920×1080 and 1440×900
- Verify animations play smoothly without jank
- Verify responsive layout doesn't break at common breakpoints

## User Stories

### US-001: Supercharge Step 1 — New Stats and Redesigned Layout

**Description:** As a presenter, I want Step 1 ("The Problem") to hit harder with the most powerful industry statistics so that the audience feels the pain before seeing the solution.

**Acceptance Criteria:**
- [ ] The existing 4 animated counters (2.4M hours, $180M, 15% errors, 12 forms) are preserved but the layout is redesigned for more visual impact
- [ ] A new animated counter is added: "60%" with label "of a mechanic's day spent on paperwork, not fixing airplanes" (source: McKinsey) — this should be the most visually prominent stat on the page
- [ ] A new stat card is added: "80% of certified mechanics will retire within 6 years" with a workforce crisis narrative
- [ ] A new callout card is added for the AOG Technics scandal: "In 2024, one company sold parts with forged 8130-3 tags to Delta, United, American, and Southwest. 120+ aircraft were grounded." styled as a red/danger alert
- [ ] A new stat is added: "$10,000–$150,000 per hour — the cost of a grounded aircraft due to documentation failure"
- [ ] The overall layout uses stronger typography hierarchy — the headline stat (60%) should be large and unmissable, with supporting stats in a grid below
- [ ] All animated counters use the existing ease-out cubic animation pattern (2-second duration, 60 steps)
- [ ] The dark gradient background (`from-slate-900 to-slate-800`) is preserved for contrast
- [ ] The 3 existing warning callouts at the bottom are preserved or integrated into the new layout

### US-002: Enrich Presenter Notes Across All Steps

**Description:** As a presenter, I want complete, research-backed presenter notes for every step so that I can confidently answer any question the audience throws at me.

**Acceptance Criteria:**
- [ ] Step 1 (problem) notes add McKinsey source citation: "McKinsey, 'The Generative AI Opportunity in Airline Maintenance', 2024"
- [ ] Step 1 notes add Q&A: Q: "What about the AOG Technics scandal?" A: "In 2024, AOG Technics sold thousands of parts with forged 8130-3 documentation to major airlines. 120+ aircraft were grounded. This happened because there's no automated way to verify documentation at the source — exactly what AeroTrack solves."
- [ ] Step 1 notes add workforce crisis point: "80% of certified mechanics will retire within 6 years (ATEC). Average mechanic age is 51. When they leave, their tribal knowledge leaves with them. AeroTrack captures that knowledge as they work."
- [ ] Step 3 (documents) notes add legal positioning Q&A: Q: "Is AI-generated documentation legally valid?" A: "Yes. FAA Advisory Circular AC 120-78B explicitly allows electronic signatures and records. AeroTrack follows the 'AI-assisted, human-approved' model — the AI drafts the form, a certified A&P/IA reviews and signs. This is fully compliant."
- [ ] Step 4 (thread) notes add stat: "Industry average: only 38% of components have a complete documentation trail. The other 62% have gaps like Component B."
- [ ] Step 6 (opportunity) notes update pricing Q&A answer from "$X per overhaul or $Y per shop per month" to "We're finalizing pricing tiers — we'll have specifics for the proposal. Our model is designed so the ROI is obvious within the first quarter."
- [ ] Steps 1, 3, 4, 5, and 6 notes each add a EASA 2028 mandate Q&A: Q: "What about European regulations?" A: "By 2028, EASA requires all Part 145 organizations to have full digital compliance. This isn't optional — it's a hard mandate. Companies that adopt digital documentation now will be ahead; companies that wait will face rushed, expensive implementations."

### US-003: Add Narrative Transition Card Between Step 3 and Step 4

**Description:** As a presenter, I want a narrative bridge after the 8130-3 generates in Step 3 so that the audience understands the connection between document generation and the digital thread comparison in Step 4.

**Acceptance Criteria:**
- [ ] After the form animation completes in Step 3, a callout card fades in below the form (above the existing time-saved counter and action buttons)
- [ ] The card text reads: "That form just created an unbreakable link in this component's chain of custody. Every measurement, every photo, every signature — cryptographically sealed. Now let's see what happens when that chain is broken."
- [ ] The card is styled as an insight callout: indigo/purple left border, light background, subtle icon (Link or Chain icon from lucide-react)
- [ ] The card animates in with a fade + slight upward slide (opacity 0→1, translateY 8px→0, duration 500ms, 400ms delay after form animation completes)
- [ ] The card does not appear until the form animation is fully complete (uses the existing `onAnimationComplete` callback or `animationDone` ref)

### US-004: Add Three-Form Tabbed Interface to Step 3

**Description:** As a presenter, I want Step 3 to generate all three FAA forms (8130-3, 337, 8010-4) in a tabbed interface so that the audience sees AeroTrack's full documentation intelligence — especially the AI-detected fleet pattern in the 8010-4.

**Acceptance Criteria:**
- [ ] After clicking "Generate 8130-3", a tabbed interface appears with 3 tabs instead of just the 8130-3 form
- [ ] Tab 1: "FAA 8130-3" with subtitle "Release Certificate" — shows the existing Form8130Preview component with existing MOCK_8130 data
- [ ] Tab 2: "FAA 337" with subtitle "Major Repair" — renders a Form 337 using the same data and rendering approach as the glasses demo's `Form337` component in `app/glasses-demo/page.tsx`
- [ ] Tab 3: "FAA 8010-4" with subtitle "Defect Report" — renders a Form 8010-4 using the same data and rendering approach as the glasses demo's `Form8010` component in `app/glasses-demo/page.tsx`
- [ ] The active tab is indicated with a blue bottom border (matching the glasses demo tab styling)
- [ ] Completed/animated tabs show a green checkmark next to their label
- [ ] Each form animates its rows when first selected (staggered row animation, ~350ms per row with 400ms total animation time), using the existing `formRowIn` keyframe pattern from the glasses demo
- [ ] Forms only animate once — switching back to an already-viewed tab shows the form immediately without re-animating (use an `animatedForms` Set, matching the glasses demo pattern)
- [ ] The 8010-4 tab includes a special callout card above the form: "AI DETECTED: Fleet-wide seal degradation pattern — 881700-4022 seals on units >7,500 hrs show accelerated failure rates" styled with an amber/warning background and a Sparkles or Brain icon
- [ ] Each form includes source attribution annotations showing where field data originated (e.g., "← QR SCAN", "← VOICE TRANSCRIPT", "← MEASUREMENT"), matching the glasses demo's annotation pattern
- [ ] The "Generate 8130-3" button label updates to "Generate FAA Documentation" to reflect that multiple forms are generated
- [ ] The existing PDF download button and "See What This Replaced" comparison are preserved below the tabbed form area

### US-005: Rebuild Step 4 — Animated Side-by-Side Lifecycle Timelines

**Description:** As a presenter, I want Step 4 to show two component lifecycles as animated visual timelines building simultaneously so that the audience watches one perfect story and one broken story unfold side by side.

**Acceptance Criteria:**
- [ ] The existing static cards with colored dots are replaced with two side-by-side vertical timeline visualizations
- [ ] On component mount, the step fetches lifecycle events for both components via API calls: `GET /api/components?serialNumber=SN-2019-07842` and `GET /api/components?serialNumber=SN-2018-06231` (or equivalent endpoint that returns the component with its lifecycle events)
- [ ] If the API endpoint doesn't return lifecycle events inline, a follow-up call to `GET /api/components/{id}` fetches the full component with events (check existing API routes for the correct shape)
- [ ] Component A (SN-2019-07842, "The Perfect History") renders all lifecycle events as a vertical timeline with: event type icon, event title, date, facility name, and a green left border/connector line
- [ ] Component B (SN-2018-06231, "The Gap") renders its events the same way BUT includes a dramatic gap section between the removal event (Nov 2020) and the next event (Jan 2022)
- [ ] The gap section is styled as a pulsing red zone: dashed red border, red background with low opacity (bg-red-500/10), pulsing animation (CSS `animate-pulse` or custom keyframe), with text: "14 MONTHS — NO RECORDS" and subtext: "Where was this part? Was it tampered with? Nobody knows."
- [ ] Both timelines animate simultaneously: events appear one by one with staggered timing (~200ms apart), fading in from left (opacity 0→1, translateX -12px→0)
- [ ] Component A header shows: P/N, S/N, description, and a large "94%" trace score badge in green
- [ ] Component B header shows: P/N, S/N, description, and a large "67%" trace score badge in amber/red
- [ ] Below both timelines, an insight box states: "Industry average: Only 38% of components have a complete documentation trail. The rest have gaps like Component B. AeroTrack captures everything automatically — gaps become impossible."
- [ ] "View Digital Thread →" links are preserved below each timeline, linking to `/parts/{componentId}` (opening in new tab)
- [ ] The narration card at the top of the step is preserved with updated styling consistent with other steps
- [ ] Layout is responsive: side-by-side on desktop (md+ breakpoint), stacked on mobile

### US-006: Step 4 — Event Expansion with Full Detail

**Description:** As a presenter, I want to click any event on either timeline to expand it and show the full evidence so that the audience sees this is real data, not a mockup.

**Acceptance Criteria:**
- [ ] Clicking any event node on either timeline expands it to show full details below the event title
- [ ] Only one event can be expanded at a time (clicking a new event collapses the previous one)
- [ ] Expanded event shows the following fields (if present in the data): full description, performer name and certifications, work order reference, CMM reference
- [ ] Expanded event shows an evidence section with counts and type labels (e.g., "📷 3 photos · 🎤 1 voice note · 📐 2 measurements · 📄 1 document scan")
- [ ] If the event has associated `GeneratedDocument` records, they are listed with their document type and a small document icon
- [ ] Expanded event shows the SHA-256 hash (truncated to first 16 characters + "...") with a "Tamper-evident record" label in muted text
- [ ] The expansion animates smoothly: height auto-transition with overflow hidden, content fades in (200ms)
- [ ] The expansion uses a light background (bg-slate-50 or bg-white with border) to visually separate from the timeline
- [ ] If an event has no evidence or additional details, it still expands but shows "Core lifecycle record" with just the description and date

### US-007: Broaden Step 6 ROI Calculator with New Categories

**Description:** As a presenter, I want the ROI calculator to show the full value story beyond labor savings — including AOG avoidance, audit cost reduction, counterfeit risk reduction, and aircraft value preservation — so that the 5-year value reflects the true $25M+ opportunity.

**Acceptance Criteria:**
- [ ] The existing 4 input fields (MRO shops, parts/year, minutes/part, hourly rate) are preserved and work as before
- [ ] 4 new input fields are added in an "Advanced Inputs" section below the existing inputs, each with a label, description tooltip, and editable number input:
  - "AOG Events Avoided / Year" (default: 10, tooltip: "Aircraft-on-ground events prevented by better documentation. Each AOG costs $10K-$150K/hour.")
  - "Avg AOG Cost ($)" (default: 150000, tooltip: "Average cost per AOG event including lost revenue, rebooking, and maintenance expediting.")
  - "Annual Audit Prep Cost ($)" (default: 500000, tooltip: "Current cost of audit preparation including staff time, document retrieval, and compliance review.")
  - "Fleet Documentation Improvement (%)" (default: 15, tooltip: "Percentage improvement in fleet documentation completeness, reducing counterfeit risk and preserving aircraft value.")
- [ ] 4 new output cards are added to the results grid:
  - "AOG Cost Avoidance" = AOG events × avg AOG cost (default: $1.5M/year), green background
  - "Audit Cost Reduction" = audit prep cost × 0.60 (60% reduction, default: $300K/year), green background
  - "Counterfeit Risk Reduction" = parts/year × 0.02 × 5000 × (fleet doc improvement / 100) (default: ~$127K/year), blue background
  - "Aircraft Value Preservation" = shops × 3 × 1000000 × (fleet doc improvement / 100) (default: ~$27.9M total fleet value preserved), blue background
- [ ] The existing output cards (hours saved, labor cost, error rate, audit prep time, thread coverage) are preserved
- [ ] The 5-year value card is updated to sum: (labor cost savings + AOG avoidance + audit reduction + counterfeit reduction) × 5 + aircraft value preservation
- [ ] The 5-year value should display as $25M+ with the default inputs (verify the math produces this range)
- [ ] A visual breakdown section below the output cards shows a horizontal stacked bar chart (or simple colored segments) showing the contribution of each value category to the total
- [ ] Each output card and breakdown segment is color-coded by category for visual clarity
- [ ] All calculations update in real-time as any input changes (no API calls, all client-side)
- [ ] The bottom insight box updates to reflect the new total: "At [X] shops, AeroTrack delivers $[Y]M+ in total value over 5 years — [Z] FTEs redeployed, [W] AOG events avoided, and complete audit readiness."

### US-008: Add Strong Closing Statement to Step 7

**Description:** As a presenter, I want Step 7 ("Your Turn") to open with a powerful closing statement above the exploration links so that the demo ends on a high note before free exploration begins.

**Acceptance Criteria:**
- [ ] A visually prominent closing card appears above the existing navigation links in Step 7
- [ ] The card contains the statement: "The aerospace industry is moving to digital thread. The question isn't whether — it's who gets there first."
- [ ] Below the statement, a secondary line reads: "Everything you've seen is live. This isn't a slide deck — it's a working system."
- [ ] The card is styled as a hero-like element: centered text, larger font for the main statement (text-xl or text-2xl, font-semibold), muted color for the secondary line, generous padding, subtle top/bottom borders or a gradient background that distinguishes it from the navigation cards below
- [ ] The card does NOT include any interactive buttons or CTAs — it is purely a closing statement
- [ ] The existing "Your Turn" heading and "Explore the app freely" subtitle are preserved below the closing card
- [ ] The existing 5 navigation cards are preserved and unchanged

## Functional Requirements

- FR-1: All new animated counters in Step 1 must use the same easing function and duration as the existing counters (cubic ease-out, 2 seconds, 60 steps) for visual consistency
- FR-2: The Step 3 tabbed interface must track which tabs have been animated using a `Set<string>` (matching the glasses demo pattern) to prevent re-animation on tab switch
- FR-3: Step 4 must gracefully handle API failures — if lifecycle events can't be fetched, fall back to showing the existing static card layout with an error-free experience
- FR-4: Step 4 timeline animation must start when the step becomes active (user navigates to Step 4), not on page load
- FR-5: All new UI components must use shadcn/ui primitives (Card, Badge, Button, Tabs, Tooltip) where applicable
- FR-6: The Step 6 ROI calculator must never show NaN or negative numbers — all inputs should be clamped to 0 minimum
- FR-7: The narrative transition card in Step 3 must only appear after the form animation is fully complete
- FR-8: Step 4 event expansion must not cause layout shift in the other timeline column — use a fixed-width or percentage-based column layout
- FR-9: All presenter notes content must be plain text (no markdown or HTML) as the existing rendering uses simple `<p>` and `<li>` elements
- FR-10: The Form 337 and Form 8010-4 data in Step 3 must exactly match the hardcoded data in `app/glasses-demo/page.tsx` for consistency across the demo

## Non-Goals (Out of Scope)

- No new API routes — use existing endpoints only (or fall back to hardcoded data if endpoints don't exist)
- No changes to the glasses demo (`app/glasses-demo/page.tsx`) — only reference its code patterns and data
- No changes to the seed data (`prisma/seed.ts`) — work with existing seeded components
- No new step added to the demo — it stays at 7 steps
- No interactive buttons or functional CTAs in the Step 7 closing card
- No changes to the demo landing page or entry points
- No mobile-specific optimizations beyond basic responsive layout
- No changes to the progress bar, step dots, elapsed timer, or bottom navigation bar (except updating step count if needed)
- No PDF download functionality changes
- No ecosystem/network visualization step

## Technical Considerations

- The main demo file (`app/(dashboard)/demo/page.tsx`) is already ~53KB. Consider extracting new step components (especially Step 4 with its timeline logic) into separate files under `components/demo/` to keep the file manageable
- The Form 337 and 8010-4 renderers in the glasses demo are defined inline (~200-300 lines each). For Step 3, extract them into reusable components under `components/documents/` (e.g., `form-337-preview.tsx`, `form-8010-preview.tsx`)
- Step 4's API calls should use `useEffect` with the step being active as a dependency — don't fetch data for all steps on initial page load
- The ROI calculator's new inputs should be in a collapsible "Advanced Inputs" section (using shadcn `Collapsible` or a simple toggle) so the default view isn't overwhelming
- Use CSS `@keyframes` for the Step 4 gap pulsing animation rather than JS intervals to avoid performance issues
- The stacked bar chart in Step 6 can be built with simple Tailwind `flex` and percentage widths — no charting library needed

## Success Metrics

- Demo narrative arc is cohesive: Problem (Step 1) → Solution (Steps 2-3) → Proof (Steps 4-5) → Value (Step 6) → Close (Step 7)
- Step 1 creates emotional impact with the 60% stat and AOG Technics scandal
- Step 3's 8010-4 form creates a "wow moment" when the AI fleet pattern detection is revealed
- Step 4's gap visualization makes the abstract concept of "documentation gap" viscerally clear
- Step 6 shows $25M+ 5-year value with default inputs (vs. current ~$4M)
- Presenter notes cover the top 10 most likely executive questions with research-backed answers
- All animations are smooth (no jank at 60fps)
- The full demo runs without errors from Step 1 through Step 7

## Open Questions

- Does the existing `/api/components/{id}` endpoint return lifecycle events with evidence details inline, or are separate API calls needed? (If separate calls are needed, the Step 4 implementation may need to make additional fetches)
- What is the exact data shape of lifecycle events returned by the API? (The seed file shows the structure, but the API response shape may differ)
- Should the Form 337 and 8010-4 components extracted from the glasses demo be exact copies or simplified versions? (PRD assumes exact copies for data consistency)
