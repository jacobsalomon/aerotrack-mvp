# PRD: Real-Time Transcription Pipeline with Multi-Layer Correction

## Overview
Replace the current 6-second chunk transcription pipeline with a three-layer architecture: instant display via Web Speech API, high-accuracy correction via ElevenLabs Scribe v2 on overlapping chunks, and an LLM post-processing pass that fixes part numbers, measurements, and formatting. The mechanic sees words appear instantly, then text silently improves as correction layers complete.

## Goals
- Text appears on screen instantly as the mechanic speaks (zero perceived latency)
- Part numbers, measurements, and technical terms are corrected to near-perfect accuracy
- Filler words (uh, um, yeah, so) are stripped automatically
- Measurements are formatted properly ("forty five foot pounds" → "45 ft-lbs")
- The transcript silently improves in-place as correction passes complete
- No regression to existing recording, upload, or measurement extraction functionality

## Quality Gates

These must pass for every user story:
- `npx next build` — Type checking + build
- Manual browser verification of the live capture view

## User Stories

### US-001: Add Web Speech API for Instant Display
**Description:** As a mechanic, I want to see my words appear on screen instantly as I speak, so that I know the system is capturing everything.

**Acceptance Criteria:**
- [ ] Browser's `webkitSpeechRecognition` / `SpeechRecognition` API is used for real-time text display
- [ ] Words appear on screen within ~200ms of being spoken
- [ ] A "live draft" section in the transcript panel shows the current real-time text
- [ ] The live draft is visually distinct from corrected/finalized text (e.g., slightly lighter color or italic)
- [ ] Graceful fallback if the browser doesn't support Web Speech API (show a message, still record audio for correction layers)
- [ ] Works in Chrome (primary target) — Safari/Firefox support is nice-to-have
- [ ] The existing `ShiftDeskMicRecorder` audio recording continues to work alongside Web Speech API (both run in parallel on the same mic stream)

### US-002: Switch to 15-Second Overlapping Chunks for ElevenLabs
**Description:** As a system, I want to send longer audio chunks with overlap to ElevenLabs Scribe v2, so that the correction pass has enough context for accurate transcription.

**Acceptance Criteria:**
- [ ] Audio chunks are 15 seconds long (up from 6 seconds)
- [ ] Each chunk overlaps the previous chunk by 3-5 seconds so no words are lost at boundaries
- [ ] Overlap deduplication logic ensures the same words don't appear twice in the transcript
- [ ] `ShiftDeskMicRecorder` updated to support configurable chunk duration and overlap
- [ ] ElevenLabs Scribe v2 is now the primary transcription model (moved to first in the chain)
- [ ] Keyterm prompting is added to ElevenLabs requests with aerospace vocabulary (part numbers, measurement units, aviation acronyms)

### US-003: In-Place Transcript Correction (Silent Upgrade)
**Description:** As a mechanic, I want the rough draft text to silently improve as better transcriptions come back, so that I always see the most accurate version without any jarring updates.

**Acceptance Criteria:**
- [ ] When ElevenLabs correction returns, the corresponding Web Speech API draft text is replaced in-place
- [ ] The replacement is smooth — no flash, no scroll jump, no layout shift
- [ ] Corrected text is styled differently from draft text (e.g., normal weight vs. italic/lighter)
- [ ] A small indicator shows how many segments have been corrected vs. still in draft (e.g., "8/10 segments verified")
- [ ] The transcript panel maintains scroll position during updates
- [ ] Timestamps are preserved so measurement extraction knows when each segment was spoken

### US-004: LLM Post-Processing Correction Pass
**Description:** As a system, I want to run an LLM correction pass on each corrected transcript segment, so that part numbers, measurements, and technical terms are formatted accurately.

**Acceptance Criteria:**
- [ ] After ElevenLabs returns a corrected segment, it's sent to an LLM (GPT-4o or Claude) for post-processing
- [ ] The LLM correction prompt includes: aerospace vocabulary list, known part number formats (regex patterns), measurement unit formatting rules
- [ ] Filler words are stripped: "uh", "um", "yeah", "so" (when used as filler), "like" (when filler)
- [ ] Measurements are formatted: "forty five foot pounds" → "45 ft-lbs", "one fourteen point five millimeters" → "114.5 mm", "three thousandths" → "0.003 in"
- [ ] Part numbers are pattern-matched and corrected: "eight eight one seven hundred dash one oh eight nine" → "881700-1089"
- [ ] The LLM output replaces the ElevenLabs text in-place (another silent upgrade)
- [ ] The correction is fast — should complete within 2-3 seconds of receiving the ElevenLabs text
- [ ] If the LLM correction fails, the ElevenLabs text remains (never lose data)

### US-005: Update Measurement Extraction to Use Corrected Transcript
**Description:** As a system, I want measurement extraction to run on the LLM-corrected transcript rather than the raw transcription, so that extracted values are more accurate.

**Acceptance Criteria:**
- [ ] Measurement extraction (`extractMeasurementsFromTranscript`) runs after the LLM correction pass, not after raw transcription
- [ ] The measurement feed in the live capture view updates when new corrected measurements are extracted
- [ ] Previously extracted measurements from raw transcription are updated if the correction changes them
- [ ] Measurement confidence scores reflect the multi-layer correction (higher confidence for corrected values)

### US-006: Store API Keys and Provider Config
**Description:** As a developer, I want all API keys stored on Vercel and the ElevenLabs keyterm configuration centralized, so the pipeline is ready for production.

**Acceptance Criteria:**
- [ ] Wispr Flow API key (`WISPR_FLOW_API_KEY`) is stored on Vercel production environment (for future use)
- [ ] ElevenLabs is confirmed as primary transcription provider in `lib/ai/models.ts`
- [ ] Aerospace keyterm list is configurable and passed to ElevenLabs requests
- [ ] The keyterm list includes: common part number patterns, measurement units, aviation acronyms, manufacturer names
- [ ] All changes deploy successfully to production

### US-007: Fix Page Blinking on Session Detail
**Description:** As a user, I want the live capture view to stop flashing/blinking when background data polling occurs.

**Acceptance Criteria:**
- [ ] The loading spinner only shows on initial page load, not during background polls
- [ ] The live capture view stays mounted and stable during polling
- [ ] Session data updates happen silently without unmounting/remounting components
- [ ] Verified visually in the browser — no flicker or blank screen during active capture

## Functional Requirements
- FR-1: Web Speech API and audio recording must run simultaneously on the same microphone input
- FR-2: The 15-second audio chunks must overlap by 3-5 seconds to prevent word loss at boundaries
- FR-3: Overlap deduplication must use word timestamps to align and merge overlapping segments
- FR-4: The transcript must show three visual states: live draft (Web Speech), corrected (ElevenLabs), and verified (LLM post-processed)
- FR-5: All corrections happen in-place — the transcript never jumps, reflows, or loses scroll position
- FR-6: The LLM correction prompt must include the full aerospace vocabulary from `AEROSPACE_VOCABULARY_PROMPT`
- FR-7: If any correction layer fails, the previous layer's output is preserved (graceful degradation)
- FR-8: The existing `onTranscript` callback and transcript chunk DB storage must continue to work

## Non-Goals
- Wispr Flow API integration (stored key for future use — requires enterprise approval)
- Speaker diarization (identifying who said what)
- Real-time streaming via WebSocket to ElevenLabs (using batch on chunks is sufficient)
- Custom model training or fine-tuning
- Changing the measurement extraction AI logic itself (just feeding it better input)

## Technical Considerations
- Web Speech API is Chrome-only with good support; Safari has partial support; Firefox is limited
- Web Speech API requires HTTPS (already the case in production)
- Running Web Speech API + MediaRecorder simultaneously on the same mic may require careful AudioContext management to avoid conflicts
- ElevenLabs keyterm prompting is limited to 100 terms — need to prioritize the most impactful terms
- The LLM correction pass adds ~2-3 seconds latency per segment but runs asynchronously (doesn't block display)
- Overlap deduplication is the trickiest part — need to handle partial word matches at chunk boundaries

## Success Metrics
- Text appears on screen within 200ms of being spoken
- Part numbers are correctly transcribed >95% of the time
- Measurements are correctly extracted and formatted >98% of the time
- No filler words remain in the final corrected transcript
- Zero UI flicker or blink during active capture
- Full pipeline (record → display → correct → extract) works end-to-end in production

## Open Questions
- Will Web Speech API and MediaRecorder conflict when sharing the same microphone? (Test in US-001)
- Can ElevenLabs keyterm prompting be loaded dynamically per session based on the component being inspected?
- Should we show the correction happening (satisfying to watch) or make it invisible?
