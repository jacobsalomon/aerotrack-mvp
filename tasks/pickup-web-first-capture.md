# Pickup: Web-First Capture Flow (US-003 through US-006)

## What's Done
- US-001: Fixed false glasses connection state in iOS app. Uses `devicesStream()` as primary signal (devices in stream = connected). Added `.registered` state for when Meta AI is registered but glasses not nearby. Confirmed working by Jake.
- US-002: Fixed gateway CTA to point to `/aerovision/login` instead of broken `/aerovision/dashboard`. Confirmed working by Jake.
- Fixed `.vercelignore` excluding mobile auth route (changed `auth` → `auth.db`)
- Fixed MWDAT SDK config, Meta App ID registration, Developer Mode setup
- iOS app base URL now uses `https://mechanicalvisioncorp.com/aerovision/aerovision`
- All changes pushed to GitHub and deployed

## What's Next — Execute These Stories In Order

### US-003: Add desk microphone recording to web dashboard sessions
- Use browser `MediaRecorder` API to record from computer mic
- Auto-start recording when session starts, auto-stop when session ends
- Record in 2-minute chunks (match mobile pattern)
- Upload each chunk to Vercel Blob as evidence type `AUDIO_CHUNK` with `transcriptSource: "desk_mic"`
- Send to `/api/mobile/transcribe` endpoint for speech-to-text
- Show pulsing red dot + elapsed time while recording
- Mute/unmute button (don't stop session)
- **If technician navigates away from session page, stop recording and save**
- **If browser tab closes, save recording and begin processing via `beforeunload`**
- New file: `components/desk-mic-recorder.tsx`
- Integrate into session detail page

### US-004: Make glasses attachment optional
- "Start Session" on web works without glasses
- Session functions with audio-only evidence
- UI shows which streams are active (desk mic: yes/no, glasses: yes/no)

### US-005: Auto-join active web session from mobile app
- Mobile app checks for active session on same account before creating new one
- Uses existing `/api/mobile/work` or `/api/mobile/sessions` endpoint
- Shows which web session the mobile app joined
- **Key decision:** The mobile app's `CaptureViewModel.swift` currently always creates a new session. Change it to check first.

### US-006: Live session view with multi-stream status
- Active session page shows "Live Capture" panel
- Desk mic status (recording/muted/off) with elapsed time
- Glasses status (connected/streaming/disconnected)
- Evidence count updating in real-time
- Audio waveform or volume indicator for desk mic
- "End Session" button that stops everything

## Critical Architecture Notes

### URL Structure (confusing but important)
- Gateway domain: `mechanicalvisioncorp.com`
- Gateway rewrites `/aerovision/*` → `aerovision-mvp.vercel.app/aerovision/*`
- Aerovision-mvp basePath: `/aerovision`
- Routes in `app/aerovision/api/mobile/...` → external URL: `/aerovision/aerovision/api/mobile/...`
- iOS app base URL: `https://mechanicalvisioncorp.com/aerovision/aerovision`

### Multi-Zone Setup
- `mvc-gateway` project: Vercel project, serves `mechanicalvisioncorp.com`, rewrites to sub-apps
- `aerovision-mvp` project: Vercel project, basePath `/aerovision`, has all API routes + dashboard
- `aerovision-seed-deck` project: Vercel project, basePath `/pitch`
- All three must stay on Next.js 15 (16 causes rewrite loops)

### Web App Auth
- Login page at `app/aerovision/login/page.tsx`
- Mobile auth at `app/aerovision/api/mobile/auth/route.ts` — always returns demo user
- Dashboard auth may be different — check `app/aerovision/(dashboard)/` for auth middleware

### Quality Gates
- Web: `npx tsc --noEmit` in aerovision-mvp
- iOS: `xcodebuild` for AeroVisionGlass scheme
- Browser verification for UI stories

### Audio Recording Technical Notes
- `MediaRecorder` codec varies: Chrome = webm/opus, Safari = mp4/aac
- Transcription endpoint must handle both formats
- Use same upload pipeline as mobile: get signed token → upload to Vercel Blob → register metadata → transcribe
- 2-minute chunk interval matches mobile for consistency

## Files to Modify
- `app/aerovision/(dashboard)/sessions/[id]/page.tsx` — add desk mic recorder + live panel
- NEW: `components/desk-mic-recorder.tsx` — MediaRecorder wrapper
- NEW: `components/live-session-panel.tsx` — multi-stream status display
- `app/aerovision/api/mobile/sessions/route.ts` — support web-originated sessions
- iOS: `AeroVisionGlass/Sources/ViewModels/CaptureViewModel.swift` — check for existing session before creating
