# Pickup: Real-Time Transcription Pipeline with Multi-Layer Correction

## What's Done

### US-007: Blinking Fix (COMPLETE)
- **File:** `app/(dashboard)/sessions/[id]/page.tsx`
- Added `useRef` import and `hasLoadedOnce` ref (line ~383)
- `fetchSession` only sets `setLoading(true)` on first load, not background polls
- Build passes. Ready to deploy.

### US-006: API Keys (COMPLETE)
- `WISPR_FLOW_API_KEY` stored on Vercel production (for future use, API requires enterprise approval)
- `ELEVENLABS_API_KEY` already on Vercel from previous session
- ElevenLabs Scribe v2 already integrated as fallback in `lib/ai/openai.ts`

### PRD Written
- Full PRD at `tasks/prd-realtime-transcription-pipeline.md`
- Jake approved all decisions

## What's Next — Build Order

### US-001 + US-002 (combined): ElevenLabs Real-Time Streaming + Longer Chunks

**Architecture (Jake-approved):**
1. **Browser** captures raw PCM audio via AudioContext/ScriptProcessor → sends base64 chunks to server
2. **Server WebSocket proxy** at `/api/shifts/[id]/transcribe-stream` connects to ElevenLabs real-time API
3. ElevenLabs streams back `partial_transcript` (instant) and `committed_transcript` (finalized) messages
4. Client shows partial text instantly, replaces with committed text when ready

**ElevenLabs Real-Time WebSocket API (researched and confirmed):**
- Endpoint: `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
- Auth: `xi-api-key` header OR `token` query param
- Query params: `model_id=scribe_v2`, `language_code=en`, `include_timestamps=true`, `commit_strategy=vad`, `vad_silence_threshold_secs=1.5`, `audio_format=pcm_16000`
- Client→Server: `{"message_type": "input_audio_chunk", "audio_base_64": "...", "commit": false, "sample_rate": 16000}`
- Server→Client events:
  - `partial_transcript` — `{"message_type": "partial_transcript", "text": "..."}`
  - `committed_transcript` — `{"message_type": "committed_transcript", "text": "..."}`
  - `committed_transcript_with_timestamps` — includes word-level timestamps
- Supports `previous_text` on first chunk for context

**Key implementation decisions:**
- Next.js doesn't natively support WebSocket routes. Two options:
  a. Use a Server-Sent Events (SSE) approach: browser sends PCM chunks via POST, server proxies to ElevenLabs WS, streams back via SSE
  b. Use a separate WebSocket server (more complex)
  c. Use client-side WebSocket directly to ElevenLabs with a short-lived token from an API route
- **Recommended: Option C** — Create a `/api/shifts/[id]/transcribe-token` route that generates a single-use ElevenLabs token, then the browser connects directly to ElevenLabs WebSocket. Lowest latency, simplest architecture.
- HOWEVER: Check if ElevenLabs supports generating single-use tokens via API. If not, use Option A (SSE proxy).

**Audio capture changes:**
- Current: MediaRecorder captures webm/opus blobs every 6 seconds
- New: Keep MediaRecorder for the 15-second chunks (uploaded to `/api/shifts/[id]/audio` for DB storage)
- Add: AudioContext + ScriptProcessorNode (or AudioWorklet) to capture raw PCM at 16kHz for ElevenLabs streaming
- Both run simultaneously on the same mic stream

**Files to modify/create:**
- `components/shift-desk-mic-recorder.tsx` — Add PCM capture + WebSocket to ElevenLabs alongside existing MediaRecorder
- `components/live-capture-view.tsx` — Show partial transcripts instantly, replace with committed text
- `app/api/shifts/[id]/transcribe-token/route.ts` — (NEW) Generate single-use ElevenLabs token
- Change `DESK_MIC_CHUNK_MS` from 6000 to 15000

### US-003: In-Place Transcript Correction (Silent Upgrade)

**Transcript now has three states per segment:**
1. `draft` — partial text from ElevenLabs streaming (italic, lighter color)
2. `committed` — finalized text from ElevenLabs (normal weight)
3. `verified` — LLM post-processed text (normal weight, maybe subtle checkmark)

**Implementation:**
- `LiveCaptureView` manages transcript as array of `{id, text, status: 'draft'|'committed'|'verified', timestamp}`
- Partial transcripts update the current draft segment
- Committed transcripts replace the draft and trigger LLM correction
- LLM correction replaces committed text silently

### US-004: LLM Post-Processing Correction Pass

**Model: GPT-5.4 nano** (released March 17, 2026 — $0.20/1M input, fastest)
- Fallback: Claude Sonnet 4.6 (best at not hallucinating technical specs)
- Add `gpt-5.4-nano` to `lib/ai/models.ts` as a new CORRECTION_MODELS array

**Correction prompt responsibilities:**
- Strip filler words (uh, um, yeah, so, like when filler)
- Format measurements: "forty five foot pounds" → "45 ft-lbs"
- Pattern-match part numbers: "eight eight one seven hundred dash one oh eight nine" → "881700-1089"
- Use `AEROSPACE_VOCABULARY_PROMPT` as context
- Preserve meaning — never add or remove technical content

**New file:** `lib/ai/transcript-correction.ts`
- `correctTranscriptSegment(text: string): Promise<string>`
- Called after each committed transcript, runs async, result sent back to UI

### US-005: Measurement Extraction on Corrected Text

- Currently: measurement extraction runs in `/api/shifts/[id]/audio` route after raw transcription
- Change: Run measurement extraction on the LLM-corrected text instead
- This may require a new endpoint or modifying the existing flow so correction happens before extraction
- Simplest approach: the audio route still does raw transcription + DB storage, but a separate process runs correction + extraction on committed segments

## Model Registry Updates Needed

Add to `lib/ai/models.ts`:
```typescript
// Correction models — lightweight LLMs for post-processing transcripts
export const CORRECTION_MODELS: ModelConfig[] = [
  {
    id: "gpt-5.4-nano",
    provider: "openai",
    displayName: "GPT-5.4 Nano (correction)",
    inputCostPer1M: 0.20,
    outputCostPer1M: 1.25,
    contextWindow: 400_000,
    supportsJsonOutput: true,
  },
  {
    id: "claude-sonnet-4-6-20250514",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6 (fallback correction)",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 200_000,
    supportsJsonOutput: true,
  },
];
```

Also move ElevenLabs Scribe v2 to FIRST in the TRANSCRIPTION_MODELS array (currently second).

## Critical Rules

- **Jake is non-technical** — explain changes in plain language
- **Ralph Loop** — this PRD was generated via Ralph Loop, execute stories sequentially
- **Quality gates:** `npx next build` + manual browser verification
- **NEVER say "narrates" about the glasses** — glasses observe, no talking needed
- **basePath is `/aerovision`** — use `apiUrl()` helper for all API calls
- **Middleware excludes `api/shifts/.*/audio`** — audio routes bypass NextAuth
- **Cost doesn't matter** — Jake said focus on accuracy, not cost
- **serverExternalPackages** in next.config.ts for native modules
- Deploy to production when done: `FORCE_TTY=1 vercel --prod`

## ElevenLabs Keyterm Prompting

The ElevenLabs batch API supports keyterms but the real-time WebSocket API docs don't explicitly mention it. Check if `previous_text` on the first chunk can serve as a vocabulary hint. If not, the keyterm prompting only applies to the batch fallback transcription.

The aerospace vocabulary prompt is already defined in `lib/ai/openai.ts` as `AEROSPACE_VOCABULARY_PROMPT`.

## Current File State

- `middleware.ts` — Already excludes `api/shifts/.*/audio`
- `lib/ai/models.ts` — Has ElevenLabs as provider, Scribe v2 in TRANSCRIPTION_MODELS (position 2)
- `lib/ai/openai.ts` — Has `transcribeWithElevenLabs()` for batch mode, `AEROSPACE_VOCABULARY_PROMPT`
- `lib/ai/provider.ts` — Has `callWithFallback()` for model failover
- `components/shift-desk-mic-recorder.tsx` — Records webm chunks every 6s, uploads to API
- `components/live-capture-view.tsx` — Shows transcript from polling, mic controls at bottom
- `app/api/shifts/[id]/audio/route.ts` — Receives audio, transcribes, extracts measurements
- `app/(dashboard)/sessions/[id]/page.tsx` — Blinking fix applied (hasLoadedOnce ref)
