# Pickup: Crush FleetCraft Production Roadmap

## Context
Jake wants to build a production-grade AeroVision that makes competitor FleetCraft irrelevant. We created a 4-phase, 18-story roadmap and started implementing Phase 1.

## Full Plan
See: `/Users/jake/.claude/plans/humble-foraging-pearl.md`

## What's DONE

### Story 1.1: Cloud Storage (Vercel Blob) — MOSTLY DONE
- Created `lib/storage.ts` — Vercel Blob wrapper (uploadCmmPdf, uploadFile, deleteFile, listFiles)
- Created `app/api/admin/upload-cmm/route.ts` — POST (upload CMM PDF) + GET (list all manuals)
- Created `app/(dashboard)/admin/cmm/page.tsx` — admin UI for CMM library management
- Added `Settings` icon + "CMM Library" link to sidebar (`components/layout/sidebar.tsx`)
- Added `componentManual.deleteMany()` to seed cleanup in `prisma/seed.ts`
- Added 2 seeded ComponentManual records (P/N 881700-1089 and 3800520-3) to `prisma/seed.ts`

### Story 1.2: CMM Cross-Referencing — PARTIALLY DONE
- Created `lib/cmm-lookup.ts` — lookupCmmByPartNumber + lookupCmmByPartFamily
- Created `app/api/cmm/lookup/route.ts` — GET /api/cmm/lookup?pn=881700-1089
- **NOT YET DONE:** Wire CMM lookup into glasses demo (`app/glasses-demo/page.tsx`)

## What's NEXT (in order)

### Finish Story 1.2: Glasses HUD Integration
- Modify `app/glasses-demo/page.tsx` to fetch `/api/cmm/lookup?pn=881700-1089` when part is "scanned" at the 5-second mark
- Replace hardcoded CMM refs (like "CMM 881700-OH §70-20") with real data from the lookup
- Fall back to hardcoded strings if lookup fails (demo never breaks)

### Story 1.3: CMM in AI Pipeline
- In `lib/ai/pipeline-stages.ts`, the `runSessionDraftingStage` function already passes `cmmReference` as a title string
- Wire `getReferenceDataForPart()` + `formatReferenceDataForPrompt()` from `lib/reference-data.ts` into the drafting stage
- These functions exist and are tested — just not connected

### Story 1.4: OAuth2 Authentication
- Add Auth.js (NextAuth v5) with Google + Azure AD
- Files: `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/login/page.tsx`
- Add User/Account/Session models to `prisma/schema.prisma`
- Keep passcode fallback for demo mode

### Story 1.5: RBAC Middleware
- Create `lib/rbac.ts` enforcing TECHNICIAN/SUPERVISOR/ADMIN roles
- Wire into all API routes

### Story 1.6: iOS API Spec
- Generate OpenAPI 3.1 spec at `specs/mobile-api.yaml`

## Quality Gates
- `npx tsc --noEmit` (was running when compacted — need to verify)
- `npm run lint`
- `npm run build`
- Existing demos still work

## Critical File Paths
- Project root: `~/Desktop/Primary_OIR/MVC/MVP/aerovision-mvp/`
- Schema: `prisma/schema.prisma`
- AI pipeline: `lib/ai/pipeline-stages.ts`
- Glasses demo: `app/glasses-demo/page.tsx` (1002 lines, hardcoded CMM refs at lines ~74, 79, 87)
- Reference data helper: `lib/reference-data.ts` (already built, needs wiring)
- Seed file: `prisma/seed.ts`

## Design Decisions Already Made
- Vercel Blob for cloud storage (already in package.json as @vercel/blob)
- CMM lookup uses exact match then falls back to part family prefix
- Admin CMM page lives at /admin/cmm in the dashboard
- Glasses demo falls back to hardcoded data if API fails (never breaks the demo)
- Auth.js v5 for OAuth with Google + Azure AD providers
- Passcode stays as demo fallback when no OAuth configured
