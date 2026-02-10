# 008: HEICO Executive Demo Mode

**Priority:** 5 (HEICO DEMO — build last, ties all demo features together into guided flow)

**Estimated effort:** Medium
**Dependencies:** Specs 003 (Digital Thread), 007 (8130-3 Rendering). Can be built
in parallel but demo flow references features from those specs.

---

## Why This Matters

You have all the pieces — capture workflow, AI doc generation, exception detection,
smart glasses HUD. But right now, seeing the full story requires clicking through
multiple pages and explaining what's happening at each step.

A CEO has 15-20 minutes of attention. The demo needs to be a single, flowing
experience that takes them from "interesting" to "I need this" in that window.

**The narrative arc:**
1. "Your mechanics already do great work. They just hate the paperwork." (Pain)
2. "What if the paperwork wrote itself?" (Promise)
3. "Watch." (Proof — live demo)
4. "Now look at what it caught that humans missed." (Unexpected value)
5. "Here's what this means for HEICO at scale." (ROI)

---

## What to Build

### 1. Demo Landing Page

Create `/app/(dashboard)/demo/page.tsx` — the entry point for the executive demo.

**Visual design:**

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                    ✈  AeroTrack                         │
│          Maintenance Intelligence Platform               │
│                                                          │
│     "What if every part could tell its own story?"       │
│                                                          │
│                                                          │
│     ┌────────────────────────────────────┐               │
│     │                                    │               │
│     │     ▶  Start Executive Demo        │               │
│     │        ~12 minutes                 │               │
│     │                                    │               │
│     └────────────────────────────────────┘               │
│                                                          │
│     ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│     │ Capture  │ │ Glasses  │ │ Explore  │             │
│     │ Workflow │ │  HUD     │ │  Freely  │             │
│     └──────────┘ └──────────┘ └──────────┘             │
│                                                          │
│    "Every year, MRO shops spend 2.4M hours on paperwork │
│     that could be automated. That's $180M in labor       │
│     costs — just in North America."                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Three entry points:
- **Start Executive Demo** — the guided, narrated flow (main CTA)
- **Capture Workflow** — jump straight to the overhaul capture
- **Glasses HUD** — jump to the smart glasses simulation
- **Explore Freely** — regular app (dashboard)

### 2. Guided Demo Flow

The Executive Demo is a step-by-step guided experience. It's NOT autopilot
(the user/presenter controls pacing). Each step has:
- A **narration card** at the top with talking points
- The **live feature** below it
- A **"Next →"** button to advance

**Step sequence:**

#### Step 1: "The Problem" (30 seconds)
**Narration:** "Every time a part comes off an aircraft, someone has to write a
stack of paperwork. The 8130-3 release certificate. The work order. The findings
report. Inspection records. Each form takes 15-45 minutes — and one error can
ground a plane or trigger an FAA audit."

**Visual:** Animated counter showing:
- 2.4M hours/year spent on MRO paperwork in North America
- $180M in labor costs
- 15% average error rate on hand-written forms
- 12 forms per overhaul, average

A stack of paper forms fades in, growing taller. The message: this is unsustainable.

#### Step 2: "The Mechanic's View" (2 minutes)
**Narration:** "Now let's see what AeroTrack looks like from the mechanic's
perspective. They put on smart glasses and just... do their job."

**Visual:** Launch the existing glasses-demo HUD in an embedded frame.
The demo autopilot runs showing:
- QR code scan → part identified
- Camera captures during inspection
- Voice notes transcribed in real-time
- Measurements auto-detected
- Findings logged automatically

**Key moment:** Point out that the mechanic hasn't touched a keyboard or form.
Everything was captured hands-free.

#### Step 3: "Evidence → Documents" (2 minutes)
**Narration:** "All those observations, measurements, and photos are now
structured data. Watch what happens next."

**Visual:** Show the capture workflow Step 6 (Release) for Component 1.
The AI generates the 8130-3 (using spec 007's rendered form preview).

**Key moment:** The form "types itself in" — fields appearing in real-time.
A timer shows: "Generated in 8.2 seconds. Manual equivalent: ~87 minutes."

Show the generated work order alongside the 8130-3. Two documents, both
complete, both generated from the same captured evidence.

#### Step 4: "The Digital Thread" (2 minutes)
**Narration:** "Every piece of work becomes part of the component's permanent
digital thread — a complete, verified history from birth to today."

**Visual:** Navigate to Component 1's part detail page showing the enhanced
back-to-birth timeline (spec 003). Scroll through the complete history.

**Key moment:** Point to the trace completeness score: "94% — this part's
entire life is documented. Every shop it's been to, every repair, every test.
The complete story."

Then switch to Component 2: "Now look at this one." Show the timeline with
the 14-month red gap. "Where was this part for over a year? Nobody knows.
AeroTrack found this automatically."

#### Step 5: "Fleet Intelligence" (1 minute)
**Narration:** "Now zoom out. This isn't just one part — it's your entire fleet."

**Visual:** Show the Integrity & Compliance page with the exception scan results.
Summary cards showing: X open exceptions, Y critical issues, Z components
with documentation gaps.

**Key moment:** "We scanned 8 components and found 15 issues in seconds.
Imagine running this across 50,000 parts."

#### Step 6: "The HEICO Opportunity" (1 minute)
**Narration:** "Here's what this means for HEICO specifically."

**Visual:** ROI calculator (built into the demo page, not a separate page):

```
┌─────────────────────────────────────────────────────┐
│  HEICO Impact Estimate                               │
│                                                      │
│  MRO Shops in Network:        [  62  ]  ← editable │
│  Parts Overhauled/Year:       [ 8,500 ] ← editable │
│  Avg. Paperwork Time/Part:    [ 90 min] ← editable │
│                                                      │
│  ─────────────────────────────────────────────       │
│                                                      │
│  Time Saved/Year:         12,750 hours               │
│  Labor Cost Saved:        $1.9M / year               │
│  Error Reduction:         15% → <1%                  │
│  Audit Prep Time:         Weeks → Minutes            │
│  Digital Thread Coverage: 0% → 94%+ per part         │
│                                                      │
│  5-Year Value:            $9.5M + risk reduction     │
└─────────────────────────────────────────────────────┘
```

The inputs should be editable so you can adjust for HEICO's actual numbers
during the meeting.

#### Step 7: "Try It Yourself" (open-ended)
**Narration:** "Want to try it? Pick any component and walk through an overhaul."

**Visual:** Return to the regular app. Let the CEO click around, ask questions,
explore freely. The demo is over — now it's conversation.

### 3. Demo Progress Bar

A thin progress bar at the top of the screen during the demo showing:
- Current step (1 of 7)
- Step name
- Elapsed time
- "Back" and "Next" navigation

```
━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 3 of 7: Evidence → Documents          4:32
[← Back]                              [Next →]
```

### 4. Presenter Notes (Optional)

A subtle "P" icon in the corner that toggles a floating panel with presenter
notes for each step. These are the specific talking points, transition phrases,
and "if they ask about X, say Y" prompts.

Notes should include:
- Key stats to mention
- Common CEO questions and suggested answers
- Technical details to have ready (but not volunteer)
- Transition phrase to next step

---

## Demo Script: The Talking Points

### Opening (before clicking Start)
"HEICO processes thousands of components through your MRO network every year.
Each one generates a stack of paperwork that a skilled technician has to write
by hand. What if that paperwork wrote itself — and caught errors that humans miss?"

### If they ask "Is this real AI or a demo?"
"The AI document generation is real — it uses Claude to analyze the captured
evidence and generate compliant forms. In demo mode, the capture evidence is
simulated, but the AI processing is the actual production system."

### If they ask about integration
"AeroTrack is designed to integrate with existing MRO systems. The data model
maps to standard aviation formats, and we expose APIs for integration with
ERP systems like SAP, AMOS, Ramco, and Quantum."

### If they ask about regulation
"The 8130-3 is AI-generated but human-approved. A licensed A&P/IA inspector
reviews and e-signs every release certificate before a part returns to service.
AeroTrack accelerates the documentation — it doesn't replace human judgment."

### Closing
"The question isn't whether MRO paperwork will be automated — it's who gets
there first. AeroTrack turns your mechanics' existing workflow into a digital
thread, without changing how they work."

---

## Acceptance Criteria

- [ ] Demo landing page exists at /demo with the three entry points
- [ ] Executive Demo flow has 7 steps with narration cards and live features
- [ ] Step 1 shows animated industry stats (paperwork hours, costs, error rates)
- [ ] Step 2 embeds the glasses-demo HUD with autopilot
- [ ] Step 3 shows the 8130-3 form rendering with generation animation (from spec 007)
- [ ] Step 4 shows Component 1 (clean) and Component 2 (gapped) digital threads (from spec 003)
- [ ] Step 5 shows the integrity dashboard with exception results
- [ ] Step 6 shows an editable ROI calculator with HEICO-relevant defaults
- [ ] Step 7 returns to the free-explore app
- [ ] Progress bar shows current step, step name, and elapsed time
- [ ] Back/Next navigation works between all steps
- [ ] Presenter notes panel toggleable via icon
- [ ] Demo flows smoothly without requiring the presenter to explain anything
- [ ] Works on a 13" laptop screen (common demo setup) and large external monitor
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
