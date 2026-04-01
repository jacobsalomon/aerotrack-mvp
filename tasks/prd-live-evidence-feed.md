# PRD: Live Evidence Feed in Inspection Workspace

## Overview

During active glasses-connected inspection, the mechanic sees no real-time evidence of what's being captured. Transcripts are processed server-side but invisible. Photos arrive as tiny thumbnails with no prominence. Video evidence isn't surfaced at all.

This feature transforms the right-side inspection checklist into a **live evidence feed** — transcript text rolls in as the mechanic speaks, photos appear at useful size within the items they belong to, and extracted measurements are highlighted when the AI identifies them. The goal is to build trust with AI-skeptical mechanics (~55 years old) by making the system feel like a transparent apprentice taking notes, not a black box.

**Design principle:** "The Good Apprentice" — evidence appears calmly within checklist items like someone writing on a clipboard. No AI jargon, no flashy animations. "You said:" not "AI transcribed." "Captured: 0.003"" not "AI detected measurement with 87% confidence."

## Goals

- Mechanic can glance at the screen during active capture and see what was just captured (transcript, photos, measurements)
- Evidence appears within the checklist item it belongs to, not in a separate panel
- Photos are matched to items via AI vision analysis (~2-5 sec)
- Transcript chunks arrive every ~10-15 seconds with server-side overlap for continuity
- Extracted measurements are highlighted within transcript text when identified
- Transcript chunks spanning multiple items are AI-split so evidence is associated with the correct item
- Unmatched evidence collects in a dedicated section at the bottom (mechanics jump around)
- No disruption to the existing PDF viewer on the left side
- All evidence is correctable — one tap to reassign or fix

## Quality Gates

These commands must pass for every user story:
- `npm run lint` — Linting (fast gate)

On the final story:
- `npx tsc --noEmit` — Full type check (slow, run with 5 min timeout)

For UI stories, also include:
- Verify in browser using dev server at localhost:3000

## User Stories

### US-001: Reduce Audio Chunk Interval with Server-Side Overlap

**Description:** As a mechanic, I want my speech to appear on screen within ~15 seconds so that I can verify the system is capturing what I'm saying while the work is fresh in my mind.

**Acceptance Criteria:**
- [ ] `CHUNK_INTERVAL_MS` in `inspection-recorder.tsx` reduced from 30000 to 15000
- [ ] Server-side audio processing handles overlap: the audio endpoint retains the last ~2 seconds of each chunk's audio and prepends it to the next chunk before transcription, ensuring no words are lost at boundaries
- [ ] The browser-side recorder remains simple — single MediaRecorder, no dual-recorder complexity
- [ ] Whisper deduplication handles any repeated words from the overlap (the previous-chunk prompt context already provides this)
- [ ] Measurement extraction still receives prior context (up to 2000 words of previous chunks)
- [ ] Verified: speaking a sentence that spans a chunk boundary is fully captured in at least one chunk's transcript

### US-002: Surface Transcript Text on the Active Inspection Item

**Description:** As a mechanic, I want to see what the system heard me say, displayed right on the checklist item I'm working on, so I can verify it's capturing accurately.

**Acceptance Criteria:**
- [ ] The `onTranscript` callback in `InspectionRecorder` is wired to workspace state
- [ ] When a new transcript chunk arrives, it appears as a text block within the currently expanded checklist item
- [ ] Transcript text is styled as a quote/note — readable, not dominant (e.g., muted text, slightly smaller font)
- [ ] Label reads "You said:" (not "Transcript" or "AI transcription")
- [ ] Multiple transcript chunks accumulate under the active item, newest at top
- [ ] Transcript text scrolls if it exceeds ~4 lines, does not push the item list off screen
- [ ] If no item is expanded, transcript appears in the "Unmatched" section (US-007)

### US-003: AI-Split Transcripts Across Multiple Items

**Description:** As a mechanic who talks about multiple items in a single breath, I want the system to split my transcript so each part lands on the correct checklist item.

**Acceptance Criteria:**
- [ ] After transcription, if the transcript references multiple inspection items, an AI call splits the text into segments — one per item
- [ ] Each segment is associated with the correct `inspectionItemId` based on content (parameter names, callout numbers, measurement values mentioned)
- [ ] The AI receives the full list of inspection item names/parameters as context for matching
- [ ] Split segments appear on their respective items in the checklist (not all on one item)
- [ ] If a portion of the transcript can't be matched to any item, it goes to the Unmatched section
- [ ] Optimize for accuracy over speed — use the best available model (see Technical Considerations)
- [ ] Splitting happens server-side in the audio processing pipeline, after transcription and correction but before returning the response

### US-004: Highlight Extracted Measurements in Transcript

**Description:** As a mechanic, I want measurements the system extracts from my speech to be visually highlighted so I can quickly verify they're correct.

**Acceptance Criteria:**
- [ ] When the audio endpoint returns `measurements` alongside `transcription`, the workspace identifies the measurement values within the transcript text
- [ ] Extracted measurement values are highlighted with a subtle background color (e.g., light blue/green pill) within the transcript text
- [ ] Each highlighted measurement shows the item it was matched to (e.g., "0.003" -> Bearing #4")
- [ ] If a measurement was auto-assigned to a different item than the one the transcript is displayed on, a small arrow or note indicates where it went
- [ ] Highlighting uses simple string matching against the `rawExcerpt` field from the measurement source — no complex NLP needed

### US-005: Enlarge Photo Thumbnails on Expanded Items

**Description:** As a mechanic, I want photos on the item I'm working on to be large enough to verify at a glance — not the current 14x14px tiles.

**Acceptance Criteria:**
- [ ] Photos on expanded items render at medium thumbnail size (~80-100px tall) in a horizontal scrollable row
- [ ] Photos on collapsed items remain as compact badges (photo count indicator, e.g., camera icon + count)
- [ ] Clicking a thumbnail still opens the full-size lightbox
- [ ] New photos arriving (via 3-second polling) animate in smoothly (fade-in, no layout jump)
- [ ] If more than 4 photos on an expanded item, the row scrolls horizontally with visible overflow indicators

### US-006: AI Vision Photo-to-Item Matching

**Description:** As a mechanic, I want photos I capture through the glasses to automatically appear on the right checklist item based on what's in the photo, so I don't have to manually assign each one.

**Acceptance Criteria:**
- [ ] When a glasses photo arrives at `/api/inspect/sessions/[id]/glasses-capture?type=photo` without an `itemId`, trigger AI vision analysis
- [ ] Vision analysis sends the photo to an AI model with the list of inspection item names/parameters as context
- [ ] Use the best available vision model — optimize for accuracy, not cost (see Technical Considerations)
- [ ] AI returns a best-guess `inspectionItemId` with a confidence indicator
- [ ] If confidence is above threshold, auto-assign the photo to that item and set `inspectionItemId` on the `CaptureEvidence` record
- [ ] If confidence is below threshold, photo goes to "Unmatched" section (US-007)
- [ ] Photo appears on the matched item within the next polling cycle (~3 seconds after AI analysis completes)
- [ ] Processing happens async — the glasses-capture endpoint returns immediately, vision matching runs in background
- [ ] Total latency from capture to display: under 8 seconds (capture -> upload -> vision analysis -> DB update -> next poll)

### US-007: Unmatched Evidence Section

**Description:** As a mechanic who jumps between items, I want evidence that can't be auto-matched to appear in a clear "Unmatched" section so nothing gets lost and I can assign it later.

**Acceptance Criteria:**
- [ ] A collapsible "Unmatched Evidence" section appears at the bottom of the inspection item list
- [ ] Shows count badge: "Unmatched (3)" — visible even when collapsed
- [ ] Contains: unmatched photos (medium thumbnails), unmatched transcript chunks, and unmatched measurements
- [ ] Each piece of evidence has an "Assign to..." button that shows a dropdown/picker of all inspection items
- [ ] Assigning an evidence item moves it from Unmatched to the target item immediately (optimistic UI update + API call)
- [ ] Section is not visible when there are zero unmatched items (no empty state clutter)
- [ ] Unmatched count is included in the existing progress polling response so it stays current

### US-008: Expanded Items Stay Expanded

**Description:** As a mechanic, I want items to stay expanded after I've opened them so I can glance back at recent captures without re-opening items.

**Acceptance Criteria:**
- [ ] Expanded items remain expanded until the mechanic manually collapses them
- [ ] Multiple items can be expanded simultaneously
- [ ] The `targetItemId` navigation still works — navigating to a new item expands it without collapsing others
- [ ] If more than 3 items are expanded and the list is long, the newest expanded item scrolls into view smoothly
- [ ] No auto-collapse behavior on any timer or event

### US-009: Live Evidence Polling on Review Page

**Description:** As someone watching the review page while a job is in progress, I want evidence to appear without manually refreshing.

**Acceptance Criteria:**
- [ ] The review page (`/jobs/[id]/review`) polls for new photos every 5 seconds when the session status is not "completed" or "signed_off"
- [ ] New photos append to the existing photo grid without full page reload
- [ ] When the session is completed/signed off, polling stops automatically
- [ ] A subtle indicator shows "Live — updating" when polling is active, and "Complete" when the session is finished
- [ ] The `ReviewScreen` component manages photo state with `useState` and merges new arrivals

## Functional Requirements

- FR-1: Audio chunks must be ~15 seconds with ~2 second server-side overlap; no speech lost at boundaries
- FR-2: Transcript text must appear within the expanded checklist item it's relevant to, labeled "You said:"
- FR-3: Transcript chunks spanning multiple items must be AI-split so each segment lands on the correct item
- FR-4: Extracted measurements must be visually highlighted within transcript text with a colored pill/background
- FR-5: Photos on expanded items must render at ~80-100px height in a horizontal scrollable row
- FR-6: Unmatched glasses photos must be analyzed by AI vision to determine which inspection item they belong to
- FR-7: Photos with low-confidence AI matching must go to the Unmatched section, not be silently assigned to a wrong item
- FR-8: An "Unmatched Evidence" section at the bottom of the item list must collect all unmatched photos, transcripts, and measurements
- FR-9: Each unmatched item must have a one-tap "Assign to..." action
- FR-10: Expanded items must stay expanded until manually collapsed by the mechanic
- FR-11: The review page must poll for new evidence when the session is still in progress
- FR-12: All evidence labels must use plain language ("You said:", "Captured:", "Photo") — no AI/ML terminology
- FR-13: AI model selection must optimize for accuracy, not cost — use the best available models for vision matching and transcript splitting

## Non-Goals (Out of Scope)

- Video frame extraction or real-time video analysis (future enhancement)
- WebSocket or SSE real-time push (polling at 3-5 second intervals is sufficient for V1)
- Streaming transcription (word-by-word like live captions) — chunked is acceptable
- Auto-collapse behavior for items
- Changes to the PDF viewer panel (left side stays exactly as-is)
- Changes to the GlassesPanel connection flow
- Mobile app evidence display (web workspace only)
- Cost optimization for AI calls (accuracy is the priority)

## Technical Considerations

- **Server-side audio overlap:** The audio processing endpoint should buffer the last ~2 seconds of each chunk's audio. When the next chunk arrives, prepend the buffered audio before sending to Whisper. This keeps the browser-side recorder simple (single MediaRecorder) and handles dedup server-side.
- **AI model selection:** Use the best available models — optimize purely for accuracy. For vision matching (US-006), use Claude's latest vision model or equivalent. For transcript splitting (US-003), use Claude Sonnet 4.6 or better. Check `lib/ai/models.ts` for the existing provider pattern and fallback chains.
- **Transcript splitting pipeline:** After Whisper transcription and LLM correction, add a new step: send the corrected transcript + full list of inspection item names/parameters to an AI model. It returns an array of `{ text: string, inspectionItemId: string | null }` segments. Store each segment as a separate record or tag with the item ID.
- **Transcript display state:** The `onTranscript` callback already exists but isn't wired. Wire it to a `Map<string, string[]>` (itemId -> transcript chunks) in workspace state. Determine "active item" from whatever item is currently expanded (or most recently expanded).
- **Polling efficiency:** The progress endpoint already returns `photoCount`. Extend it to also return `transcriptCount` and `unmatchedCount` so the workspace can detect changes without fetching full data every cycle.
- **Photo size change:** Only affects expanded items. Collapsed items keep their compact count badge. No layout changes to the overall item list structure.
- **Review page polling:** Simple `useEffect` + `setInterval` pattern, identical to what inspect-workspace already does. Only active when session is in-progress.

## Success Metrics

- Mechanic can see transcript text of what they said within ~15-20 seconds of speaking
- Photos captured via glasses appear on the correct checklist item within ~8 seconds
- At least 70% of glasses photos are auto-matched to the correct item (rest go to Unmatched)
- Transcript chunks spanning multiple items are correctly split and assigned
- Unmatched evidence is easily reassignable with one tap
- Review page updates automatically during active capture without manual refresh
- Mechanic reports increased confidence that the system is "getting it right" during capture

## Open Questions

- Should transcript chunks that the AI splits be visually indicated as "split" (e.g., a continuation marker), or should they look like independent chunks on each item?
- What confidence threshold for photo-to-item matching produces the best balance of auto-assignment vs. false matches? (May need tuning after initial deployment)
- Should the server-side audio buffer persist across server restarts / cold starts, or is it acceptable to lose the 2-second overlap on the first chunk after a cold start?
