# Pickup: Sessions Page — Node.js Functions Hang (504)

## Status: RUNTIME-LEVEL HANG — Not code, not build cache

## What We Know (CONFIRMED)

1. **ALL Node.js serverless functions hang** — even a zero-import health endpoint
2. **Edge runtime functions work** (tested in PR #100 — 200 in 0.3-0.6s)
3. **Static pages work** (308 redirect, no hang)
4. **Middleware works** (edge runtime)
5. **ALL old deploys also hang** — tested PR #88, #89, #91, #95 deploy URLs. Functions that worked days ago now hang.
6. **New project (aerovision-mvp-v2) has same issue** — not project-specific
7. **Gateway project works** — not team-level
8. **Build cache is NOT the cause** — PR #107 added `rm -rf .next node_modules/.cache` to buildCommand, still hangs
9. **Prisma version mismatch was real but NOT the root cause** — fixed in PR #105 (all 7.5.0), still hangs
10. **Sentry was already removed** — PRs #99-#104
11. Error in runtime logs: `[Error: You cannot use diff...` and `Unhandled Rejection: Error:...` (truncated by Vercel MCP tool)
12. `console.log("[health] Function started")` NEVER appears in logs — crash is before user code

## What This Means

Since old deploys that previously worked NOW also hang, this is NOT caused by any code change. The runtime environment itself is broken. Possible causes:

### Theory A: Vercel project settings poisoned
The Neon integration (installed ~2 days ago, then removed) may have changed project-level settings that affect ALL deploys:
- `nodeVersion` was changed to "24.x" (fixed back to "20.x" in previous session)
- `framework` was set to null (fixed back to "nextjs")
- Fluid Compute and Elastic Concurrency were disabled
- **But maybe other settings were changed that we haven't found**

### Theory B: Environment variables poisoned
Some env var might be causing Node.js startup to hang:
- The Neon integration added POSTGRES_*, PGHOST, etc. (removed in PR #93)
- But env vars apply to ALL deploys including old ones
- A bad env var would explain why old deploys also hang
- **Key suspect: check if there's a leftover env var that's malformed**

### Theory C: Vercel infrastructure issue
- The region (iad1) might have a Node.js runtime bug
- Fluid Compute residual setting might be broken
- Account-level issue

## IMMEDIATE NEXT STEPS

### Step 1: Check ALL env vars for corruption
```bash
FORCE_TTY=1 vercel env ls production
# Look for any POSTGRES_*, PG*, NEON_* vars that shouldn't be there
# Check if DATABASE_URL is malformed
```

### Step 2: Get the FULL error message
The Vercel MCP tool truncates "You cannot use diff..." — need the complete text.
Use the Vercel dashboard: aerovision-mvp > Deployments > latest > Logs tab > click on the error.
Or use the REST API with an auth token.

### Step 3: Test with ALL env vars removed
Create a truly minimal deployment: no env vars, no database, just the health endpoint.
If it works: one of the env vars is the culprit.
If it still hangs: it's a Vercel platform issue.

### Step 4: Deploy to a completely different Vercel account
Create a fresh Vercel account, deploy the same code. If it works there, the issue is account/team-level.

## Project State

| Project | Deploy ID | Status |
|---------|-----------|--------|
| aerovision-mvp | dpl_9fKCsEqnRPCmtacrVZkqwUkxGjFn (PR #107) | READY but functions hang |
| aerovision-mvp-v2 | dpl_AkwVcjXKAqUbWQNj1exCrhzHXiH2 | Same issue |

### Code state on main (PR #107):
- Sentry completely removed
- All Prisma packages at 7.5.0
- @prisma/adapter-pg removed
- Health endpoint at `/api/health` with console.log
- Clean build (buildCommand: `rm -rf .next node_modules/.cache && npm run build`)
- `maxDuration` on reprocess-all reduced to 300s

### PRs created this session:
- PR #105: Align Prisma to 7.5.0 + remove adapter-pg
- PR #106: Fix maxDuration 600 > 300
- PR #107: Force clean build

### Env vars:
17 env vars on aerovision-mvp. DATABASE_URL points to Neon (manually set).

### Vercel support:
Email sent from sal@ai.mechanicalvisioncorp.com to support@vercel.com (previous session).
