# AeroTrack Constitution

> AeroTrack is an AI documentation assistant for aerospace mechanics. A mechanic does their job — narrating what they see, snapping photos of findings, working through the overhaul — and AeroTrack automatically generates all the paperwork: the FAA Form 8130-3, the work order, the findings report, the test results documentation. Every piece of captured data feeds into a component lifecycle record that follows the part across companies. This MVP is a proof of concept for Parker Aerospace, filling the gap between their existing SkyThread/DUST Identity infrastructure and the mechanics who generate data at the point of work.

**Version:** 1.0.0

---

## Ralph Wiggum

**Source:** https://github.com/fstandhartinger/ralph-wiggum
**Commit:** 22b6c3c4fad47d8e5a5824ac2093b8d58ab057ff
**Installed:** 2026-02-07

### Auto-Update

At session start, check for updates:
1. Run: `git ls-remote https://github.com/fstandhartinger/ralph-wiggum.git HEAD`
2. If hash differs: fetch latest scripts, update this file, inform user

---

## Context Detection

**Ralph Loop Mode** (you're in this if started by ralph-loop.sh):
- Focus on implementation — no unnecessary questions
- Pick highest priority incomplete spec
- Complete ALL acceptance criteria
- Test thoroughly
- Commit and push
- Output `<promise>DONE</promise>` ONLY when 100% complete

**Interactive Mode** (normal conversation):
- Be helpful and conversational
- Guide decisions, create specs
- Explain Ralph loop when ready

---

## Core Principles

### I. Demo Polish Over Production Robustness
This is a proof-of-concept demo for Parker Aerospace. Visual quality and smooth demo flow matter more than production-grade error handling or edge case coverage. Make it look and feel professional.

### II. Paperwork Generation Is the Centerpiece
The AI-generated 8130-3 and work order are the "money shot" of the entire demo. The capture flow leading to automatic document generation is what will sell Parker on this concept. Spend extra effort here.

### III. Simplicity
Build exactly what's needed for the demo, nothing more. This is a PoC — keep it simple, use mock data where appropriate, and avoid over-engineering.

---

## Technical Stack

Detected from codebase:

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Database:** SQLite via Prisma 7
- **AI:** Anthropic Claude API (@anthropic-ai/sdk)
- **Charts:** Recharts 3
- **Icons:** Lucide React
- **PDF:** pdf-lib + pdf-parse
- **QR Codes:** qrcode.react
- **Package Manager:** npm

---

## Autonomy

**YOLO Mode:** ENABLED
Full permission to read/write files, execute commands, make HTTP requests.

**Git Autonomy:** ENABLED
Commit and push without asking, meaningful commit messages.

---

## Work Items

The agent discovers work dynamically from:
1. **specs/ folder** — Primary source, look for incomplete `.md` files
2. **GitHub Issues** — If this is a GitHub repo
3. **IMPLEMENTATION_PLAN.md** — If it exists
4. **Any task tracker** — Jira, Linear, etc. if configured

Create specs using `/speckit.specify [description]` or manually create `specs/NNN-feature-name.md`.

Each spec MUST have **testable acceptance criteria**.

### Re-Verification Mode

When all specs appear complete, the agent will:
1. Randomly pick a completed spec
2. Strictly re-verify ALL acceptance criteria
3. Fix any regressions found
4. Only output `<promise>DONE</promise>` if quality confirmed

---

## Running Ralph

```bash
# Claude Code / Cursor
./scripts/ralph-loop.sh

# OpenAI Codex
./scripts/ralph-loop-codex.sh

# With iteration limit
./scripts/ralph-loop.sh 20
```

---

## Completion Signal

When a spec is 100% complete:
1. All acceptance criteria verified
2. Tests pass
3. Changes committed and pushed
4. Output: `<promise>DONE</promise>`

**Never output this until truly complete.**
