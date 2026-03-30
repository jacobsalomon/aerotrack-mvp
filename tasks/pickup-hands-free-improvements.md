# Pickup: Hands-Free Improvements

## Branch
`feature/hands-free-improvements` (created from latest main)

## PRD
`tasks/prd-hands-free-improvements.md`

## What's Done
- PRD written and approved by Jake
- Feature branch created
- All files read and understood

## What Needs to Be Built

### US-001: Fix Review button contrast
**File:** `components/inspect/progress-bar.tsx` line 117
- Change the Review button from `variant="outline" className="border-white/20 text-white/70"` to something more visible
- Suggestion: `variant="secondary"` or add a brighter border/fill — just make it clearly visible against the dark bg-zinc-900 header

### US-002: Add glasses connection indicator
**File:** `components/inspect/progress-bar.tsx` — add near the recorder slot (line 110)
- Show a glasses icon (Glasses from lucide-react) next to the REC indicator
- Determine paired status: check if session's `pairingCode` is null AND `pairingCodeExpiresAt` is not null (meaning code was generated and claimed by a device)
- Need to add `pairingCodeExpiresAt` and `pairingCode` to the Prisma query in `app/(dashboard)/jobs/[id]/page.tsx` (currently not selected)
- Pass `glassesPaired: boolean` as a prop to ProgressBar
- Green dot = paired, gray = not paired

### US-003: Remove progress bar
**File:** `components/inspect/progress-bar.tsx` lines 123-177
- Remove the `<Progress>` component and its surrounding div (the entire "Progress row" section)
- Keep the completion count (`completedCount / summary.total (pct%)`) — move it into the top row next to the Review button
- Keep all other elements (WO#, config variant, photo count, unassigned badges)
- Move these remaining elements into the top header row in a clean layout

### US-004: Scrollable multi-page PDF viewer
**Files:** `components/library/pdf-viewer.tsx` and `app/(dashboard)/inspect/[sessionId]/inspect-workspace.tsx`

Current PdfViewer renders ONE page at a time via canvas. Need to:

1. Refactor PdfViewer to accept `totalPages` (or get it from the PDF) and render ALL pages in a scrollable container
2. Each page rendered as its own canvas, stacked vertically
3. Lazy-render pages outside viewport (IntersectionObserver or similar)
4. New prop: `scrollToPage?: number` — when active section changes, scroll to that page
5. Remove prev/next page buttons from inspect-workspace.tsx (lines 436-456)
6. Remove `pdfPageOffset` state from inspect-workspace.tsx
7. Pass `scrollToPage={activeSectionPages[0]}` to PdfViewer instead of `pageIndex`
8. Keep zoom controls (apply to all pages)

The PdfViewer is also used in `library/[templateId]/review/review-client.tsx` — that page uses single-page mode with its own page navigation, so either:
- Add a `mode="single" | "scroll"` prop, or
- Keep the old pageIndex prop working and add scrollToPage as an alternative

### US-005: Voice-driven pass/fail checks
**Server-side changes needed.** The audio extraction pipeline processes recordings and extracts measurements. Need to add pass/fail keyword detection.

Key files:
- `lib/audio/` — audio processing pipeline
- `app/api/inspect/sessions/[id]/glasses-capture/route.ts` — capture endpoint
- `components/inspect/inspection-recorder.tsx` — client recorder component

The pipeline needs to recognize patterns like:
- "item 5-50 passes" / "item five fifty pass"
- "item 5-50 fails" / "item five fifty fail"
- Match the callout number to an InspectionItem's `itemCallout` field
- Call the same completion endpoint used by the PASS/FAIL buttons

Technician MUST say the item number (no context-based matching — safety requirement from Jake).

### US-006: Auto-accept high-confidence measurements
**File:** `app/(dashboard)/inspect/[sessionId]/inspect-workspace.tsx`

Currently, measurement suggestions go through MeasurementToast. The change:
- In the workspace's suggestion handling (around line 320-346), check if `suggestion.match.confidence >= 0.9`
- If yes, call `handleAcceptSuggestion` automatically instead of adding to the suggestions array
- Show a brief non-blocking indicator (e.g., flash the item row green briefly)
- Below 90%, continue showing the toast as before

## Quality Gates
- `npx next lint` — must pass
- Verify in browser via `http://localhost:3000/aerovision/api/auth/dev-login?redirect=/aerovision/jobs/[id]`

## Jake's Preferences
- The source document could be any type (CMM, SOP, etc.) — don't call it "CMM" in the UI
- PDF on the LEFT, items on the RIGHT
- Sidebar auto-collapses on job pages
- Minimize clicks — hands-free via glasses is the goal
- Voice pass/fail requires explicit item number reference (safety)
- Auto-accept threshold: 90% confidence
- PDF: show full document, auto-scroll to section when tabs change

## Important Rules
- Run iCloud preflight before touching files: `/Users/jake/bin/repo-preflight-icloud.sh /Users/jake/dev/Primary_OIR/MVC/MVP/aerovision-mvp`
- Never push directly to main — always use PRs
- Dev login route at `/aerovision/api/auth/dev-login` for browser testing
- Branch protection is ON — must create PR and merge via `gh pr merge`

## After All Stories Complete
- Create PR with all changes
- Merge to production via `gh pr merge --squash --delete-branch`
