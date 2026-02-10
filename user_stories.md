# AeroTrack MVP — User Stories

Everything you can currently do in the app, organized by who's doing it and why.

---

## 1. Executive Demo & Sales

These stories support the HEICO CEO presentation and sales conversations.

### 1.1 Run a Guided Executive Demo
**As a** sales presenter, **I can** launch a 7-step guided demo from `/demo` **so that** I can walk a prospective customer through AeroTrack's value proposition in a structured, repeatable way.

**What you can do:**
- Click "Start Executive Demo" to enter the guided flow
- Navigate forward/backward with arrow buttons or click any step dot to jump
- Toggle "Presenter Notes" to see talking points and Q&A answers for each step
- See an elapsed timer tracking how long you've been presenting
- Exit the demo at any time to return to the landing screen

### 1.2 Show the Industry Problem with Animated Stats
**As a** presenter, **I can** show Step 1 (The Problem) with animated counters **so that** the audience viscerally understands the scale of paperwork waste in MRO.

**What you see:**
- Four numbers animate up: 2.4M hours/year on paperwork, $180M labor cost, 15% error rate, 12 forms per overhaul
- Three warning callouts highlighting specific pain points

### 1.3 Demo the Smart Glasses Experience
**As a** presenter, **I can** link to the full glasses HUD simulation from Step 2 **so that** the audience sees what a mechanic's hands-free workflow looks like.

**What you can do:**
- Click "Launch Glasses Demo" to open the immersive simulation in a new tab
- The simulation auto-plays a 43-second scripted inspection (see Story 6.1)

### 1.4 Show AI-Generated FAA Documentation
**As a** presenter, **I can** trigger a live 8130-3 form generation in Step 3 **so that** the audience sees documentation appearing automatically from captured evidence.

**What you can do:**
- Click "Generate 8130-3" to trigger an animated form reveal
- Watch all 14 blocks of the FAA form populate with realistic data
- Download the form as a PDF

### 1.5 Compare Clean vs. Gapped Component Histories
**As a** presenter, **I can** show two components side-by-side in Step 4 **so that** the audience understands what a digital thread looks like vs. what a documentation gap looks like.

**What you see:**
- Component 1 (SN-2019-07842): 94% trace score, green checkmarks across all facilities
- Component 2 (SN-2018-06231): 67% trace score, red gap warning showing a 14-month undocumented period
- Click "View Digital Thread" on either to open the full timeline

### 1.6 Run a Live Fleet Scan for Exceptions
**As a** presenter, **I can** trigger a fleet-wide exception scan in Step 5 **so that** the audience sees AeroTrack catching real issues across a component fleet.

**What you can do:**
- Click "Scan All Components" to run the exception detection engine
- See results: how many components were scanned, how many have issues, total findings
- Browse the top exceptions with severity badges (Critical/Warning/Info)

### 1.7 Calculate Custom ROI
**As a** presenter, **I can** edit the ROI calculator inputs in Step 6 **so that** I can show the customer their specific financial opportunity.

**What you can do:**
- Edit four inputs: MRO shops (default 62), parts/year (8,500), paperwork minutes/part (90), hourly rate ($65)
- Watch six output metrics update in real-time: hours saved, labor cost saved, error reduction, audit time, digital thread coverage, 5-year value
- The 5-year value calculates from your custom inputs (default: ~$570M)

### 1.8 Let the Customer Explore Freely
**As a** presenter, **I can** end the guided demo at Step 7 **so that** the customer can click around the app on their own.

**What you can do:**
- Five navigation cards link to: Dashboard, Component Timeline, Capture Workflow, Glasses HUD, Integrity

---

## 2. Fleet Management

These stories support day-to-day parts tracking and oversight.

### 2.1 Browse the Parts Fleet
**As a** fleet manager, **I can** view all tracked components on the dashboard **so that** I have visibility into the entire fleet at a glance.

**What you see:**
- Five stat cards: Total Parts, Serviceable, In Repair, Open Alerts, Critical Alerts
- A searchable, filterable table of all components
- A pie chart showing status distribution

### 2.2 Search and Filter Components
**As a** fleet manager, **I can** search by part number, serial number, or operator and filter by status **so that** I can quickly find specific components.

**What you can do:**
- Type in the search box to filter across P/N, S/N, description, operator, and aircraft
- Use the status dropdown to filter: Serviceable, Installed, In Repair, Quarantined, Retired
- Results update in real-time

### 2.3 View a Component's Full Digital Thread
**As a** fleet manager, **I can** click any component to see its complete lifecycle history **so that** I can trace its provenance from birth to present.

**What you see:**
- **Facility flow chain**: A horizontal visualization showing every facility the part has passed through, with arrows between them and red gaps where documentation is missing
- **Trace score**: A percentage and color-coded bar (green/yellow/orange/red) rating documentation completeness
- **"What If" comparison**: Side-by-side of this component's trace score vs. the 38% industry average
- **Stats grid**: Age, hours, cycles, events, documents, gaps
- **Lifecycle timeline**: Every event in chronological order, expandable for full details including evidence, generated documents, parts consumed, and SHA-256 hashes
- **Exceptions & documents**: Any detected issues and attached documentation

### 2.4 Expand Individual Lifecycle Events
**As a** fleet manager, **I can** click any event in the timeline to expand it **so that** I see the full details including evidence, technician notes, and verification hashes.

**What you see (expanded):**
- Full description of the work performed
- Performer name and certifications
- Work order reference and CMM reference
- Evidence gallery (photos, voice notes, measurements, document scans)
- Generated documents (8130-3, work orders, findings reports)
- Parts consumed during the event
- Full SHA-256 hash for tamper evidence

### 2.5 Inspect Facility Journey Details
**As a** fleet manager, **I can** click any facility in the journey visualization **so that** I see all events that occurred at that location.

**What you see:**
- Facility name, type, and trust indicator
- Date range and duration at that facility
- All lifecycle events performed there
- Evidence counts per event (photos, voice notes, documents)

---

## 3. Maintenance Capture

These stories support the core overhaul documentation workflow.

### 3.1 Look Up a Component to Begin Work
**As a** mechanic, **I can** enter a serial number or part number on the Capture page **so that** I can identify the component and start the overhaul workflow.

**What you can do:**
- Type a serial number or part number (e.g., `SN-2019-07842` or `881700-1089`)
- Click "Look Up" (or press Enter)
- See the component details: P/N, S/N, description, status, hours, cycles
- Click "Begin Overhaul Capture" to enter the 6-step workflow
- Click "View Full History" to see the digital thread first

### 3.2 Complete Receiving Inspection (Step 1)
**As a** mechanic, **I can** check off receiving inspection items **so that** incoming condition is documented before work begins.

**What you can do:**
- Check 6 items: P/N match, S/N match, no damage, docs complete, 8130-3 tag, work order received
- See the workscope: "Full overhaul per CMM 29-10-01"
- Advance to the next step

### 3.3 Capture Evidence During Work (Steps 2-4)
**As a** mechanic, **I can** capture photos, voice notes, measurements, and text notes during teardown, inspection, and repair **so that** every action is documented as it happens.

**What you can do:**
- **Take Photo**: Adds a timestamped photo record to the evidence list
- **Record Voice Note**: Adds a voice recording with automatic transcription
- **Log Measurement**: Enter parameter name, value, and spec — measurement appears in the sidebar
- **Log Part Replacement** (Repair step only): Record what was replaced with P/N and reason
- **Add Text Note**: Free-form notes for anything else
- All captured evidence appears in the right sidebar in reverse chronological order
- The Work Summary card tracks counts: photos, voice notes, measurements, parts replaced, text notes

### 3.4 Record Test Results (Step 5)
**As a** mechanic, **I can** enter functional test values **so that** pass/fail status is automatically determined and documented.

**What you can do:**
- For each test (e.g., Pressure Test, Flow Rate Test): enter the measured value
- See PASS/FAIL badges update automatically based on whether the value meets spec
- Capture a photo of the test setup

### 3.5 Generate AI Documentation (Step 6)
**As a** mechanic, **I can** click "Generate Documentation" **so that** AI creates the FAA 8130-3 form, work order, findings report, and test results from all the evidence I captured.

**What you see:**
- AI processes all photos, voice notes, measurements, and test results
- A visual FAA Form 8130-3 renders with all 14 blocks populated
- Three summary cards show: work order details, findings count, test results
- PDF download button for the 8130-3

### 3.6 Approve and Sign Electronically (Step 6)
**As a** mechanic, **I can** click "Approve & Sign Electronically" **so that** the documentation is finalized with a cryptographic signature.

**What you see after signing:**
- Green success card: "Documentation Complete"
- Component status: "Returned to Service — Overhauled"
- Summary of all captured evidence (counts by type)
- SHA-256 hash of the signed document
- Lifecycle record confirmation
- Three export buttons: Export to AMOS/TRAX, Export to SkyThread, Scan Next Part

### 3.7 Run the Demo Autopilot
**As a** presenter, **I can** click "Play Demo" on the capture workflow **so that** the entire 6-step overhaul plays automatically with realistic data.

**What happens:**
- Step 1: All 6 checklist items auto-check, plus a photo and voice note
- Step 2: 4 evidence items auto-captured (photos + voice notes)
- Step 3: 5 items including measurements with specs and a tribal knowledge warning about seal degradation
- Step 4: Part replacement logged, service bulletin reference, reassembly notes
- Step 5: Two test results auto-filled (3,000 PSI pressure test, 12.4 GPM flow rate — both PASS)
- Step 6: AI generates all documentation automatically
- You can stop the autopilot at any time with the Stop button

### 3.8 Toggle Restricted Mode (ITAR Compliance)
**As a** mechanic working on restricted components, **I can** toggle Restricted Mode **so that** camera functions are disabled for ITAR compliance while all other capture tools remain available.

**What changes:**
- Yellow banner appears: "RESTRICTED MODE — Camera disabled for ITAR compliance"
- Photo buttons become disabled
- Voice notes, measurements, text notes, and all other tools still work

---

## 4. Integrity & Compliance

These stories support quality assurance and exception management.

### 4.1 Run a Fleet-Wide Exception Scan
**As a** quality manager, **I can** click "Run Full Scan" on the Integrity page **so that** AeroTrack automatically detects inconsistencies across all components.

**What you can do:**
- Click "Run Full Scan" — see a loading spinner while it processes
- See results banner: "Scan complete — X components checked, Y with exceptions, Z total findings"
- Four summary cards update: Open Exceptions, Critical, Warning, Resolved

### 4.2 Filter and Review Exceptions
**As a** quality manager, **I can** filter exceptions by type, severity, and status **so that** I can focus on what matters most.

**What you can do:**
- Filter by type: Serial Mismatch, Part Mismatch, Documentation Gap, Missing Cert, Cycle Count Discrepancy, etc.
- Filter by severity: Critical, Warning, Info
- Filter by status: Open, Investigating, Resolved, False Positive
- Each exception shows: severity badge, type, component link, description, detection date

### 4.3 Triage Exceptions
**As a** quality manager, **I can** mark exceptions as Investigating, Resolved, or False Positive **so that** the team can track remediation progress.

**What you can do:**
- Click the eye icon to mark an exception as "Investigating"
- Click the checkmark to mark it "Resolved"
- Click the X to mark it "False Positive"
- Resolved/false positive exceptions fade to 60% opacity

### 4.4 Verify a Single Component
**As a** quality manager, **I can** click "Verify" on a component's detail page **so that** I can run the exception scan on just that one part.

**What happens:**
- Triggers a scan for that specific component
- Any new exceptions appear in the exceptions section of the component detail page

---

## 5. Knowledge Management

These stories support preserving and accessing institutional expertise.

### 5.1 Search the Knowledge Library
**As a** mechanic, **I can** search the Knowledge Library by topic, part family, or expert name **so that** I can find relevant institutional knowledge before starting work.

**What you can do:**
- Type a search term (e.g., "corrosion", "HPC-7", "seal")
- Results filter in real-time
- Each entry shows: topic, part family, the expert's insight (quoted), expert name, years of experience, certification, and related tags
- CMM references are shown when available

---

## 6. Smart Glasses HUD

These stories support the hands-free vision for the product.

### 6.1 Watch the Smart Glasses Simulation
**As a** viewer, **I can** start the 43-second HUD simulation **so that** I see what a mechanic's hands-free workflow looks like through smart glasses.

**What you see:**
- Full-screen black HUD with green monospace text
- Camera viewport cycles through 7 images matching the inspection phases
- Voice transcription appears in real-time as the mechanic "speaks"
- BOM panel shows 6 sub-components of the hydraulic pump, each with a part number — they get checked off as the mechanic inspects them (3 of 6 during the demo)
- Findings panel populates with color-coded results (green = serviceable, amber = recommend replace)
- Measurements panel shows values against specs
- Photo flash effects trigger when photos are captured
- AI note appears recommending seal replacement based on fleet data
- Documents generate at the end: FAA 8130-3, Work Order, Provenance Records
- Final status shows time saved: ~1.5 hours vs. manual paperwork

### 6.2 Exit the Simulation
**As a** viewer, **I can** click EXIT at any time **so that** I return to the pre-start screen.

---

## 7. Export & Print

These stories support getting data out of the system.

### 7.1 Export a Component Trace as PDF
**As a** fleet manager, **I can** click "Export PDF" on a component's detail page **so that** I get a downloadable PDF of the full digital thread.

### 7.2 Download a Generated 8130-3 as PDF
**As a** mechanic, **I can** click the PDF download button on a generated 8130-3 form **so that** I have a printable copy of the FAA release document.

### 7.3 Print QR Code Labels
**As a** demo coordinator, **I can** go to `/print-labels` and click "Print Labels" **so that** I get printable QR code labels for all components to tape onto physical demo props.

**What you see:**
- A 2-column grid of label cards, each with a QR code, part number, serial number, and description
- Click "Print" to trigger the browser's print dialog
- Print-optimized CSS ensures clean output

---

## 8. Analytics (Visualization Only)

### 8.1 View Fleet Analytics Charts
**As a** fleet manager, **I can** browse the Analytics page **so that** I see data-driven insights about fleet performance.

**What you see (mock data):**
- **NFF Rate by Part Family**: Bar chart comparing no-fault-found rates across 4 part families
- **Mean Time Between Removals**: Line chart showing MTBR trending upward over 6 months
- **Repair Turnaround by Facility**: Horizontal bar chart comparing 5 MROs by average days
- **Record Quality Distribution**: Donut chart showing 68% digital, 22% scanned PDF, 10% missing/gap

---

## Summary: Feature Count

| Area | User Stories | Interactive Elements |
|------|-------------|---------------------|
| Executive Demo | 8 | Guided flow, ROI calculator, fleet scan, form generation |
| Fleet Management | 5 | Search, filter, timeline expansion, facility drill-down |
| Maintenance Capture | 8 | 6-step workflow, photo/voice/measurement capture, AI generation, signing, autopilot |
| Integrity | 4 | Fleet scan, filtering, exception triage |
| Knowledge | 1 | Search with real-time filtering |
| Smart Glasses | 2 | Scripted simulation with BOM tracking |
| Export & Print | 3 | PDF export, PDF download, label printing |
| Analytics | 1 | Chart hover tooltips |
| **Total** | **32** | |
