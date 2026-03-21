# Pickup: Fix Auth Login + Debug Cleanup

## Status: Functions WORKING, auth login broken, cleanup needed

## What Was Fixed (This Session)

**Root cause of 30+ hour outage:** Next.js route slug conflict. Two folders under `app/api/sessions/` used different param names (`[id]` vs `[sessionId]`). This crashed the route tree builder during Node.js runtime startup, killing ALL serverless functions before any user code could run. Fixed in PR #108.

**Additional fixes applied:**
- PR #105: Aligned Prisma packages to 7.5.0 (was mismatched 7.4.0 vs 7.5.0)
- PR #106: Reduced maxDuration from 600 to 300 (pro plan limit)
- PR #107: Force clean build (debug, already reverted in PR #109)
- PR #108: **THE FIX** — moved `[sessionId]/form-fields/` to `[id]/form-fields/`
- PR #109: Removed debug buildCommand from vercel.json
- PR #111: Removed accidentally committed `shift-reconciliation.ts`

**Health endpoint confirmed working:** `curl https://aerovision-mvp.vercel.app/aerovision/api/health` returns `{"ok":true,"runtime":"nodejs"}`

## What's Still Broken: Auth/Login

`/api/auth/providers` returns `"Bad request."` even after env var cleanup.

### Env vars were fixed via Vercel REST API (PATCH):
- `AUTH_URL` → `https://mechanicalvisioncorp.com/aerovision` (was `...aerovision\n`)
- `AUTH_TRUST_HOST` → `true` (was `true\n`)
- `VISION_MODEL` → `gpt-4o` (was `gpt-4o\n`)
- `OPENROUTER_API_KEY` → cleaned (had `\n`)
- `GROQ_API_KEY` → cleaned (had `\n`)

A redeploy was triggered (`dpl_8XgC4Faw1eedhEkZj2tTe71NyQwC`) to pick up the clean env vars, but `/api/auth/providers` still returns "Bad request."

### Possible auth issues to check:
1. **AUTH_SECRET** might also be corrupted — check it: `vercel env pull` and inspect
2. **NextAuth v5 beta.30** needs `AUTH_URL` set correctly for the multi-zone proxy setup
3. The gateway domain `mechanicalvisioncorp.com` rewrites to `aerovision-mvp.vercel.app/aerovision` — AUTH_URL must match what the user's browser sees
4. Jake's browser cookies from the old broken deploys need clearing — go to Chrome DevTools > Application > Cookies > clear all for `mechanicalvisioncorp.com` and `aerovision-mvp.vercel.app`
5. Check `lib/auth.ts` and `lib/auth.config.ts` for how AUTH_URL is used

### To debug auth:
```bash
# Test auth providers endpoint
curl -v "https://aerovision-mvp.vercel.app/aerovision/api/auth/providers" --max-time 15

# Test via gateway domain
curl -v "https://mechanicalvisioncorp.com/aerovision/api/auth/providers" --max-time 15

# Pull env vars and verify they're clean
FORCE_TTY=1 vercel env pull .env.check --environment production --yes
grep -E "AUTH_|NEXTAUTH" .env.check
```

### Vercel REST API auth token (expires ~12h from now):
```
Bearer vca_8frlFcyIteYHkZElw2j22ORPBTGxJALAzWnpL5UfMsOwOGjMVF0gH4B2
```

## Cleanup Needed (Jake requested)

After auth is working, clean up debug artifacts from this session:

### Code cleanup (single PR):
1. **Remove `console.log` from health endpoint** (`app/api/health/route.ts` line 5)
2. **Consider keeping health endpoint** (useful for monitoring) but remove the debug comment
3. **Sentry is fully removed** — needs to be re-added properly in a future session (separate task)
4. **Remove stale local files** that aren't in git:
   - `instrumentation.ts` (already deleted locally this session)
   - `sentry.client.config.ts`, `sentry.edge.config.ts`, `sentry.server.config.ts`
   - `lib/ai/braintrust.ts`, `lib/ai/shift-reconciliation.ts` (removed from git in PR #111)
   - `components/shift-desk-mic-recorder.tsx`
   - `lib/shift-transcript.ts`
   - Various test/script files

### Env var cleanup:
- Remove `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (unused)
- Verify all env vars are clean (no `\n` suffixes)

### Branch cleanup:
Many hotfix branches were created: `hotfix/prisma-version-align`, `hotfix/fix-maxduration`, `hotfix/force-clean-build`, `hotfix/fix-route-slug-conflict`, `hotfix/clean-vercel-json`, `hotfix/remove-stale-shift-recon`. Delete them all.

## Project State

| Item | Status |
|------|--------|
| Node.js functions | WORKING |
| Edge functions | WORKING |
| Auth/login | BROKEN ("Bad request") |
| Sessions page | Unknown (can't login to test) |
| Sentry | Removed (needs re-add later) |
| Prisma | 7.5.0 aligned, adapter-neon |
| Build | Succeeds on main |

### Current production deploy:
- `dpl_FcKSiAgxG6JdDj45H63dVPQG5Lkr` (PR #111) — READY, serving
- `dpl_8XgC4Faw1eedhEkZj2tTe71NyQwC` — redeploy with clean env vars (check status)

### Key files:
- `lib/auth.ts` — NextAuth full config (imports Prisma)
- `lib/auth.config.ts` — Edge-compatible auth config (used by middleware)
- `middleware.ts` — Auth middleware with timeout guard
- `app/api/sessions/[id]/form-fields/route.ts` — the moved route (was [sessionId])
