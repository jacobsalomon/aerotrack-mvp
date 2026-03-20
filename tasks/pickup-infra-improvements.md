# Pickup: Infrastructure Improvements for AeroVision

## Context
Tonight we improved the measurement extraction pipeline (PRs #84, #86, #88, #89, #90, #91). Now we need infrastructure to measure quality and move faster.

## What's Done
- All measurement extraction improvements shipped and deployed
- All 6 sessions reprocessed with new pipeline (39 measurements)
- OpenRouter fallback added across all AI chains
- Rate limit retry with backoff added
- GPT-5.4 `max_completion_tokens` fix deployed

## What Needs to Be Done (Ralph Loop)

### US-001: Braintrust Integration
- Create a Braintrust account and set up a project for AeroVision
- Integrate Braintrust logging into the AI provider layer (`lib/ai/provider.ts`)
- Log every AI call: model, prompt, response, latency, task type
- Set up an eval dataset from session `cmmydgw4f000004l492wen6bs` (tonight's test)
- API key env var: `BRAINTRUST_API_KEY` on Vercel production

### US-002: Sentry Production Alerting
- Configure Sentry alert rules for production errors
- Alert on: AI pipeline failures, 500 errors, unhandled exceptions
- Send alerts to jake@mechanicalvisioncorp.com
- Sentry is already integrated (withSentryConfig in next.config.ts)
- Check if SENTRY_DSN and SENTRY_AUTH_TOKEN are set on Vercel

### US-003: Staging Environment
- Create a Neon database branch from production
- Set up a second Vercel deployment (staging) pointing at the branch
- Clone production data so testing uses real sessions
- Separate env vars for staging vs production

### US-004: Test Session Ground Truth Dataset
- Use tonight's session (cmmydgw4f000004l492wen6bs) as ground truth
- Extract the actual correct measurements from the transcript manually
- Store as a JSON fixture in `tests/fixtures/`
- Build a simple eval script that compares AI extraction output against ground truth

## Key Files
- `lib/ai/provider.ts` — core AI provider with fallback chain
- `lib/ai/measurement-extraction.ts` — measurement extraction + reconciliation
- `lib/ai/models.ts` — model registry
- `next.config.ts` — Sentry config
- `.env.production` — production env vars (pulled from Vercel)

## Quality Gates
- `npx tsc --noEmit && npx next lint`

## Decisions Made
- Braintrust account: set one up (Jake doesn't have one yet)
- Sentry alerts: email to jake@mechanicalvisioncorp.com
- Staging data: clone production data (Neon branch)
