# ProvenAir Feature Clone Guide for AeroTrack

> **Purpose:** This document identifies every ProvenAir product feature relevant to AeroTrack's use cases (component lifecycle tracking + lease return transitions), explains what it does, provides user stories, and gives implementation instructions for Claude Code to build each one.
>
> **Context:** ProvenAir ($5.3M raised, ~$750K ARR, customers include United Airlines, Lufthansa, British Airways, Allegiant, BBAM, Willis Lease) focuses on **digitizing existing paper records** to generate back-to-birth trace for life-limited parts. AeroTrack's advantage is that it generates **born-digital records** at the point of work — but it should also be able to ingest and analyze legacy paper records the way ProvenAir does. These features fill AeroTrack's gaps and make it a superset of ProvenAir's offering.

---

## Table of Contents

1. [AI Document Scanning & Auto-Categorization](#1-ai-document-scanning--auto-categorization)
2. [Back-to-Birth Trace Timeline Generation](#2-back-to-birth-trace-timeline-generation)
3. [Automated Exception & Error Detection](#3-automated-exception--error-detection)
4. [LLP Life Usage Interpretation & Remaining Life Calculator](#4-llp-life-usage-interpretation--remaining-life-calculator)
5. [Standards-Compliant Output Templates](#5-standards-compliant-output-templates)
6. [Bulk Document Upload & Batch Processing](#6-bulk-document-upload--batch-processing)
7. [Multi-Tenant Customer Workspaces](#7-multi-tenant-customer-workspaces)
8. [Free Document Templates Library](#8-free-document-templates-library)
9. [Marketplace Integration (ILS-Style)](#9-marketplace-integration-ils-style)
10. [Professional Services / Exception Remediation Workflow](#10-professional-services--exception-remediation-workflow)
11. [Lease Return Transition Package Generator](#11-lease-return-transition-package-generator)
12. [Counterfeit & Fraud Detection Engine](#12-counterfeit--fraud-detection-engine)
13. [Cross-Reference Verification Engine](#13-cross-reference-verification-engine)
14. [Export & Reporting Suite](#14-export--reporting-suite)
15. [Knowledge Base & Educational Content](#15-knowledge-base--educational-content)

---

## 1. AI Document Scanning & Auto-Categorization

### What ProvenAir Does
Users upload maintenance records (PDFs, scanned documents, faxes) via a web browser. ProvenAir's proprietary AI algorithms automatically scan, digitize, and categorize each document by type — work orders, 8130-3 release certificates, inspection reports, logbook entries, service bulletins, airworthiness directives, etc. Key metadata is extracted: part numbers, serial numbers, dates, cycle counts, shop visit information, facility details.

### Why AeroTrack Needs This
AeroTrack generates born-digital records going forward, but every component has a **history** — years or decades of paper records, scanned PDFs, and legacy MRO system exports. To build a complete lifecycle timeline, AeroTrack needs to ingest and understand these legacy records. This is especially critical for:
- **The Parker demo:** Showing AeroTrack can consume Parker's existing documentation
- **Lease return transitions:** Aircraft returning from lease come with thousands of pages of maintenance records
- **Repair station onboarding:** When a shop starts using AeroTrack, they need to import existing part histories

### User Stories

**US-1.1:** As a **repair station records analyst**, I want to upload a stack of PDFs for a component I'm about to overhaul, so that AeroTrack can show me the part's complete history before I start work.

**US-1.2:** As a **lessor technical representative**, I want to upload the maintenance records package from an aircraft returning off-lease, so that AeroTrack can automatically identify what documents are present and what's missing.

**US-1.3:** As a **quality inspector**, I want AeroTrack to automatically identify the document type (8130-3, work order, CMM, SB compliance record, etc.) for each uploaded file, so I don't have to manually sort hundreds of documents.

**US-1.4:** As an **OEM product support engineer** (Parker), I want to upload legacy records for components in our fleet, so that AeroTrack can extract part numbers, serial numbers, and maintenance events to populate the lifecycle timeline.

### Implementation Instructions

```
SPEC: AI Document Scanning & Auto-Categorization

TECH APPROACH:
- Use the existing /api/ai/analyze-document route as the foundation
- Extend it to handle BULK uploads (multiple files at once)
- Use Claude API (claude-sonnet-4-5-20250929) for document classification and extraction

DATABASE CHANGES:
- Add a new model "UploadBatch" to track bulk upload jobs:
  - id, customerId, uploadedAt, totalFiles, processedFiles, status
- Add fields to the existing "Document" model:
  - aiClassification (the document type AI determined)
  - aiConfidence (0-1 confidence score)
  - extractedPartNumbers (JSON array)
  - extractedSerialNumbers (JSON array)
  - extractedDates (JSON array of {type, date} objects)
  - extractedFacilities (JSON array)
  - extractedCycleCounts (JSON array of {type, count} objects)
  - processingStatus ("pending", "processing", "complete", "error")

API ROUTES:
1. POST /api/documents/upload
   - Accepts multipart form data with multiple PDF files
   - Creates an UploadBatch record
   - Queues each file for processing
   - Returns batchId for status polling

2. GET /api/documents/batch/[batchId]
   - Returns batch status and list of processed documents with their classifications

3. POST /api/ai/classify-document
   - Takes extracted text from a PDF
   - Sends to Claude with this prompt:

   "You are an expert aerospace maintenance records analyst. Classify this document
   and extract all key metadata.

   DOCUMENT CLASSIFICATION (choose one):
   - 8130-3 (FAA Authorized Release Certificate / Airworthiness Approval Tag)
   - work_order (Repair/overhaul work order or job card)
   - findings_report (Inspection findings or condition report)
   - cmm (Component Maintenance Manual or excerpt)
   - service_bulletin (Manufacturer service bulletin)
   - airworthiness_directive (FAA/EASA AD)
   - logbook_entry (Aircraft or engine logbook page)
   - birth_certificate (Original manufacturing certificate)
   - certificate_of_conformity (CoC from supplier)
   - shipping_record (Shipping/receiving documentation)
   - test_report (Functional test results)
   - borescope_report (Borescope inspection report)
   - ndt_report (Non-destructive testing report)
   - modification_record (STC or modification documentation)
   - unknown (Cannot determine)

   EXTRACT ALL OF THE FOLLOWING (if present):
   - Part numbers (list all, note format)
   - Serial numbers (list all)
   - Dates (manufacture date, repair date, inspection date, issuance date, etc.)
   - Cycle counts (TSN, CSN, TSO, CSO — total since new, since overhaul)
   - Hour counts (TSN, HSN, TSO, HSO)
   - Facility name and location
   - Facility certificate number (FAA repair station number)
   - Technician/inspector names and certificate numbers
   - Work performed (summary)
   - CMM references
   - Disposition (serviceable, unserviceable, scrapped, etc.)
   - Aircraft registration (if mentioned)
   - Engine/APU serial number (if mentioned)

   Also assess DOCUMENT QUALITY:
   - Legibility (1-5 scale)
   - Completeness (are expected fields filled?)
   - Any red flags (inconsistent dates, unusual formatting, suspicious elements)

   Return as structured JSON."

FRONTEND:
- Add an "Upload Legacy Records" button on the Part Detail page
- Add a dedicated /documents/upload page for bulk uploads
- Show upload progress with a progress bar
- After processing, display each document as a card showing:
  - Document type (with icon)
  - AI confidence score (green >0.9, yellow 0.7-0.9, red <0.7)
  - Extracted metadata in a clean layout
  - "Link to Component" button to attach it to the right part's timeline
  - "View Original" to see the uploaded PDF
- Auto-suggest which component each document belongs to based on extracted P/N and S/N

ACCEPTANCE CRITERIA:
- [ ] Can upload 1-50 PDF files at once via drag-and-drop or file picker
- [ ] Each PDF is classified into one of the document types with >85% accuracy
- [ ] Part numbers, serial numbers, dates, and cycle counts are extracted
- [ ] Documents can be linked to existing components in the system
- [ ] Processing status is shown in real-time (queued → processing → complete)
- [ ] Low-confidence classifications are flagged for human review
- [ ] Uploaded documents appear in the component's lifecycle timeline
```

---

## 2. Back-to-Birth Trace Timeline Generation

### What ProvenAir Does
ProvenAir dynamically generates a visual, graphical timeline showing the complete back-to-birth trace for each life-limited part (LLP). The timeline displays every installation, removal, repair, inspection, and transfer event in chronological order, with linked documentation at each node. This is their flagship feature — turning scattered documents into a coherent visual story of a part's life.

### Why AeroTrack Needs This
AeroTrack already has a lifecycle timeline on the Part Detail page, but it needs to be enhanced to match ProvenAir's depth:
- **Back-to-birth completeness scoring:** Show what percentage of the part's life is documented
- **Documentation linking at each node:** Every event should show its supporting evidence
- **Gap visualization:** Visually highlight periods with no documentation
- **Multi-owner tracking:** Show clearly when a part changed hands between companies
- **Print/export capability:** Users need to share the timeline as a standalone document

### User Stories

**US-2.1:** As a **parts trader**, I want to see a visual timeline of a component's complete history from manufacture to present, so I can quickly assess whether the trace documentation is complete before buying or selling.

**US-2.2:** As a **lessor technical rep**, I want the timeline to clearly show every time the component changed ownership or moved between companies, so I can verify the chain of custody is unbroken.

**US-2.3:** As a **repair station manager**, I want to see a "trace completeness score" (e.g., 94% documented) for each component, so I can quickly identify parts with documentation gaps.

**US-2.4:** As an **airline fleet planner**, I want to export a component's back-to-birth timeline as a PDF document, so I can include it in transition packages or share with lessors.

**US-2.5:** As a **quality inspector**, I want gaps in the timeline to be visually highlighted in red, so I immediately see periods where documentation is missing.

### Implementation Instructions

```
SPEC: Enhanced Back-to-Birth Trace Timeline

ENHANCE THE EXISTING TIMELINE:
The Part Detail page at /parts/[id] already has a lifecycle timeline component.
Enhance it with the following:

1. TRACE COMPLETENESS SCORE
   - Calculate what percentage of the component's operational life is documented
   - Formula: (documented_days / total_days_since_manufacture) × 100
   - A "documented day" = any day that falls within a documented event period
   - Display as a prominent score at the top: "Trace Completeness: 94%"
   - Color code: Green (>95%), Yellow (80-95%), Red (<80%)
   - Below the score, show: "X of Y months documented | Z gaps identified"

2. ENHANCED TIMELINE VISUALIZATION
   - Each event node on the timeline should show:
     - Event type icon (manufacture, install, remove, repair, inspect, transfer, etc.)
     - Date and facility
     - Company/operator at that time
     - Hours and cycles at event
     - Number of supporting documents (clickable to expand)
     - A colored bar: green = fully documented, yellow = partial, red = no docs
   - Between events, show:
     - Duration (e.g., "2 years, 4 months installed")
     - If there's a gap with no documentation: RED dashed line with "14 months undocumented"
   - Company ownership changes should be shown as distinct visual markers
     (e.g., a horizontal divider: "──── Transferred to United Airlines ────")

3. DOCUMENT ATTACHMENT VIEW
   - Clicking an event node expands it to show all linked evidence:
     - Photos (thumbnail grid)
     - Voice transcriptions (text excerpts)
     - Generated documents (8130-3, work orders)
     - Uploaded legacy documents
     - Each with its SHA-256 hash displayed

4. GAP ANALYSIS PANEL
   - A collapsible panel showing all identified gaps:
     - Gap period (start date → end date)
     - Duration
     - What's missing (e.g., "No documentation between removal from American N321AA
       and appearance at São Paulo repair station")
     - Severity (minor gap <30 days, moderate 30-180 days, critical >180 days)
     - Suggested remediation ("Request transfer records from American Airlines
       maintenance records department")

5. EXPORT AS PDF
   - "Export Timeline" button generates a formatted PDF containing:
     - Component header (P/N, S/N, description, OEM, manufacture date)
     - Trace completeness score
     - Full chronological timeline with all events
     - Gap analysis summary
     - Document inventory (list of all supporting documents)
     - Generated by AeroTrack with timestamp and hash
   - Use pdf-lib to generate the PDF

6. PRINT VIEW
   - /parts/[id]/print route that renders a printer-friendly version
   - White background, no navigation, optimized for A4/Letter paper

ACCEPTANCE CRITERIA:
- [ ] Trace completeness score displayed prominently on Part Detail page
- [ ] Timeline events show linked document counts
- [ ] Gaps >30 days are highlighted in red with duration labels
- [ ] Company ownership changes are visually distinct
- [ ] Gap analysis panel lists all gaps with severity ratings
- [ ] Timeline can be exported as a formatted PDF
- [ ] Clicking an event expands to show all linked evidence
```

---

## 3. Automated Exception & Error Detection

### What ProvenAir Does
ProvenAir automatically cross-references data points across all uploaded documents to identify inconsistencies. They've found over 10,000 human errors that manual reviewers missed. Their exception reporting flags: missing documents, serial number mismatches, operational gaps (periods with no documentation), cycle count discrepancies, and suspicious or potentially falsified records.

### Why AeroTrack Needs This
This is critical for both wedges:
- **Parts tracking:** Catch errors in legacy records before a component goes back into service
- **Lease returns:** Automatically identify every documentation issue in a transition package
- **Counterfeit prevention:** Pattern matching across documents can catch forged records
- **Quality assurance:** Even born-digital AeroTrack records should be cross-validated

### User Stories

**US-3.1:** As a **records analyst**, I want AeroTrack to automatically flag when a serial number in one document doesn't match the serial number in another document for the same component, so I catch data entry errors before they become compliance issues.

**US-3.2:** As a **quality inspector**, I want AeroTrack to detect when cycle counts don't add up across events (e.g., a part claims 5,000 CSN after removal but only had 4,200 CSN at the previous installation plus 600 cycles of operation = 4,800, not 5,000), so I can investigate discrepancies.

**US-3.3:** As a **lessor**, I want to upload an aircraft's complete maintenance package and get an automatic "exception report" listing every issue found, so I don't have to review thousands of pages manually.

**US-3.4:** As a **repair station mechanic**, I want AeroTrack to warn me if I'm about to install a part that has unresolved documentation exceptions, so I don't put a questionable component on an aircraft.

**US-3.5:** As an **OEM product support engineer**, I want to see aggregate exception statistics across my fleet (e.g., "23% of HPC-7 pumps in the system have at least one documentation gap"), so I can identify systemic issues.

### Implementation Instructions

```
SPEC: Automated Exception & Error Detection Engine

DATABASE CHANGES:
- Create a new model "Exception":
  - id: String @id
  - componentId: String (references Component)
  - exceptionType: String (see types below)
  - severity: String ("info", "warning", "critical")
  - title: String
  - description: String (detailed explanation)
  - evidence: String (JSON — the specific data points that triggered this exception)
  - status: String ("open", "investigating", "resolved", "false_positive")
  - detectedAt: DateTime
  - resolvedAt: DateTime?
  - resolvedBy: String?
  - resolutionNotes: String?

EXCEPTION TYPES:
1. "serial_number_mismatch" — S/N differs between documents for same event
2. "part_number_mismatch" — P/N differs between documents for same component
3. "cycle_count_discrepancy" — Cycle counts don't add up across events
4. "hour_count_discrepancy" — Flight hours don't add up across events
5. "documentation_gap" — Period >30 days with no documentation
6. "missing_release_certificate" — Repair event has no 8130-3 or equivalent
7. "missing_birth_certificate" — Component has no manufacture certificate
8. "date_inconsistency" — Event dates are out of chronological order
9. "facility_cert_mismatch" — Repair station certificate doesn't match FAA records
10. "duplicate_serial_number" — Two different components claim the same S/N
11. "format_anomaly" — S/N or P/N format doesn't match OEM conventions
12. "weight_discrepancy" — Documented weight differs from OEM spec
13. "cmm_revision_mismatch" — Work references an outdated CMM revision
14. "unsigned_document" — Required document lacks signature/approval
15. "suspicious_pattern" — Multiple anomalies on same component suggesting fraud

DETECTION ENGINE:
Create a service at /lib/exception-engine.ts that runs checks:

1. ON DOCUMENT UPLOAD:
   - Extract P/N and S/N from new document
   - Cross-reference against existing component records
   - Flag any mismatches

2. ON EVENT CREATION:
   - Verify cycle/hour counts are consistent with previous events
   - Verify dates are chronologically consistent
   - Check that required documents exist (e.g., every repair needs an 8130-3)

3. ON DEMAND (Full Scan):
   - API route: POST /api/exceptions/scan/[componentId]
   - Runs ALL checks across ALL events and documents for a component
   - Returns a complete exception report

4. BATCH SCAN:
   - API route: POST /api/exceptions/scan-all
   - Runs checks across all components (for dashboard statistics)

AI-ASSISTED EXCEPTION ANALYSIS:
For complex exceptions, send context to Claude:

"You are an aerospace maintenance records auditor. Analyze the following data
inconsistency and provide:
1. What the discrepancy is (plain language)
2. Possible explanations (innocent error, data entry mistake, missing records, etc.)
3. Severity assessment (how concerning is this for airworthiness?)
4. Recommended next steps to resolve
5. Whether this pattern is consistent with known counterfeit indicators

Data: [exception details + surrounding context]"

FRONTEND:
1. Exception Report Page (/integrity/exceptions)
   - Filterable list of all open exceptions across all components
   - Filter by: severity, type, component, date range, status
   - Sort by: severity (critical first), date detected, component
   - Each exception card shows: type icon, severity badge, component P/N + S/N,
     description, and action buttons (Investigate, Resolve, Mark False Positive)

2. Exception Badge on Part Detail
   - On the Part Detail page, show exception count badge: "3 Open Exceptions"
   - Clicking opens a panel with that component's exceptions

3. Exception Resolution Workflow
   - "Investigate" → changes status, adds investigator name
   - "Resolve" → requires resolution notes explaining what was found/fixed
   - "False Positive" → requires explanation of why this isn't actually an issue
   - All actions logged with timestamp and user

ACCEPTANCE CRITERIA:
- [ ] Serial number mismatches between documents are detected automatically
- [ ] Cycle count discrepancies are flagged with specific numbers showing the gap
- [ ] Documentation gaps >30 days are detected and categorized by severity
- [ ] Missing 8130-3 certificates after repair events are flagged
- [ ] Exception report page shows all open exceptions with filtering
- [ ] Each exception can be investigated, resolved, or marked false positive
- [ ] Part Detail page shows exception count badge
- [ ] AI provides plain-language analysis of complex exceptions
```

---

## 4. LLP Life Usage Interpretation & Remaining Life Calculator

### What ProvenAir Does
ProvenAir precisely interprets the usage (cycles, hours) consumed by each life-limited part based on documentation. This tells users how much "life" is left in the part, which directly determines its value. For LLPs, this is literally a million-dollar calculation — a landing gear with 80% life remaining is worth dramatically more than one with 20% remaining.

### Why AeroTrack Needs This
- **Parts trading:** The remaining life calculation is what determines a component's market value
- **Fleet planning:** Airlines need to know when parts will hit their life limits
- **Lease returns:** Lessors need to verify remaining life claims before accepting returned aircraft
- **Overhaul scheduling:** Repair stations need to plan work based on remaining life

### User Stories

**US-4.1:** As an **airline fleet planner**, I want to see a clear "remaining life" display for each life-limited component (e.g., "12,400 cycles remaining out of 30,000 cycle limit"), so I can plan overhauls and replacements.

**US-4.2:** As a **parts trader**, I want AeroTrack to calculate a component's remaining useful life percentage and estimated market value based on life consumed, so I can price inventory accurately.

**US-4.3:** As a **lessor**, I want to see which LLPs on a returning aircraft are approaching their life limits, so I can negotiate maintenance reserves or end-of-lease compensation accurately.

**US-4.4:** As a **repair station manager**, I want AeroTrack to alert me when a component in our inventory is within 10% of its life limit, so I can plan accordingly (overhaul vs. scrap).

### Implementation Instructions

```
SPEC: LLP Life Usage Interpretation & Remaining Life Calculator

DATABASE CHANGES:
- Extend the Component model:
  - lifeLimitHours: Float? (if life-limited by hours)
  - lifeLimitCycles: Int? (if life-limited by cycles)
  - lifeLimitCalendar: Int? (calendar life limit in months, if applicable)
  - overhaulsCompleted: Int @default(0)
  - maxOverhauls: Int? (some parts have overhaul limits)
  - estimatedValueNew: Float? (new replacement cost for value calculations)

CALCULATIONS:
Create /lib/life-calculator.ts:

1. remainingLifeCycles(component):
   - If lifeLimitCycles exists: lifeLimitCycles - totalCycles
   - Return { remaining, total, percentUsed, percentRemaining }

2. remainingLifeHours(component):
   - If lifeLimitHours exists: lifeLimitHours - totalHours
   - Return { remaining, total, percentUsed, percentRemaining }

3. remainingCalendarLife(component):
   - If lifeLimitCalendar exists: manufactureDate + lifeLimitCalendar months - today
   - Return { remainingMonths, totalMonths, percentUsed }

4. estimatedRemainingValue(component):
   - Simple linear depreciation: estimatedValueNew × percentRemaining
   - More sophisticated: use "half-life" model where value drops faster early
   - Return { estimatedValue, methodology, confidence }

5. timeToLifeLimit(component, avgUsagePerYear):
   - Based on recent usage rate, estimate when life limit will be reached
   - Return { estimatedDate, confidenceRange }

6. lifeLimitAlerts(component):
   - If remaining < 10% of limit: return "critical" alert
   - If remaining < 25% of limit: return "warning" alert
   - If approaching calendar limit within 12 months: return "warning" alert

FRONTEND:
1. Life Status Panel on Part Detail Page
   - Visual gauge/progress bar showing life consumed vs. remaining
   - Cycle life: [████████████░░░░░] 72% consumed | 8,400 remaining
   - Hour life:  [██████████░░░░░░░] 65% consumed | 5,600 remaining
   - Calendar:   [████████████████░] 92% consumed | 18 months remaining
   - Estimated remaining value: $340,000 (based on $1.2M new cost)
   - "At current usage rate, life limit reached: ~March 2029"

2. Fleet Life Summary on Dashboard
   - Table showing all life-limited components with remaining life percentages
   - Sort by "least life remaining" to see what needs attention first
   - Color-coded rows: green (>50%), yellow (25-50%), orange (10-25%), red (<10%)

3. Life Limit Alerts
   - Components approaching life limits appear in the Alerts section
   - "881700-1001 has 8% cycle life remaining (2,400 of 30,000 cycles)"

UPDATE SEED DATA:
- Add life limit data to seed components:
  - HPC-7 pumps: 30,000 cycle limit, 40,000 hour limit
  - Fuel control valves: 20,000 cycle limit
  - Flight control actuators: 25,000 cycle limit, 15-year calendar limit
  - Hydraulic motors: 50,000 hour limit

ACCEPTANCE CRITERIA:
- [ ] Part Detail page shows remaining life gauges for cycles, hours, and calendar
- [ ] Remaining life percentage is calculated correctly from current usage vs. limits
- [ ] Estimated remaining value is displayed (linear depreciation from new cost)
- [ ] Dashboard shows fleet-wide life status summary table
- [ ] Components within 10% of any life limit trigger alerts
- [ ] Estimated time-to-limit is calculated from recent usage patterns
```

---

## 5. Standards-Compliant Output Templates

### What ProvenAir Does
ProvenAir harmonizes all output into a standardized template format aligned with:
- IATA's "Guidance Material and Best Practices for Life-Limited Parts (LLPs) Traceability"
- SAE's "ARP 6943 — Component Traceability Requirements for Life Limited Parts"

Their template format has become "recognized and adopted throughout the industry."

### Why AeroTrack Needs This
Standards compliance gives instant credibility with enterprise customers. When a Parker engineer or United Airlines records analyst sees output that follows industry standards they already know, trust is immediate. Non-standard formats raise questions; standard formats answer them.

### User Stories

**US-5.1:** As a **lessor technical representative**, I want AeroTrack's trace reports to follow the IATA LLP traceability guidance format, so I can use them directly in my existing review workflows without reformatting.

**US-5.2:** As a **repair station quality manager**, I want 8130-3 documents generated by AeroTrack to follow the exact FAA form layout with all 14 blocks, so they're immediately recognizable and acceptable to customers and regulators.

**US-5.3:** As an **OEM product support engineer**, I want exported data to follow ATA Spec 2000 Chapter 16 format, so it integrates cleanly with our existing systems.

**US-5.4:** As a **parts trader**, I want to generate a trace package that follows the SAE ARP 6943 format, so buyers immediately trust the documentation.

### Implementation Instructions

```
SPEC: Standards-Compliant Output Templates

TEMPLATES TO BUILD:

1. IATA LLP TRACE TEMPLATE
   Create /lib/templates/iata-llp-trace.ts
   - Header: Part identification (P/N, S/N, description, OEM)
   - Section 1: Life status summary (TSN, CSN, TSO, CSO, remaining life)
   - Section 2: Back-to-birth trace table:
     | Event # | Date | Event Type | Facility | Cert # | Hours | Cycles | Document Ref |
   - Section 3: Gap analysis (any periods >30 days undocumented)
   - Section 4: Exception summary (any discrepancies found)
   - Section 5: Document inventory (list of all supporting docs with hashes)
   - Footer: Generated by AeroTrack, date, trace completeness score

2. FAA FORM 8130-3 TEMPLATE (ENHANCED)
   Enhance existing /lib/form-8130-template.ts
   - Must match the EXACT visual layout of FAA Form 8130-3
   - All 14 blocks in the correct grid positions
   - Use the official block dimensions and font sizing
   - Include the form header: "FAA Form 8130-3 — Authorized Release Certificate"
   - Include the OMB control number area
   - Block numbering must be visible
   - This is already partially built — enhance the visual fidelity

3. ATA SPEC 2000 CHAPTER 16 EXPORT
   Create /lib/templates/ata-spec-2000.ts
   - Standard XML format for component maintenance data interchange
   - Fields: Part number, serial number, event type, date, facility, hours, cycles,
     work performed, parts consumed, test results, release certification
   - This enables integration with AMOS, TRAX, Quantum Control, and SkyThread

4. COMPONENT TRACE PACKAGE (PDF)
   Create /lib/templates/trace-package.ts
   - Cover page with component identification and trace summary
   - Table of contents
   - Section 1: Component identity card
   - Section 2: Life status and remaining life calculation
   - Section 3: Complete back-to-birth timeline (chronological)
   - Section 4: Document inventory with thumbnails
   - Section 5: Exception report
   - Section 6: Attestation page (who generated, when, hash)
   - Generate as PDF using pdf-lib

FRONTEND:
- Add "Export" dropdown button on Part Detail page with options:
  - "Export IATA Trace Report (PDF)"
  - "Export 8130-3 (PDF)"
  - "Export ATA Spec 2000 (XML)"
  - "Export Full Trace Package (PDF)"
  - "Export Raw Data (JSON)"

ACCEPTANCE CRITERIA:
- [ ] IATA LLP trace report generates as a properly formatted PDF
- [ ] 8130-3 template matches the official FAA form layout
- [ ] ATA Spec 2000 export generates valid XML
- [ ] Full trace package includes cover page, TOC, timeline, documents, and attestation
- [ ] All exports include SHA-256 hash for tamper evidence
- [ ] Export dropdown is accessible from Part Detail page
```

---

## 6. Bulk Document Upload & Batch Processing

### What ProvenAir Does
ProvenAir allows customers to upload large batches of maintenance records — sometimes hundreds or thousands of pages — via a simple web interface. The system queues them for processing and the customer can check back as documents are classified and analyzed.

### Why AeroTrack Needs This
Real-world use involves massive document volumes:
- An engine overhaul generates 200-500 pages of documentation
- An aircraft lease return package can be 5,000-10,000+ pages
- A repair station's historical records for a single part family might be hundreds of PDFs
- ProvenAir's entire value proposition starts with making bulk upload painless

### User Stories

**US-6.1:** As a **records analyst**, I want to drag-and-drop an entire folder of PDFs (up to 500 files) into AeroTrack, so I can upload a complete engine records package in one action.

**US-6.2:** As a **lessor operations manager**, I want to see real-time progress as AeroTrack processes my uploaded documents (e.g., "147 of 312 documents processed"), so I know when I can start reviewing.

**US-6.3:** As a **repair station admin**, I want to upload a ZIP file containing all maintenance records for a component, and have AeroTrack automatically extract and process each document inside.

### Implementation Instructions

```
SPEC: Bulk Document Upload & Batch Processing

FRONTEND:
1. Dedicated Upload Page (/documents/upload)
   - Large drag-and-drop zone: "Drop files here or click to browse"
   - Accept: .pdf, .jpg, .jpeg, .png, .tiff, .zip
   - Show file list with individual status indicators as they upload
   - Progress bar showing: "Uploading X of Y files..."
   - After upload, show processing status: "Processing X of Y documents..."
   - Each document card flips from "Queued" → "Processing" → "Complete" with animation

2. Batch Status Dashboard (/documents/batches)
   - List of all upload batches with:
     - Upload date
     - Total files / Processed / Errors
     - Status (uploading, processing, complete, complete with errors)
     - "View Results" button

3. Results View (/documents/batches/[batchId])
   - Grid of document cards showing:
     - Thumbnail of first page
     - AI classification (document type)
     - Extracted P/N and S/N
     - Confidence score
     - "Link to Component" action
   - Bulk actions: "Auto-link all high-confidence documents"

BACKEND:
- POST /api/documents/upload-batch
  - Accepts multipart form data with multiple files
  - Stores files locally (or in cloud storage for production)
  - Creates batch record and queues processing jobs

- Processing queue (simple approach for MVP):
  - Process documents sequentially (one at a time) to avoid API rate limits
  - Use a simple polling approach: frontend polls /api/documents/batch/[id] every 3 seconds

- ZIP handling:
  - If a .zip file is uploaded, extract contents and process each file inside

ACCEPTANCE CRITERIA:
- [ ] Can upload up to 100 files at once via drag-and-drop
- [ ] Upload progress is shown in real-time
- [ ] Processing progress updates as each document is classified
- [ ] ZIP files are automatically extracted and each file processed
- [ ] Results show document type classification and extracted metadata
- [ ] Documents can be bulk-linked to components
```

---

## 7. Multi-Tenant Customer Workspaces

### What ProvenAir Does
Each ProvenAir customer has their own secure tenant — a private workspace where only their data is visible. This is essential because aerospace maintenance records contain proprietary and sometimes ITAR-controlled information.

### Why AeroTrack Needs This
For the MVP/demo, multi-tenancy isn't strictly needed (it's a single-user demo). But for the architecture to be credible to Parker, the data model should show awareness of multi-tenant requirements. This also matters because:
- Different repair stations shouldn't see each other's data
- OEMs see aggregated/anonymized fleet data, not individual shop details
- Airlines see their own fleet, not competitors'
- Data sharing between tenants requires explicit authorization

### User Stories

**US-7.1:** As a **repair station manager**, I want my shop's data to be completely isolated from other shops' data, so our proprietary repair techniques and customer relationships are protected.

**US-7.2:** As a **Parker product support engineer**, I want to see aggregated fleet performance data across all repair stations using AeroTrack, but NOT see individual shop's commercial details (pricing, customer lists).

**US-7.3:** As a **component owner** (airline or lessor), I want to control which repair stations can see my component's full history vs. just the minimum needed for the current repair.

### Implementation Instructions

```
SPEC: Multi-Tenant Data Architecture (MVP Foundation)

NOTE: For the MVP demo, implement a SIMPLIFIED version — just the data model
and basic tenant switching for demo purposes. Full authentication and
authorization is post-MVP.

DATABASE CHANGES:
- Add new model "Organization":
  - id, name, orgType ("airline", "lessor", "mro", "oem", "broker", "regulator")
  - faaPartNumber (repair station certificate, if applicable)
  - location, contactEmail
  - logoUrl

- Add new model "User":
  - id, name, email, role ("admin", "analyst", "mechanic", "viewer")
  - organizationId (references Organization)
  - certNumber (FAA certificate number, if applicable)
  - certType ("ap", "ia", "repair_station_designee", etc.)

- Add organizationId to Component (which organization "owns" this component currently)
- Add createdByOrgId to LifecycleEvent (which organization performed this work)

SEED DATA:
- Create 4-5 organizations:
  1. Parker Aerospace (OEM)
  2. AAR Corp Miami (MRO)
  3. Delta Air Lines (Airline)
  4. United Airlines (Airline)
  5. AerCap (Lessor)

- Create sample users for demo switching:
  1. "Jeff Smith" — Parker Aerospace — OEM Product Support view
  2. "John Rodriguez" — AAR Corp Miami — Mechanic/Capture view
  3. "Sarah Chen" — Delta Air Lines — Fleet Manager view

FRONTEND:
- Add a simple "View As" selector in the header/sidebar for demo purposes:
  [View as: Jeff Smith (Parker) ▼]
  This switches the UI perspective without real authentication.

- Different views show different data:
  - Parker view: Sees all components with Parker part numbers; sees aggregated analytics
  - AAR view: Sees components currently at AAR; sees capture interface
  - Delta view: Sees components installed on Delta aircraft; sees fleet dashboard

ACCEPTANCE CRITERIA:
- [ ] Organization and User models exist in the database
- [ ] Seed data includes 4-5 organizations with sample users
- [ ] "View As" selector in header lets demo presenter switch perspectives
- [ ] Different perspectives show different data subsets
- [ ] This is clearly labeled as "Demo Mode" (not real auth)
```

---

## 8. Free Document Templates Library

### What ProvenAir Does
ProvenAir provides free downloadable templates for common aerospace documentation:
- LLP tracking/transfer templates
- Life-limited parts listing templates
- Attestation templates for incident/accident status
- Engine-specific LLP listing templates

This serves as a lead generation tool — users discover ProvenAir through the templates, then convert to paying customers.

### Why AeroTrack Needs This
Free templates serve multiple purposes:
- **Trust building:** Shows AeroTrack understands the industry's real workflows
- **Lead generation:** People searching for "8130-3 template" or "LLP trace template" find AeroTrack
- **Parker demo:** Shows awareness of industry documentation standards
- **User onboarding:** Templates help repair stations standardize their documentation before going digital

### User Stories

**US-8.1:** As a **repair station quality manager**, I want to download a standardized LLP tracking template, so I can improve my shop's documentation before fully adopting AeroTrack.

**US-8.2:** As an **MRO operations manager**, I want free templates for common aerospace forms (work orders, findings reports, receiving inspection checklists), so my team has consistent formatting.

### Implementation Instructions

```
SPEC: Free Document Templates Library

CREATE A TEMPLATES PAGE (/templates):

Layout:
- Header: "Free Aerospace Documentation Templates"
- Subtitle: "Industry-standard templates to improve your maintenance documentation.
  No account required."
- Grid of template cards, each showing:
  - Template name
  - Description
  - Preview thumbnail
  - "Download (PDF)" and "Download (Excel)" buttons
  - Download count (mock numbers for demo)

TEMPLATES TO CREATE:

1. "LLP Back-to-Birth Trace Template"
   - Columns: Event #, Date, Event Type, Facility, Cert #, TSN Hours, CSN Cycles,
     Document Reference, Notes
   - IATA-aligned format
   - PDF and Excel versions

2. "Component Transfer Documentation Checklist"
   - Checklist of required documents when transferring an LLP between operators:
     □ 8130-3 or equivalent release certificate
     □ Back-to-birth trace records
     □ Current life status (TSN, CSN, TSO, CSO)
     □ Outstanding SB/AD compliance status
     □ Incident/accident history attestation
     □ Modification status and STC records

3. "Receiving Inspection Checklist"
   - Standard checklist for incoming component inspection at a repair station
   - Matches AeroTrack's capture Step 1 workflow

4. "Work Order Template"
   - Standard format for component repair/overhaul work orders
   - Sections: Header, As-Received Condition, Findings, Work Performed,
     Parts Consumed, Test Results, Return-to-Service Statement

5. "Incident/Accident Attestation Template"
   - Standard format for attesting that a component has not been involved
     in an incident or accident (required for many transactions)

6. "Component Condition Report Template"
   - Standard format for documenting a component's condition at any point in time

BUILD AS SIMPLE PDFS:
- Use pdf-lib to generate clean, professional PDF templates
- Each template should have:
  - AeroTrack logo and branding in the footer
  - "Template provided by AeroTrack — aerotrack.io" (adds brand awareness)
  - Fillable fields (where pdf-lib supports it) or clear blank lines

ACCEPTANCE CRITERIA:
- [ ] Templates page shows 6 downloadable templates
- [ ] Each template downloads as a properly formatted PDF
- [ ] Templates follow industry-standard formats
- [ ] AeroTrack branding is included subtly in footers
- [ ] Page is accessible without authentication
```

---

## 9. Marketplace Integration (ILS-Style)

### What ProvenAir Does
ProvenAir integrates with ILS (Inventory Locator Service), the aviation industry's leading digital marketplace for parts. Suppliers using ProvenAir get a ProvenAir logo displayed alongside their ILS inventory listings, signaling to buyers that the parts have verified back-to-birth documentation. This transforms documentation from a sales friction point into a competitive advantage.

### Why AeroTrack Needs This
For the MVP, we can't build a real ILS integration, but we can demonstrate the concept:
- **"AeroTrack Verified" badge concept:** Parts with complete documentation get a trust badge
- **Export for marketplace listing:** Generate a standardized data package that a seller could attach to an ILS listing
- **Demo talking point:** "Imagine every Parker part on ILS showing an AeroTrack Verified badge — buyers know the documentation is complete before they even call."

### User Stories

**US-9.1:** As a **parts seller**, I want components with complete AeroTrack documentation to display a "Verified Trace" badge, so buyers trust my listings more than competitors'.

**US-9.2:** As a **parts buyer**, I want to see which components have verified back-to-birth documentation before I purchase, so I can avoid documentation headaches after the sale.

**US-9.3:** As a **Parker product support engineer**, I want to see what percentage of Parker parts in the aftermarket have verified documentation, so I can measure the impact of AeroTrack on our supply chain transparency.

### Implementation Instructions

```
SPEC: AeroTrack Verified Badge & Marketplace Export

1. VERIFICATION BADGE SYSTEM
   Create /lib/verification.ts:

   A component earns "AeroTrack Verified" status when:
   - Trace completeness score > 95%
   - No open critical exceptions
   - Birth certificate (manufacture 8130-3) is on file
   - All repairs have associated 8130-3 or equivalent release certificates
   - No documentation gaps > 30 days

   Badge levels:
   - 🟢 "AeroTrack Verified" — Full trace, no gaps, no exceptions
   - 🟡 "AeroTrack Documented" — >80% trace, minor exceptions only
   - ⚪ "Partial Records" — <80% trace or open exceptions

2. BADGE DISPLAY
   - Show badge on Part Detail page header
   - Show badge in Parts Fleet Overview table
   - Badge is clickable → shows verification criteria and status of each

3. MARKETPLACE EXPORT
   - "Generate Listing Package" button on Part Detail page
   - Creates a ZIP file containing:
     - Component summary card (1-page PDF with photo, specs, life status, badge)
     - Full trace package (PDF)
     - Individual document scans (if available)
     - Machine-readable data file (JSON or XML)
   - Include a unique verification code that could be checked against AeroTrack
     (for demo: just generate a UUID; in production this would link to a public
     verification page)

4. FLEET VERIFICATION DASHBOARD
   - On the Analytics page, add a "Documentation Health" section:
     - Pie chart: Verified / Documented / Partial / Undocumented
     - By part family: "HPC-7 Series: 6 of 8 verified (75%)"
     - By repair station: "AAR Corp: 92% of processed parts verified"

ACCEPTANCE CRITERIA:
- [ ] Components meeting verification criteria show green "Verified" badge
- [ ] Badge criteria are visible when clicking the badge
- [ ] "Generate Listing Package" creates a downloadable ZIP
- [ ] Listing package includes summary card, trace PDF, and data file
- [ ] Analytics page shows fleet-wide verification statistics
```

---

## 10. Professional Services / Exception Remediation Workflow

### What ProvenAir Does
Beyond software, ProvenAir offers professional services: exception remediation (helping fix the documentation gaps found), best practices coaching, and data management consulting. This is a smart revenue model — the software finds the problems, and the services fix them.

### Why AeroTrack Needs This
AeroTrack should include a self-service exception remediation workflow — when a gap is found, guide the user through resolving it. This is more scalable than human consulting services and more impressive for the demo.

### User Stories

**US-10.1:** As a **records analyst**, when AeroTrack finds a documentation gap (e.g., missing 8130-3 for a repair event), I want a guided workflow that tells me exactly what document is needed, who to contact to get it, and how to upload it once I have it.

**US-10.2:** As a **quality manager**, I want to track the resolution status of all open exceptions across my fleet, so I can report progress to management and regulators.

**US-10.3:** As a **repair station admin**, when I resolve an exception (e.g., I found the missing 8130-3 and uploaded it), I want the component's trace completeness score to update automatically.

### Implementation Instructions

```
SPEC: Exception Remediation Workflow

REMEDIATION GUIDE:
Create /lib/remediation-guides.ts with guidance for each exception type:

{
  "missing_release_certificate": {
    title: "Missing Release Certificate (8130-3 / EASA Form 1)",
    whatItMeans: "A repair or overhaul event exists but no release certificate
      was found in the documentation. Without this, the part's airworthiness
      at this point in its history cannot be verified.",
    howToResolve: [
      "1. Identify the facility that performed the work (shown in event details)",
      "2. Contact the facility's Technical Records department",
      "3. Request a copy of the 8130-3 or EASA Form 1 for this work order",
      "4. If the facility no longer exists, contact the FAA FSDO that oversees
          the region where the facility was located",
      "5. Upload the document here and link it to this event"
    ],
    typicalTimeToResolve: "1-4 weeks",
    escalationPath: "If the facility cannot provide the document, consult with
      your DER or FAA FSDO about alternative means of compliance"
  },
  "documentation_gap": {
    title: "Documentation Gap",
    whatItMeans: "There is a period of [X days/months] with no documentation.
      The component's location and status during this period are unknown.",
    howToResolve: [
      "1. Check the last known operator before the gap",
      "2. Contact that operator's Technical Records for removal/transfer records",
      "3. Check the first known operator after the gap",
      "4. Contact parts brokers/distributors who may have handled the component",
      "5. Upload any found documentation to fill the gap"
    ],
    ...
  },
  // ... guides for all exception types
}

FRONTEND:
1. Exception Detail Panel (when clicking an exception):
   - Shows the remediation guide for that exception type
   - Step-by-step instructions with checkboxes
   - "Upload Resolution Document" button
   - "Add Note" for tracking progress
   - "Mark Resolved" with required resolution summary

2. Remediation Dashboard:
   - Kanban-style view: Open → In Progress → Awaiting Response → Resolved
   - Filter by assignee, component, exception type
   - Aging indicators (exceptions open >30 days highlighted)

3. Auto-Update on Resolution:
   - When a resolution document is uploaded and linked:
     - Re-run exception checks for that component
     - Update trace completeness score
     - Close the exception if the evidence resolves it

ACCEPTANCE CRITERIA:
- [ ] Each exception type has a remediation guide with step-by-step instructions
- [ ] Exception detail view shows the remediation guide
- [ ] Users can upload documents to resolve exceptions
- [ ] Trace completeness score updates when exceptions are resolved
- [ ] Resolution requires a summary note (audit trail)
```

---

## 11. Lease Return Transition Package Generator

### What ProvenAir Does
While ProvenAir focuses on component-level LLP trace, the concept extends naturally to aircraft-level lease return packages. Lessors need to verify documentation for the ENTIRE aircraft — all components, all maintenance events, all compliance status — before accepting a return.

### Why AeroTrack Needs This
This directly serves the lease return transition wedge:
- Generate a complete aircraft-level documentation package from all component records
- Identify all documentation gaps across all components on an aircraft
- Create the "handover package" that lessors and airlines exchange during transitions
- This is where AeroTrack's component-level data rolls up to aircraft-level value

### User Stories

**US-11.1:** As a **lessor transition manager**, I want to generate a complete aircraft redelivery documentation package that includes the status of every life-limited component, all maintenance event records, and all open exceptions, so I can assess the aircraft's condition in hours instead of weeks.

**US-11.2:** As an **airline redelivery coordinator**, I want AeroTrack to identify exactly which documents are missing from my redelivery package before I send it to the lessor, so I can avoid costly back-and-forth.

**US-11.3:** As a **transition consultant**, I want a single dashboard showing the documentation readiness of an aircraft returning from lease, with a clear score and punch list of items to resolve.

### Implementation Instructions

```
SPEC: Lease Return Transition Package Generator

NOTE: This is a FUTURE FEATURE — not in the Parker demo MVP but important for
the lease return wedge. Include the data model and a placeholder UI.

DATABASE CHANGES:
- Add new model "Aircraft":
  - id, registration (e.g., "N401DL"), type (e.g., "A320neo"),
    msn (manufacturer serial number), operator, lessor,
    leaseStartDate, leaseEndDate, status

- Add new model "AircraftComponent" (junction table):
  - aircraftId, componentId, position (where on the aircraft),
    installedDate, removedDate

- Add new model "TransitionPackage":
  - id, aircraftId, packageType ("redelivery", "delivery", "transfer"),
    status ("preparing", "review", "submitted", "accepted"),
    createdAt, submittedAt, score (readiness percentage)

TRANSITION READINESS SCORE:
Calculate from:
- % of LLPs with complete BtB trace (weight: 40%)
- % of maintenance events fully documented (weight: 30%)
- # of open exceptions (weight: 20%)
- SB/AD compliance status (weight: 10%)

FRONTEND (PLACEHOLDER):
- Add a "Lease Returns" section to the sidebar (with "Coming Soon" badge)
- Simple page showing:
  - "Aircraft Transition Dashboard — Coming Soon"
  - Mockup of what it will look like:
    - Aircraft card: N401DL | A320neo | Delta → AerCap | Lease ends: March 2027
    - Readiness score: 78%
    - Punch list: "12 items to resolve before redelivery"
    - Component status table showing LLP trace status for each installed component
  - "Contact us to enable this feature for your fleet"

ACCEPTANCE CRITERIA:
- [ ] Aircraft and TransitionPackage models exist in the database
- [ ] Sidebar shows "Lease Returns" with "Coming Soon" badge
- [ ] Placeholder page shows a mockup of the transition dashboard concept
- [ ] Mockup uses realistic data (Delta N401DL returning to AerCap)
```

---

## 12. Counterfeit & Fraud Detection Engine

### What ProvenAir Does
ProvenAir's exception detection catches suspicious records that may indicate counterfeit parts — mismatched serial numbers, missing birth certificates, documents with inconsistent formatting. They emphasize that the FAA estimates 520,000 counterfeit or unapproved components enter aircraft annually.

### Why AeroTrack Needs This
AeroTrack already has a basic counterfeit alert in the seed data (Component 5), but a proper detection engine adds credibility and addresses a $2B industry problem.

### User Stories

**US-12.1:** As an **incoming inspector**, I want AeroTrack to automatically run fraud checks when I scan a component into the system, warning me immediately if anything looks suspicious before I start work on it.

**US-12.2:** As a **quality manager**, I want a dedicated fraud/counterfeit dashboard showing all flagged components across my operation, with detailed evidence for each flag.

**US-12.3:** As an **OEM engineer** (Parker), I want to verify whether a component claiming to be a Parker part matches our manufacturing records (serial number format, manufacturing plant, date conventions), so I can confirm authenticity.

### Implementation Instructions

```
SPEC: Counterfeit & Fraud Detection Engine

DETECTION RULES:
Create /lib/fraud-detection.ts with these checks:

1. SERIAL NUMBER FORMAT VALIDATION
   - Each OEM has specific S/N formatting conventions by era
   - Parker post-2019: "SN-YYYY-NNNNN" format
   - Parker pre-2019: Different format
   - Flag: S/N format doesn't match the claimed manufacture date era
   - Severity: CRITICAL

2. BIRTH CERTIFICATE VERIFICATION
   - Every legitimate part should have a manufacture certificate (8130-3 or CoC)
   - Flag: No birth certificate on record
   - Severity: WARNING (could just be missing records) or CRITICAL (if combined
     with other flags)

3. WEIGHT VERIFICATION
   - OEM specs include component weight
   - If receiving inspection weight differs by >5% from OEM spec: flag
   - Severity: CRITICAL (weight differences suggest different/modified internals)

4. PROVENANCE CHAIN INTEGRITY
   - Every change in possession should have transfer documentation
   - Flag: Component appears at a new facility with no transfer records
   - Severity: WARNING to CRITICAL depending on gap duration

5. DUPLICATE SERIAL NUMBER CHECK
   - Two components in the system should never have the same P/N + S/N combination
   - Flag: Duplicate found → one is likely counterfeit
   - Severity: CRITICAL

6. DOCUMENT CONSISTENCY
   - Cross-reference dates, facilities, and technician certificates across all
     documents for the same event
   - Flag: Inconsistencies between documents (e.g., work order says March 2023
     but 8130-3 says March 2022)
   - Severity: WARNING

7. KNOWN FRAUD PATTERNS
   - AOG Technics pattern: Parts with professional-looking but generic documentation,
     no matching OEM records, appearing through London-area brokers
   - Flag: Multiple minor anomalies on same component = elevated suspicion
   - Severity: CRITICAL when 3+ minor flags combine

COMPOSITE FRAUD SCORE:
- Each component gets a "Trust Score" (0-100):
  - 100 = Perfect documentation, all checks pass
  - 80-99 = Minor issues, likely legitimate
  - 50-79 = Notable concerns, investigate before use
  - 0-49 = Serious fraud indicators, DO NOT install

FRONTEND:
1. Fraud Alert Banner on Part Detail
   - If trust score < 80: Red banner at top of Part Detail page
   - "⚠ FRAUD INDICATORS DETECTED — Trust Score: 34/100 — DO NOT INSTALL"
   - Lists each flag with evidence

2. Fraud Dashboard (/integrity/fraud)
   - All components with trust score < 80
   - Sortable by trust score (lowest first)
   - Filter by flag type, OEM, part family

3. Auto-Check on Scan
   - When mechanic scans a component in Capture mode:
     - Run all fraud checks immediately
     - If trust score < 50: Block progression with warning
     - If trust score 50-79: Show warning but allow continuation

ACCEPTANCE CRITERIA:
- [ ] Serial number format validation runs against known OEM conventions
- [ ] Missing birth certificates are flagged
- [ ] Weight discrepancies >5% are flagged as critical
- [ ] Duplicate serial numbers across components are detected
- [ ] Composite trust score (0-100) is calculated for each component
- [ ] Trust score < 50 shows red banner on Part Detail page
- [ ] Scanning a suspect component in Capture mode shows a warning
- [ ] Fraud dashboard lists all flagged components
```

---

## 13. Cross-Reference Verification Engine

### What ProvenAir Does
ProvenAir cross-references data points across ALL documents for a component to find inconsistencies. This is more sophisticated than simple field matching — it's about making sure the whole story is internally consistent. They found 10,000+ errors this way.

### Why AeroTrack Needs This
Cross-referencing is what makes AeroTrack's exception detection genuinely useful vs. just checking individual fields. The power is in finding errors that only become visible when you look at multiple documents together.

### User Stories

**US-13.1:** As a **records analyst**, I want AeroTrack to verify that cycle counts reported at each event are mathematically consistent with the component's operational history (i.e., cycles only go up, and the increments match the operational period between events).

**US-13.2:** As a **quality inspector**, I want AeroTrack to verify that a repair station's FAA certificate was valid on the date work was performed, so I can ensure the work was legally authorized.

**US-13.3:** As a **fleet planner**, I want AeroTrack to flag when a component's reported hours don't align with the aircraft's reported flight hours during the installation period, so I can catch data entry errors.

### Implementation Instructions

```
SPEC: Cross-Reference Verification Engine

VERIFICATION CHECKS:
Create /lib/cross-reference-engine.ts:

1. CYCLE/HOUR CONTINUITY CHECK
   - For each pair of consecutive events:
     - cyclesAtEvent[n+1] should be >= cyclesAtEvent[n]
     - hoursAtEvent[n+1] should be >= hoursAtEvent[n]
     - The increment should be reasonable for the time period
       (e.g., a pump installed for 2 years shouldn't show 50,000 hours — that's
       more than 24/7 operation)
   - Flag discrepancies with specific numbers

2. CHRONOLOGICAL CONSISTENCY
   - Events must be in date order
   - An "install" must come after a "remove" or "manufacture"
   - A "remove" must come after an "install"
   - No overlapping installations (can't be installed on two aircraft at once)
   - Flag any out-of-order events

3. FACILITY CERTIFICATE VALIDATION
   - Repair work requires a valid FAA Part 145 certificate
   - Check that the facility certificate number is in the correct format
   - Check that the work type matches the facility's authorized capabilities
     (simplified: just check that cert number format is valid)

4. PART NUMBER CONSISTENCY
   - P/N should be the same across all events for a given component
   - If a P/N changes (which can happen with modifications), there should be
     a modification event explaining why
   - Flag unexplained P/N changes

5. OEM DATA CROSS-REFERENCE
   - Compare component data against OEM specifications:
     - Does the S/N fall within the OEM's known serial number range?
     - Does the manufacture date fall within the OEM's production period for this P/N?
     - Does the claimed weight match OEM specs?

RUN MODES:
1. Single Component: POST /api/verify/[componentId] — runs all checks for one component
2. Full Scan: POST /api/verify/scan-all — runs all checks across all components
3. On-Event: Automatically runs relevant checks when a new event is added

RESULTS FORMAT:
{
  componentId: "...",
  overallStatus: "pass" | "warnings" | "failures",
  checksRun: 15,
  checksPassed: 12,
  checksWarning: 2,
  checksFailed: 1,
  details: [
    {
      check: "cycle_continuity",
      status: "fail",
      message: "Cycle count decreased between events #4 and #5: 8,200 → 7,900",
      events: ["event4Id", "event5Id"],
      severity: "critical"
    },
    ...
  ]
}

FRONTEND:
- "Run Verification" button on Part Detail page
- Results displayed inline showing pass/warning/fail for each check category
- Failed checks expand to show specific discrepancies with event references

ACCEPTANCE CRITERIA:
- [ ] Cycle/hour continuity is verified across consecutive events
- [ ] Chronological ordering of events is validated
- [ ] Overlapping installations are detected
- [ ] Part number consistency is checked across all events
- [ ] Verification results show pass/warning/fail with specific details
- [ ] "Run Verification" button is accessible on Part Detail page
```

---

## 14. Export & Reporting Suite

### What ProvenAir Does
ProvenAir provides standardized outputs that customers can use in their existing workflows — trace reports, exception summaries, and formatted documentation packages.

### Why AeroTrack Needs This
Enterprise customers need to extract data from AeroTrack into their own systems. Export capabilities are table-stakes for enterprise SaaS.

### User Stories

**US-14.1:** As a **records manager**, I want to export a component's complete history as a formatted PDF report, so I can share it with customers, regulators, or auditors who don't have AeroTrack access.

**US-14.2:** As a **data analyst**, I want to export fleet-wide data as CSV or JSON, so I can analyze it in Excel or my own analytics tools.

**US-14.3:** As an **MRO system administrator**, I want to export event data in ATA Spec 2000 XML format, so I can import it into AMOS or TRAX.

**US-14.4:** As a **repair station owner**, I want to generate a monthly report showing all work performed, components processed, and documentation status, so I can review operations and compliance.

### Implementation Instructions

```
SPEC: Export & Reporting Suite

EXPORT FORMATS:

1. PDF REPORTS (using pdf-lib):
   a. Component Trace Report — full lifecycle timeline with all events and evidence
   b. Exception Report — all open exceptions with remediation status
   c. Fleet Summary Report — all components with status, life remaining, verification badges
   d. Work Completion Report — summary of all work performed in a date range

2. CSV EXPORTS:
   a. Components list with all fields
   b. Events list with all fields
   c. Exceptions list with all fields
   d. Parts consumed list

3. JSON EXPORTS:
   a. Full component data with nested events, evidence, and documents
   b. API-compatible format for integration with other systems

4. XML EXPORTS:
   a. ATA Spec 2000 Chapter 16 format for MRO system integration

API ROUTES:
- GET /api/export/component/[id]?format=pdf|csv|json|xml
- GET /api/export/fleet?format=csv|json
- GET /api/export/exceptions?format=pdf|csv|json
- GET /api/export/report/monthly?month=2026-02&format=pdf

FRONTEND:
- Export dropdown menu on relevant pages:
  - Part Detail: Export component data (PDF, CSV, JSON, XML)
  - Dashboard: Export fleet data (CSV, JSON)
  - Integrity: Export exceptions (PDF, CSV)
- Report generation page (/reports):
  - "Generate Monthly Report" with date picker
  - "Generate Fleet Summary" button
  - "Generate Compliance Report" button
  - Recent reports listed for re-download

ACCEPTANCE CRITERIA:
- [ ] Component data exports as formatted PDF, CSV, JSON, and XML
- [ ] Fleet data exports as CSV and JSON
- [ ] Exception data exports as PDF, CSV, and JSON
- [ ] Monthly report generates as a formatted PDF
- [ ] Export dropdown is accessible on Part Detail and Dashboard pages
- [ ] Downloaded files are properly formatted and complete
```

---

## 15. Knowledge Base & Educational Content

### What ProvenAir Does
ProvenAir maintains an extensive blog and content library covering counterfeit parts, MRO technology, traceability best practices, and regulatory compliance. They also have a podcast. This content strategy builds authority, drives SEO traffic, and educates the market.

### Why AeroTrack Needs This (In-Product Version)
Rather than external content marketing (which is post-MVP), AeroTrack should have an in-product knowledge base that helps users understand aerospace documentation concepts. This is especially valuable because:
- Many users (especially junior technicians) don't fully understand BtB trace requirements
- The industry is complex — explaining concepts in-context reduces support burden
- It demonstrates domain expertise to demo audiences

### User Stories

**US-15.1:** As a **junior mechanic**, I want in-app explanations of aerospace documentation terms (what is an 8130-3? what does "back-to-birth" mean? what is TSN vs. TSO?), so I can learn while working.

**US-15.2:** As a **repair station owner evaluating AeroTrack**, I want to see that the product understands my industry's regulations and terminology, so I trust it to handle my compliance-critical documentation.

### Implementation Instructions

```
SPEC: In-Product Knowledge Base (Contextual Help)

APPROACH: Rather than a separate knowledge base section, add contextual help
tooltips and expandable explanations throughout the product.

1. GLOSSARY TOOLTIPS
   Create /lib/glossary.ts with definitions for all aerospace terms used in the app:

   {
     "8130-3": {
       short: "FAA Authorized Release Certificate",
       full: "FAA Form 8130-3 is the standard document used to approve an aircraft
         part for return to service after maintenance, repair, or overhaul. It's
         issued by an FAA-certified repair station or authorized person. Think of
         it as a part's 'permission slip' to fly. Without it, a component cannot
         legally be installed on a certificated aircraft."
     },
     "BtB": {
       short: "Back-to-Birth trace",
       full: "Back-to-Birth (BtB) trace is the complete documented history of a
         life-limited part from the moment it was manufactured ('born') through
         every installation, removal, repair, and transfer throughout its entire
         life. Complete BtB trace is required for life-limited parts to verify
         their remaining useful life and authenticity."
     },
     "TSN": {
       short: "Time Since New (total flight hours since manufacture)",
       full: "..."
     },
     "CSN": { short: "Cycles Since New", full: "..." },
     "TSO": { short: "Time Since Overhaul", full: "..." },
     "CSO": { short: "Cycles Since Overhaul", full: "..." },
     "LLP": { short: "Life-Limited Part", full: "..." },
     "CMM": { short: "Component Maintenance Manual", full: "..." },
     "SB": { short: "Service Bulletin", full: "..." },
     "AD": { short: "Airworthiness Directive", full: "..." },
     "NDT": { short: "Non-Destructive Testing", full: "..." },
     "ITAR": { short: "International Traffic in Arms Regulations", full: "..." },
     "Part 145": { short: "FAA Repair Station certification", full: "..." },
     "A&P": { short: "Airframe & Powerplant mechanic certificate", full: "..." },
     "IA": { short: "Inspection Authorization", full: "..." },
     "CoC": { short: "Certificate of Conformity", full: "..." },
     "NFF": { short: "No Fault Found", full: "..." },
     "AOG": { short: "Aircraft On Ground (urgent need)", full: "..." },
     // ... 30+ terms
   }

2. TOOLTIP COMPONENT
   Create /components/shared/glossary-tooltip.tsx
   - Renders a dotted-underline term that shows a tooltip on hover
   - Tooltip shows the 'short' definition
   - Click to expand to 'full' definition
   - Use throughout the app wherever these terms appear

3. HELP PANELS
   On key pages, add a collapsible "Learn More" panel:
   - Part Detail page: "Understanding Component Lifecycle Records"
   - Capture page: "How AeroTrack Documentation Works"
   - Integrity page: "Why Documentation Integrity Matters"
   - Each panel has 3-4 paragraphs of plain-language explanation

ACCEPTANCE CRITERIA:
- [ ] 20+ aerospace terms have glossary entries
- [ ] Hovering over underlined terms shows brief definition tooltip
- [ ] Clicking a tooltip expands to full explanation
- [ ] Key pages have "Learn More" collapsible help panels
- [ ] Help content is written in plain language accessible to non-experts
```

---

## Feature Priority Matrix

| # | Feature | MVP Priority | Parker Demo Impact | Implementation Effort | ProvenAir Parity |
|---|---------|-------------|-------------------|---------------------|-----------------|
| 1 | AI Document Scanning & Categorization | **HIGH** | HIGH — shows legacy doc ingestion | Medium (extend existing route) | Core feature |
| 2 | Back-to-Birth Timeline Enhancement | **HIGH** | HIGH — the visual payoff | Medium (enhance existing) | Core feature |
| 3 | Exception & Error Detection | **HIGH** | HIGH — shows intelligence | High (new engine) | Core feature |
| 12 | Counterfeit & Fraud Detection | **HIGH** | HIGH — Parker cares deeply | Medium (extends #3) | Core feature |
| 4 | LLP Life Usage Calculator | **MEDIUM** | MEDIUM — useful context | Low | Core feature |
| 5 | Standards-Compliant Templates | **MEDIUM** | MEDIUM — credibility signal | Medium | Core feature |
| 13 | Cross-Reference Verification | **MEDIUM** | MEDIUM — adds depth | Medium (extends #3) | Core feature |
| 14 | Export & Reporting Suite | **MEDIUM** | LOW (demo) / HIGH (real use) | Medium | Core feature |
| 6 | Bulk Upload & Batch Processing | **LOW** | LOW — demo uses seed data | Medium | Core feature |
| 7 | Multi-Tenant Workspaces | **LOW** | LOW — demo uses "View As" | Low (data model only) | Architecture |
| 8 | Free Document Templates | **LOW** | LOW — marketing feature | Low | Lead gen |
| 9 | Marketplace Integration | **LOW** | MEDIUM — good talking point | Low (badge only) | Strategic |
| 10 | Exception Remediation Workflow | **LOW** | LOW — operational feature | Medium | Services |
| 11 | Lease Return Transition Package | **LOW** | LOW — different wedge | Low (placeholder) | Future |
| 15 | Knowledge Base / Glossary | **LOW** | LOW — nice polish | Low | Content |

---

## What AeroTrack Has That ProvenAir Doesn't

AeroTrack's advantage over ProvenAir is critical to understand — these are NOT features to clone, but features to PROTECT and emphasize:

| AeroTrack Exclusive | Why It Matters |
|---|---|
| **Born-digital record creation** | ProvenAir digitizes OLD records. AeroTrack creates NEW records that never need digitizing. |
| **Real-time voice capture + transcription** | Mechanics talk; paperwork writes itself. ProvenAir has no capture capability. |
| **Photo evidence linked to findings** | Visual proof attached to every finding. ProvenAir only works with existing documents. |
| **AI-generated 8130-3 and work orders** | The "magic moment" — auto-generating formal documentation from voice and photos. ProvenAir doesn't generate documents. |
| **Tribal knowledge capture** | Expert observations preserved in the system. ProvenAir doesn't capture new knowledge. |
| **Real-time AI findings extraction** | As the mechanic speaks, findings are structured live. |
| **ITAR restricted mode** | Shows understanding of defense sector constraints. |
| **Electronic signature workflow** | Completes the loop — capture → generate → sign → release. |

**The pitch:** ProvenAir helps you make sense of your PAST documentation. AeroTrack creates your FUTURE documentation — and also handles the past.

---

## Implementation Order for Ralph Wiggum Specs

If creating specs for Ralph Wiggum to implement, the recommended order is:

1. **Feature #3: Exception & Error Detection** (creates the data model other features depend on)
2. **Feature #12: Counterfeit & Fraud Detection** (extends #3, high demo impact)
3. **Feature #2: Back-to-Birth Timeline Enhancement** (builds on seed data + exceptions)
4. **Feature #1: AI Document Scanning** (extends existing route)
5. **Feature #4: LLP Life Calculator** (straightforward, adds dashboard value)
6. **Feature #13: Cross-Reference Verification** (extends exception engine)
7. **Feature #5: Standards-Compliant Templates** (export capability)
8. **Feature #14: Export & Reporting** (natural follow-on to templates)
9. **Feature #9: Marketplace Badge** (simple but impressive)
10. **Feature #15: Glossary Tooltips** (polish)
11. **Feature #7: Multi-Tenant Data Model** (foundation for future)
12. **Feature #10: Remediation Workflow** (operational depth)
13. **Feature #6: Bulk Upload** (operational depth)
14. **Feature #8: Free Templates** (marketing)
15. **Feature #11: Lease Return Placeholder** (future wedge)
