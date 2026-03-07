# Pickup Prompt: In-Product Executive Demo Flow

## Session Goal

Implement the PRD at:
- `tasks/prd-in-product-executive-demo.md`

This is a desktop-app feature inside the existing Next.js product. Do not build a separate prototype or deck-like app. The goal is a guided executive demo flow that lives within the product and can take a buyer from pain to proof to ROI in 10-12 minutes with minimal narration.

## What To Read First

1. `tasks/prd-in-product-executive-demo.md`
2. `specs/008-heico-executive-demo.md`
3. Existing demo-relevant pages and components in the web app:
   - `app/(dashboard)/sessions/[id]/page.tsx`
   - `app/(dashboard)/parts/[id]/page.tsx`
   - `app/(dashboard)/sessions/page.tsx`
   - `components/evidence-chain-drawer.tsx`
   - any existing sidebar/navigation components

## Important Context

- The app already has seeded demo content, evidence-chain UI, session detail pages, part detail pages, structured document rendering, and verification states.
- The new feature should be a seeded-first guided path with optional branching into normal product pages.
- The user explicitly wants this to feel like it is "within the product, maybe with tool tips."
- The primary users are both the presenter and the external buyer.
- The default flow should be linear with optional jump points.
- The experience should reduce explanation-heavy navigation during a live meeting.

## Product Intent

The demo should make the desktop app itself the sales asset. The narrative needs to be:
1. Pain
2. Proof
3. Trust
4. ROI

It should not feel like a separate microsite. Prefer framing existing product pages and components with guided overlays, contextual callouts, progress UI, and seeded-first state.

## Constraints

- Reuse existing product surfaces where possible instead of duplicating pages.
- Keep overlays additive so normal app UX is not damaged.
- Prefer stable seeded demo state by default.
- Allow optional branching into live/normal product pages and preserve return-to-demo context.
- Keep the flow reliable and fast enough for customer meetings.
- Do not revert unrelated working tree changes.

## Suggested Execution Order

1. Add the executive demo route and entry point.
2. Build a reusable guided demo shell with step state, progress, next/back, jump points, and reset.
3. Implement the narrative steps using existing pages/components where possible.
4. Add seeded-first hybrid demo state and return-to-flow behavior when branching to live pages.
5. Add the ROI step and presenter aids/tooltips.
6. Validate the full end-to-end experience in browser.

## Quality Gates

These must pass:
- `npm run build`
- `npm run lint`

For UI work, also verify visually in browser that:
- the full guided flow works end to end
- overlays and tooltips do not block required interaction
- branching into a live page and returning to the guided flow preserves context

## Deliverable

Implement as much of the PRD as possible end-to-end in one session, then report:
- what stories were completed
- what remains
- what was verified
- any product or implementation tradeoffs made
