# Pickup: Fix Web/iOS User ID Mismatch

## Problem

Jobs created on the web dashboard are invisible to the iOS Glass app because the two systems resolve to DIFFERENT user IDs, even when the same person is logged in.

**The active-job endpoint** (`GET /api/mobile/active-job`) queries:
```typescript
where: {
  userId: auth.user.id,          // <-- iOS user ID
  organizationId: auth.user.organizationId,
  status: { in: ["active", "capturing", "inspecting"] },
}
```

If the web-created job has a different `userId` than the iOS auth resolves, the query returns nothing.

## Root Cause

Two separate auth systems create/reference users differently:

### Web Auth (NextAuth)
- File: `/lib/auth.ts` — NextAuth config with PrismaAdapter
- File: `/lib/rbac.ts` — `requireAuth()` reads `session.user.id` from NextAuth JWT
- Users can log in via OAuth (Google) OR email/password
- OAuth login may auto-create a user via PrismaAdapter (NextAuth's Account + User tables)
- The `POST /api/sessions` endpoint (line 104-147) has its OWN auto-create-user logic that generates `WEB-{id}` badge numbers

### iOS Auth (Custom JWT)
- File: `/lib/mobile-auth.ts` — `authenticateRequest()` reads `userId` from a hand-signed JWT
- File: `/app/api/mobile/auth/route.ts` — issues JWT after email/password login
- Looks up user by email: `prisma.user.findFirst({ where: { email, organizationId } })`
- If user found AND password matches → issues JWT with that user's `id`

### The Mismatch Scenario
1. Jake logs into web via Google OAuth → NextAuth PrismaAdapter creates User record A (id: `clu123...`)
2. Web creates a job → `userId: "clu123..."` (User A)
3. Jake logs into iOS with email/password → mobile auth finds a DIFFERENT user record B (id: `clx456...`) that was created separately (e.g., by the old auto-create logic or a manual seed)
4. iOS queries active-job with `userId: "clx456..."` → no match for User A's job

## What Needs to Happen

### Option A: Normalize user lookup (Recommended)
Make both auth systems resolve to the SAME user record for the same email:

1. **In `/app/api/mobile/auth/route.ts`**: Change the user lookup to find by email ONLY (not email + org), matching how NextAuth finds users. If multiple users share an email (shouldn't happen), pick the one with an org.

2. **In `/lib/rbac.ts` or wherever web sessions are created**: Ensure the `userId` on new sessions comes from the same User record that mobile auth would find.

3. **Add a migration/cleanup script**: Find duplicate User records with the same email but different IDs. Consolidate them — pick one canonical ID and update all CaptureSession, CaptureEvidence, etc. foreign keys.

### Option B: Remove userId filter from active-job
Change the active-job query to filter by `organizationId` only (not `userId`). This is simpler but less correct — any user in the org would see any active job.

### Option C: QR code pairing (separate effort)
A QR code pairing system is being built in parallel that bypasses the userId matching entirely. But the auth should still be fixed for data attribution.

## Key Files to Read

| File | What it does |
|------|-------------|
| `/lib/auth.ts` | NextAuth config — how web users are created/authenticated |
| `/lib/rbac.ts` | `requireAuth()` — how web API routes get the user ID |
| `/lib/mobile-auth.ts` | `authenticateRequest()` — how mobile API routes get the user ID |
| `/app/api/mobile/auth/route.ts` | Mobile login endpoint — issues JWT |
| `/app/api/sessions/route.ts` | Session creation — has auto-create user logic (lines 104-147) |
| `/app/api/inspect/sessions/route.ts` | Inspection creation — uses `authResult.user.id` |
| `/app/api/mobile/active-job/route.ts` | The endpoint that's broken — filters by userId |
| `/prisma/schema.prisma` | User model + relations |
| `/tasks/prd-unified-mobile-web-auth.md` | Existing PRD for unified auth (partially implemented) |

## iOS App Auth Files

| File | What it does |
|------|-------------|
| `AeroVisionGlass/Sources/Services/APIClient.swift` | REST client — stores JWT in Keychain |
| `AeroVisionGlass/Sources/Services/APIManager.swift` | Login flow — calls `/api/mobile/auth` |
| `AeroVisionGlass/Sources/Views/LoginView.swift` | Email/password login UI |

## Verification

After fixing:
1. Log into web dashboard (note which auth method — OAuth or email/password)
2. Create a guided inspection from the Jobs page
3. Log into iOS app with the same email
4. The active-job endpoint should return the job
5. Query to verify: both login paths resolve to the same `user.id`

## Rules
- Read `/Users/jake/dev/Primary_OIR/MVC/MVP/aerovision-mvp/.specify/memory/constitution.md` first
- Read `/Users/jake/CLAUDE.md` for working style
- NEVER do unnecessary schema migrations — string-to-json + model rename cost 24+ hours last time
- Run `npx next lint` before committing web changes
- iOS builds: `GIT_TERMINAL_PROMPT=0` and 5min timeout for xcodebuild
- Always use PRs, never push directly to main
