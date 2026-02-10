# AeroTrack Executive Demo Transcript

## Pre-Demo Setup

**Total runtime:** 18–22 minutes (adjust by skipping or expanding sections)

### Laptop Setup (do this 10 minutes before)

1. Open Chrome with these tabs pre-loaded (in this order):
   - **Tab 1:** `http://localhost:3001` (AeroTrack landing page — dark theme, "Built for Parker Aerospace")
   - **Tab 2:** `http://localhost:3001/glasses-demo` (glasses demo — DON'T click start yet)
   - **Tab 3:** `http://localhost:3001/capture` (capture tool — blank, ready to scan)
   - **Tab 4:** `http://localhost:3001/parts/demo-hpc7-overhaul` (part detail page — pre-loaded)
   - **Tab 5:** `http://localhost:3001/integrity` (integrity dashboard — don't scan yet)
   - **Tab 6:** `http://localhost:3001/analytics` (analytics — static, just for showing)
   - **Tab 7:** `http://localhost:3001/knowledge` (knowledge library)
2. **Prep for RecordSnap demo:** Have a photo of an 8130-3 form or any aerospace document saved on your desktop (or have a printed one ready to photograph if presenting from a tablet). This is for the document scanning feature in Section 3.
3. Have your PowerPoint deck open in presenter mode on a separate display (or ready to pull up)
4. Set Chrome zoom to **90%** so more fits on screen (Cmd + minus)
5. Make sure the dev server is running: `cd ~/Desktop/Primary_OIR/AeroVision/MVP/aerotrack-mvp && npm run dev`
6. Hit the landing page once to warm up Tailwind CSS compilation

### PowerPoint Slides to Prepare

You'll use slides to frame context before each live demo section. Here's what to build:

| Slide # | Title | Content | Notes |
|---------|-------|---------|-------|
| 1 | Title | "AeroTrack" logo/name. Subtitle: "The mechanic works. The paperwork writes itself." Your name, Primary Venture Partners | Clean, minimal. No clutter. |
| 2 | The Problem | Hero stat: "60%" huge font. Below it: "of a mechanic's day is paperwork, not fixing airplanes." Source: McKinsey 2024 | One number. Let it breathe. |
| 3 | The Scale | Four stats in a grid: "520,000 suspected unapproved parts/year (FAA)" / "$114B global MRO market, still on paper (Oliver Wyman)" / "44–73% of maintenance errors are documentation failures (FAA)" / "50–75 pieces of paper per overhaul (Impresa)" | All sourced. Credibility matters. |
| 4 | The Crisis | Two side-by-side cards: "1 in 3 mechanics will retire within a decade (Oliver Wyman 2023)" and "$10K–$150K/hr — cost of a grounded aircraft from documentation failure" | Workforce + financial risk together |
| 5 | AOG Technics | Photo or headline from the scandal. "In 2023, one company sold parts with forged FAA 8130-3 tags. 120+ aircraft grounded. Delta, United, American, Southwest — all affected." | This is your emotional hook. Let it breathe. |
| 6 | The Insight | "What if the documentation wrote itself — while the mechanic works?" | One line. Big font. Transition slide. |
| 7 | How It Works | Simple 3-step visual: "1. Mechanic works with smart glasses → 2. AI captures everything automatically → 3. FAA documents generate instantly" | Keep it visual, not wordy |
| 8 | The Opportunity | For HEICO: "62 MRO shops. 8,500+ overhauls/year. One platform." For Parker: "Every Parker component, traceable from birth to retirement." | Customize per audience |
| 9 | The Ask | "Pilot program: 2 shops, 90 days, measurable ROI" | Your close. Specific, low-risk. |
| 10 | Contact | Your info, Primary Venture Partners | Standard closer |

> **Alternative to slides for Section 1:** The guided demo at `/dashboard/demo` Step 1 now has all these stats built in with animated counters, sourced citations, and the AOG Technics scandal card. You can skip slides 2–5 entirely and run Step 1 of the guided demo instead. Practice both ways and see which feels more natural.

---

## The Transcript

> **Format guide:**
> - Regular text = what you say out loud
> - **[ACTION]** = what you do on the laptop
> - **[SLIDE]** = advance to this PowerPoint slide
> - **[PAUSE]** = intentional silence — let the room absorb
> - **[IF ASKED]** = answers to likely questions at that moment
> - *(italics)* = tone/delivery notes

---

### SECTION 1: THE PROBLEM (3–4 minutes)

**[SLIDE 1 — Title]**

Thanks for making the time. I'll keep this tight — about 20 minutes, and most of it is a live demo, not slides.

I want to show you something we've been building that I think solves one of the biggest unseen problems in aerospace MRO. And I want to start with a number.

**[SLIDE 2 — 60%]**

Sixty percent.

**[PAUSE — 2 seconds]**

That's how much of a certified mechanic's day is spent on paperwork. Not fixing airplanes. Not inspecting components. Paperwork. *(let that land)* McKinsey published this in their 2024 report on generative AI in airline maintenance, and when we talked to mechanics, they said sixty percent sounded low.

**[SLIDE 3 — The Scale]**

Now look at the scale of this. The FAA's Suspected Unapproved Parts program flags 520,000 suspected counterfeit parts entering aircraft every year. The global MRO market is $114 billion — and most of it is still running on handwritten forms. The FAA's own Human Factors research found that 44 to 73 percent of maintenance errors involve documentation failures. And a single overhaul generates 50 to 75 pieces of paper.

**[SLIDE 4 — The Crisis]**

And the workforce behind all this paperwork? One in three A&P mechanics will reach retirement age within a decade. Oliver Wyman published that in 2023. When they walk out the door, decades of knowledge — the stuff that's not in any CMM, the "I know that seal looks fine but it's going to fail at 8,000 hours" kind of knowledge — that walks out with them.

Meanwhile, a single documentation error can ground an aircraft at $10,000 to $150,000 per hour.

**[SLIDE 5 — AOG Technics]**

*(slow, serious tone)* And here's what happens when this system fails completely. In 2023, a company called AOG Technics was caught selling aerospace parts with forged 8130-3 documentation. Fake airworthiness certificates. These parts ended up on aircraft at Delta, United, American, Southwest — over 120 aircraft had to be grounded.

This wasn't a hypothetical risk. This happened. And it happened because there is no automated way to verify documentation at the source.

**[PAUSE]**

**[SLIDE 6 — The Insight]**

So we asked a simple question: what if the documentation wrote itself — while the mechanic works? What if you could eliminate the paperwork without eliminating the paper trail?

That's AeroTrack.

**[SLIDE 7 — How It Works]**

The concept is simple. A mechanic wears smart glasses — or uses a tablet today — and as they work, the system captures everything. Photos, voice notes, measurements. AI processes all of it in real time and generates the FAA compliance documents automatically. 8130-3, Form 337, 8010-4 — all of them. The mechanic reviews, signs, done.

Now let me stop talking about it and show you.

**[IF ASKED: "Is this real or a concept?"]** Everything I'm about to show you is a working prototype. Live code, real data, functional AI. Not a mockup, not a Figma file.

**[IF ASKED: "Is AI-generated documentation legally valid?"]** Yes. FAA Advisory Circular AC 120-78B explicitly allows electronic signatures and records. AeroTrack follows what we call the "AI-assisted, human-approved" model — the AI drafts the form from captured evidence, a certified A&P or IA reviews and signs. Fully compliant.

**[IF ASKED: "Where do these numbers come from?"]** McKinsey "Generative AI in Airline Maintenance" 2024, Oliver Wyman MRO Forecast 2024, FAA Suspected Unapproved Parts Program data, FAA Human Factors in Aviation Maintenance report 2012, and Impresa Corp fleet management data. Happy to share the sources.

---

### SECTION 2: THE SMART GLASSES (4–5 minutes)

**[ACTION: Switch to Tab 2 — Glasses Demo]**

So imagine you're a mechanic. You've got a hydraulic pump on the bench — a component that's come in for overhaul. You put on the glasses and this is what you see.

**[ACTION: Click "[START SIMULATION]"]**

*(As the HUD initializes — dark green terminal aesthetic)*

The glasses boot up. You see the AeroTrack HUD. It's recording — see the red dot up top — and it's connected to the shop's WiFi so everything syncs in real time.

*(QR code scan happens — ~5 seconds in)*

The mechanic looks at the part, and the system identifies it instantly via the data plate. Part number 881700-1089, serial number SN-2024-11432. It pulls the full bill of materials — every sub-component — and loads the CMM requirements automatically.

*(BOM loads on the right side)*

See on the right? That's the BOM. Six sub-components, each with inspection requirements loaded from the component maintenance manual. As the mechanic inspects each one, they just check it off — hands-free, voice-controlled.

*(Photos start being captured — watch for the flash effect)*

Now the mechanic is inspecting. Every time they look at something critical, the glasses auto-capture a photo. See the flash? That photo is timestamped, geotagged, and linked to this specific component's record. No clipboard, no handwriting, no going back to a desk to type it up later.

*(Measurements appear)*

Measurements feed in automatically — bore diameter, backlash, seal hardness. Each one is cross-referenced against the CMM spec in real time. Green means within limits.

*(Voice transcription starts appearing)*

And here's the key — the mechanic is just talking. "Bore looks good, measuring at 2.4985, spec is 2.500 plus or minus two thou — within limits." The system transcribes it, structures it, and knows exactly which inspection finding that voice note belongs to.

*(Inlet seal finding — the dramatic moment)*

Now watch this. The mechanic finds a degraded inlet seal. Shore 82A — technically within limits, but experienced mechanics know that's marginal at these hours. The system flags it, and — this is important — it captures the mechanic's expert judgment: "I'd replace it given the hours on this unit."

That's tribal knowledge. The kind of thing that walks out the door when a mechanic retires. AeroTrack captures it as a natural byproduct of the work.

*(Documents begin generating)*

Now all six steps are done. Evidence is captured. And watch what happens — the system starts generating the compliance documents automatically.

*(Transition to generating screen — 3.5 seconds)*

43 seconds of video analyzed. Voice transcript parsed. Three measurements cross-referenced against specs. And now it's auto-populating three FAA documents.

*(Document review screen appears — light theme)*

**[ACTION: Let the 8130-3 form animate its rows]**

And here's the output. A complete FAA 8130-3 — the airworthiness release certificate. Every field populated from the evidence that was just captured. Part identification, inspection findings, test results, conformity statement — all of it.

**[ACTION: Click the "FAA Form 337" tab]**

Form 337 — the major repair record. Same data, different form, generated simultaneously.

**[ACTION: Click the "FAA 8010-4" tab]**

And this is my favorite. The 8010-4 — the defect/malfunction report. But look at this callout at the top.

*(Point to the AI pattern detection card)*

The AI didn't just fill out the form. It cross-referenced this finding against the fleet data and detected a pattern: seal degradation on this part number accelerates after 7,500 hours. Four of twelve fleet units required unscheduled replacement. That's not in any CMM. That's the kind of insight that only comes from analyzing thousands of overhauls — and the system auto-generated this defect report to alert the FAA. No human had to notice the pattern.

**[PAUSE — let them absorb]**

One mechanic. One overhaul. Zero typing. Three FAA documents. And a fleet-wide safety insight that would have taken months to discover manually.

**[IF ASKED: "How long does this normally take?"]** The documentation for a single overhaul typically takes hours — our sources show 50 to 75 pieces of paper per overhaul. What you just saw took 43 seconds of capture time, plus about 5 seconds of AI processing.

**[IF ASKED: "What about EASA?"]** EASA is phasing in digital compliance requirements through 2027 under its Part 145 modernization roadmap. Companies that adopt now will be ahead. Companies that wait will face costly catch-up.

---

### SECTION 3: THE PRACTICAL WORKFLOW (4–5 minutes)

Now, I showed you the future — smart glasses on the shop floor. But we also built the practical version that works today, no special hardware needed.

**[ACTION: Switch to Tab 3 — Capture Tool]**

This is the capture tool. A mechanic opens this on a tablet at the bench. And here's something cool — watch this.

#### RecordSnap: Document Scanning

**[ACTION: Click the "Scan a Document" button on the left side]**

*(The camera/file picker opens)*

**[ACTION: Select your pre-saved photo of an 8130-3 or aerospace document]**

The mechanic snaps a photo of the existing paperwork — maybe an incoming 8130-3 tag, a data plate, or an old maintenance record. Watch what happens.

*(Photo appears with "Extracting data..." spinner overlay)*

The AI is analyzing the image right now — reading every field, extracting structured data.

*(Extraction completes — green "Data Extracted" card appears below the photo)*

And there it is. Document type, part number, serial number, description, manufacturer, date — all pulled automatically from a photo. See the confidence badge? That tells the mechanic how reliable the extraction is.

*(Point to the "Component automatically matched" indicator if it appears)*

And notice — it didn't just extract the data, it automatically searched the database and found the matching component. One photo, zero typing, and the mechanic is ready to start the overhaul.

**[PAUSE — let that sink in]**

This is what we call RecordSnap. In the real world, mechanics receive stacks of paper with every incoming part. RecordSnap digitizes all of it in seconds.

#### Manual Lookup (Backup Path)

Now, you can also do it the traditional way —

**[ACTION: On the right side, type "881700-1089" in the search box and click "Look Up"]**

— type the part number, look it up. Same result, just manual. But the scan is faster and eliminates transcription errors.

#### The 6-Step Overhaul Capture

**[ACTION: Click "Begin Overhaul Capture"]**

Now they're in the six-step overhaul workflow. Receive, teardown, inspect, repair, test, release. Let me run the demo mode so you can see the full flow.

**[ACTION: Click "Play Demo" button]**

*(Blue pulsing banner appears — "Demo Mode")*

Watch the right side — that's the evidence feed. As the mechanic works through each step, every photo, voice note, measurement, and part replacement gets logged automatically with timestamps.

*(Receiving checklist auto-completes)*

Step one — receiving inspection. Checklist items checking off: part number verified, serial number verified, no shipping damage, traceability docs complete, 8130-3 tag present.

*(Steps advance automatically — narrate as it goes)*

Teardown... photos of housing, voice notes describing what they see. Inspection... measurements feeding in, bore diameter within spec. Repair... seal kit replaced, service bulletin incorporated. *(point to the evidence items appearing)*

Every single action is captured. No paperwork. The mechanic stays on the bench.

*(Test step — results auto-fill)*

Functional testing — pressure test, 3,000 PSI, held for five minutes, zero leakage. Flow rate 12.4 GPM, within spec. Both pass.

*(Release step — documentation generates)*

And now the magic — release step. Documentation generates automatically.

**[ACTION: Let the 8130-3 render with animated rows]**

There's your 8130-3. Generated from the evidence. Every field traceable back to a specific photo, voice note, or measurement. And at the bottom — a SHA-256 cryptographic hash. This document is tamper-evident. If anyone changes a single character, the hash breaks.

*(Point to the "Approve & Sign" button)*

The mechanic reviews it, taps "Approve & Sign," and that component's entire overhaul — from receiving to release — is documented, signed, and sealed. Born digital.

**[IF ASKED: "What systems does this integrate with?"]** *(point to the export buttons)* We've built export paths for AMOS, TRAX, and we're designing the SkyThread integration now. The data is structured — it can flow into any MRO system.

**[IF ASKED: "What if they don't have smart glasses yet?"]** That's exactly why we built this tablet workflow. The glasses are the vision; the tablet capture tool is what works today. A shop can start getting value immediately, and the glasses become an upgrade path.

---

### SECTION 4: THE DIGITAL THREAD (3–4 minutes)

Now let me show you why this matters beyond a single overhaul. Because the real value isn't one document — it's the entire life of a component.

**[ACTION: Switch to Tab 4 — Parts Detail Page for demo-hpc7-overhaul]**

This is the digital thread for the hydraulic pump we just overhauled. Birth to present. Every facility it's been through, every event, every document — all connected.

*(Point to the facility flow chain at the top)*

See this chain? Manufactured at Eaton Aerospace in Jackson, Mississippi. Installed on a Delta 737 at their Atlanta TechOps facility. Removed at 6,200 hours. Sent to StandardAero in Dallas for overhaul. Then to Parker Aerospace for distribution. Then to a regional carrier. Back to MRO. And now — released to service from our overhaul.

Every stop is verified. Green dots mean complete documentation. If there were a gap — a period where nobody can account for where this part was — you'd see a red warning.

*(Point to the trace score and sparkline)*

This component has a 94% trace score. See this sparkline chart? That's the hours accumulation over time — you can toggle to cycles. It gives you an instant visual of how this part has been used across its entire life.

**[ACTION: Click the "Cycles" toggle on the sparkline to show that it's interactive]**

*(Point to the life consumption gauge below the sparkline)*

And this gauge shows how much of the component's service life has been consumed. Green means plenty of life left. As it approaches limits, it shifts to yellow, then red. For life-limited parts, this becomes a hard limit bar — you can see exactly how many cycles remain before mandatory replacement.

*(Scroll down to the lifecycle timeline)*

**[ACTION: Point out the event type filter chips above the timeline]**

See these filter chips? Each event type has a toggle. A maintenance planner can filter to just inspections, or just repairs, and see the pattern. Watch —

**[ACTION: Click one or two filter chips to toggle them off, then click "Show all" to reset]**

Now let me expand an event to show what's inside.

**[ACTION: Click on the "release_to_service" event to expand it]**

Look at the detail. Performer name, certifications, work order reference, CMM reference. Evidence counts — photos, voice notes, measurements. And the SHA-256 hash — every record is immutable.

*(Point to the document chips on the event)*

See these green chips? Those are the compliance documents attached to this event — 8130-3, Form 337, 8010-4. Green means present. If a required document were missing, you'd see a dashed red chip with a question mark. At a glance, you know exactly what's documented and what's not.

*(Scroll to the Compliance Documents section)*

**[ACTION: Scroll to the "Compliance Documents" card]**

And here they all are in one place. Every AI-generated compliance document from every maintenance event, with status badges and download buttons.

**[ACTION: Click the "PDF" button on one of the documents to download it]**

That PDF is audit-ready. Right now. No scanning, no filing, no retrieval from a dusty cabinet.

*(Lean into the industry context)*

The FAA's Suspected Unapproved Parts program flags 520,000 suspected counterfeit parts annually — most of them enter through chain-of-custody breaks exactly like the gaps AeroTrack prevents. When every event is documented automatically, gaps become impossible.

**[IF ASKED: "What's the trace score based on?"]** It's a composite metric. We look at documentation completeness, time gaps between events, evidence quality, and chain-of-custody continuity. A perfect score means every event in the component's life is documented with verifiable evidence and no unexplained gaps.

---

### SECTION 5: FLEET INTELLIGENCE (2–3 minutes)

Everything I've shown you so far is one component. But the power multiplies at fleet scale.

**[ACTION: Switch to Tab 5 — Integrity Dashboard]**

This is the integrity and compliance dashboard. Think of it as a fleet-wide immune system.

**[ACTION: Click "Run Full Scan"]**

*(Wait for scan to complete — shows results banner)*

We just scanned every component in the system. *(read the results)* — components checked, exceptions found, total findings. The system automatically flags documentation gaps, unusual custody transfers, expired certifications, missing evidence.

*(Point to the exception cards)*

Each exception is color-coded. Red means critical — this needs immediate attention. Yellow is a warning. And each one links directly to the component so you can drill in and investigate.

Now imagine this running across all your shops. Every component, every overhaul, continuously monitored. An auditor walks in? You hand them this dashboard. Everything is already organized, searchable, and verified.

**[ACTION: Switch to Tab 7 — Knowledge Library]**

And one more thing. Remember the mechanic who said "I'd replace that seal given the hours on this unit"? That expert judgment gets stored here — the knowledge library. Searchable by topic, part family, or expert name.

*(Point to a knowledge entry)*

This is how you preserve thirty years of expertise when someone retires. It's captured as they work — not in some separate training program they'll never have time for. That's critical when one in three of your mechanics is approaching retirement.

**[IF ASKED: "How does this compare to what we have today?"]** Most MRO shops use a combination of paper forms, scanned PDFs, Excel spreadsheets, and maybe an ERP system like AMOS or TRAX. None of those systems link the evidence — the photo, the voice note, the measurement — directly to the document. And none of them can detect patterns across the fleet. AeroTrack does both.

---

### SECTION 6: THE OPPORTUNITY (2–3 minutes)

**[SLIDE 8 — The Opportunity]**

*(Tailor this section to the audience)*

#### If presenting to HEICO:

So let's talk about what this means for HEICO specifically.

You have over 60 MRO shops. Thousands of overhauls per year. Every single one generates a stack of compliance documentation that's mostly done by hand.

Let me show you the math.

**[ACTION: Switch back to browser — navigate to `localhost:3001/dashboard/demo`, click "Start Executive Demo", advance to Step 6 (ROI)]**

At 62 shops, 8,500 parts per year, 90 minutes of paperwork per part at $65 an hour — the labor savings alone are significant. But that's actually the small number.

**[ACTION: Click "Show Advanced Inputs" to expand the full ROI calculator]**

Here's where it gets interesting. AOG avoidance — better documentation means fewer aircraft-on-ground events caused by paperwork errors. At 10 events avoided per year at an average cost of $150,000 each, that's $1.5 million annually. Audit cost reduction — when everything is digital and searchable, audit prep drops by 60%. Counterfeit risk reduction — when every component has a complete digital thread, forged documentation can't enter the chain.

*(Point to the 5-year total value card)*

Over five years, we're looking at north of $25 million in total value across the HEICO network. And these inputs are editable — adjust them to your actual numbers.

*(Point to the stacked bar chart)*

And this breakdown shows where the value comes from. Labor savings are real but they're not the biggest driver. AOG avoidance and fleet value preservation — those are the numbers that move the needle.

#### If presenting to Parker Aerospace:

So let's talk about what this means for Parker.

Every component Parker manufactures enters an aftermarket ecosystem you can't see. Once it ships to a customer, you lose visibility. If it gets overhauled by a third-party MRO, you might never see the maintenance records. If there's a service bulletin, you're relying on manual distribution and hoping every shop reads it.

AeroTrack changes that. Every Parker component that goes through an AeroTrack-equipped shop generates structured, digital records that can flow back to you. You'd know exactly how your components perform in the field. Which ones fail early. Which maintenance practices lead to better outcomes. That's data you've never had access to.

And it integrates directly with the SkyThread initiative — the digital thread you're already building from the OEM side. AeroTrack is the MRO-side complement. *(Point to the landing page tab)* You'll notice the app already says "Built for Parker Aerospace" — we designed this with your ecosystem in mind.

---

### SECTION 7: THE CLOSE (1–2 minutes)

**[SLIDE 9 — The Ask]**

*(Slow down. This is the most important part.)*

The aerospace industry is moving to digital thread. EASA is phasing in mandatory digital compliance through 2027. The FAA is heading the same direction. The question isn't whether this happens — it's who gets there first.

Everything I showed you today is live. This isn't a slide deck — it's a working system. We built this in weeks, not years, because the AI infrastructure has finally caught up to the problem.

What I'd propose is simple: a pilot program. Two shops. Ninety days. We instrument them with AeroTrack, run real overhauls through the system, and measure the results — time saved, documentation quality, error rates. You'll see the ROI in the first month.

*(Direct, eyes on the decision-maker)*

I'd love to set that up. Who on your team would be the right person to scope the pilot with us?

**[SLIDE 10 — Contact]**

**[PAUSE — let them respond. Don't fill the silence.]**

---

## Handling Q&A

### Top 10 Questions You'll Get (and How to Answer)

**Q1: "What about data security / ITAR?"**
The system has a restricted mode — *(pull up the capture tool, toggle the Restricted Mode switch)* — when enabled, camera access is disabled for ITAR-controlled components. All data stays on-premise or in your cloud environment. We're not a SaaS where your data sits on our servers — this deploys inside your firewall.

**Q2: "How accurate is the AI?"**
The AI generates a draft. A certified A&P or IA always reviews and signs. We're not replacing human judgment — we're eliminating the typing. In our testing, the AI-generated forms match hand-filled forms with over 95% accuracy, and the mechanic catches the rest during review.

**Q3: "What hardware do we need?"**
For the glasses experience — we're hardware-agnostic, working with partners on the glasses side. But the capture tool and RecordSnap document scanning work today on any tablet or laptop. No special hardware. The glasses are the future; the tablet workflow is the present.

**Q4: "How does this integrate with AMOS/TRAX/SAP?"**
We've designed the data schema to map directly to the standard MRO system fields. Export is built in — *(point to the export buttons on the capture tool)*. For a pilot, we'd work with your IT team to set up the data bridge.

**Q5: "What's your pricing model?"**
We're finalizing pricing tiers — we'll have specifics for the proposal. Our model is designed so the ROI is obvious within the first quarter. Think per-overhaul or per-shop-per-month, not a massive enterprise license upfront.

**Q6: "Who else is doing this?"**
Nobody is doing exactly this. There are electronic logbook companies (like Flightdocs), MRO software platforms (like IFS/TRAX), and inspection tools — but none of them capture evidence at the point of work and generate compliance documents from it. We're the first to close that loop.

**Q7: "What about the AOG Technics scandal?"**
In 2023, AOG Technics was found to have sold thousands of parts with forged 8130-3 documentation to major airlines. 120+ aircraft were grounded. This happened because there's no automated way to verify documentation at the source — exactly what AeroTrack solves. Every AeroTrack document is cryptographically sealed and traceable back to captured evidence.

**Q8: "What happens if the AI makes a mistake?"**
Same thing that happens today when a mechanic makes a typo on a paper form — the reviewing inspector catches it. The difference is the AI makes far fewer errors than manual data entry, and every field is traceable back to source evidence, so errors are easy to verify and correct.

**Q9: "How long to implement?"**
For a pilot: 2–4 weeks to set up, then 90 days of live usage. We handle deployment and training. No heavy IT lift required for the pilot phase.

**Q10: "What about European regulations?"**
EASA is phasing in digital compliance requirements through 2027 under its Part 145 modernization roadmap. Companies that adopt digital documentation now will transition smoothly; companies that wait will face rushed, expensive implementations under regulatory pressure.

**Q11: "What about the workforce crisis?"**
Oliver Wyman projects 1 in 3 A&P mechanics will reach retirement age within a decade. AeroTrack preserves tribal knowledge by capturing it during the normal workflow — the knowledge library you saw stores expert insights by topic and part family. New mechanics get AI-assisted guidance from day one.

---

## Demo Recovery Playbook

Things go wrong in live demos. Here's what to do:

| Problem | Recovery |
|---------|----------|
| Page shows a white screen or error | Refresh the tab. Say: "Live software — let me refresh that." Keep talking while it loads. |
| Glasses demo freezes mid-sequence | Click [EXIT], then re-enter and click [START SIMULATION] again. Say: "Let me restart that sequence." |
| Capture demo autopilot stalls | Click "Stop", refresh the page, re-navigate. Say: "Let me pull that back up." |
| RecordSnap extraction fails | Say: "The AI extraction calls a language model — let me retry that." Click "Try Again." If it still fails, pivot to manual lookup: "In practice, you can always fall back to manual entry." Type the part number instead. |
| API call fails (8130 doesn't generate) | Say: "The AI generation uses a language model call that sometimes needs a moment." Refresh and retry once. If it fails again, switch to Tab 4 (parts page) and show the pre-generated documents there instead. |
| Part lookup returns "not found" | Use serial number search instead: "SN-2024-11432". If that fails, go directly to Tab 4 (pre-loaded parts page). |
| Internet goes down | The glasses demo and capture tool work with pre-seeded data. Only the AI generation and RecordSnap calls need internet. Say: "The core system works offline — the AI features sync when connected." |
| Audience asks to see something you didn't prepare | Open the dashboard (Tab 1 → Enter Dashboard) and navigate from there. The whole app is functional — you can explore anything live. |

---

## Timing Cheat Sheet

| Section | Target Time | Running Total |
|---------|-------------|---------------|
| 1. The Problem (slides) | 3–4 min | 4 min |
| 2. Smart Glasses Demo | 4–5 min | 9 min |
| 3. Capture Workflow + RecordSnap | 4–5 min | 14 min |
| 4. Digital Thread | 3–4 min | 18 min |
| 5. Fleet Intelligence | 2–3 min | 21 min |
| 6. The Opportunity | 2–3 min | 23 min |
| 7. The Close | 1–2 min | 24 min |

**If running short on time:** Cut Section 5 (Fleet Intelligence) — mention it verbally but skip the live demo. Go from Digital Thread straight to The Opportunity.

**If they're super engaged and asking questions:** That's great — let the conversation flow. Sections 3 and 5 are the most cuttable. The must-shows are: Glasses Demo (Section 2), Digital Thread (Section 4), and The Close (Section 7). If cutting Section 3, still briefly mention RecordSnap: "We also have a document scanner that reads any 8130-3 or maintenance record with a phone camera — I can show you after."

---

## Day-Before Checklist

- [ ] Dev server runs without errors
- [ ] All 7 tabs load correctly
- [ ] Glasses demo plays through without freezing
- [ ] RecordSnap works: test with a sample document photo (have the photo saved on desktop as backup)
- [ ] Capture demo autopilot runs to completion
- [ ] Parts detail page shows full timeline, sparkline, life gauge, and compliance documents for demo-hpc7-overhaul
- [ ] At least one compliance document PDF download works from the parts page
- [ ] Event type filter chips toggle correctly on the timeline
- [ ] Integrity scan completes
- [ ] ROI calculator advanced inputs expand and the 5-year total shows $25M+
- [ ] PowerPoint slides are finalized and loaded
- [ ] Laptop charged or plugged in
- [ ] Know the WiFi situation at the venue (bring a hotspot as backup — AI calls need internet)
- [ ] Practice the full run-through at least twice
