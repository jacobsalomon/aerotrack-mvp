# 004: AI Document Scanning & Auto-Categorization

**Priority:** 8 (DEFERRED — not needed for HEICO demo, build later)
**Estimated effort:** Medium
**Dependencies:** Spec 001 (exceptions auto-run on newly linked documents)

---

## Overview

Build the ability to upload legacy maintenance records (PDFs, scanned documents) and have Claude AI automatically classify each document by type and extract key metadata — part numbers, serial numbers, dates, cycle counts, facility information. This is ProvenAir's core feature, and AeroTrack needs it because every component has a HISTORY of paper records that predates the digital system.

For the Parker/HEICO demo, this shows that AeroTrack isn't just for the future — it can also make sense of decades of existing records. The demo moment: upload a scanned 8130-3 PDF, watch AI extract every field, and see it appear on the component's timeline. "You have filing cabinets full of these. AeroTrack can read them all."

---

## What to Build

### 1. Extend the Document Model

Add fields to the existing `Document` model in the Prisma schema:

```prisma
model Document {
  // ... existing fields ...

  // New fields for AI classification:
  aiClassification  String?   // AI-determined document type
  aiConfidence      Float?    // 0.0-1.0 confidence score
  extractedData     String?   // JSON blob of all extracted metadata
  processingStatus  String    @default("unprocessed") // "unprocessed", "processing", "complete", "error"
  processingError   String?   // Error message if processing failed
}
```

Run `npx prisma db push` and `npx prisma generate`.

### 2. AI Classification Route

Enhance the existing `/api/ai/analyze-document` route (or create it if it doesn't exist):

**Input:** PDF file upload (multipart form data) + optional componentId to auto-link

**Process:**
1. Extract text from the PDF using `pdf-parse`
2. Send extracted text to Claude API (claude-sonnet-4-5-20250929) with this prompt:

```
You are an expert aerospace maintenance records analyst with 20 years of experience
reading 8130-3 forms, work orders, CMM excerpts, and other aviation maintenance
documentation. Classify this document and extract all key metadata.

DOCUMENT TEXT:
---
{extracted_text}
---

CLASSIFY THIS DOCUMENT (choose the single best match):
- "8130-3" — FAA Authorized Release Certificate / Airworthiness Approval Tag
- "work_order" — Repair, overhaul, or inspection work order / job card
- "findings_report" — Inspection findings or condition report
- "cmm" — Component Maintenance Manual page or excerpt
- "service_bulletin" — Manufacturer or operator service bulletin
- "airworthiness_directive" — FAA or EASA Airworthiness Directive
- "logbook_entry" — Aircraft, engine, or component logbook page
- "birth_certificate" — Original manufacturer certificate of conformity or release
- "certificate_of_conformity" — Supplier Certificate of Conformity
- "shipping_record" — Shipping, receiving, or transfer documentation
- "test_report" — Functional test, pressure test, or performance test results
- "ndt_report" — Non-destructive testing report (MPI, FPI, UT, eddy current)
- "modification_record" — STC, engineering order, or modification documentation
- "unknown" — Cannot determine document type

EXTRACT ALL METADATA FOUND (return null for any field not found in the document):
{
  "classification": "the document type from above",
  "confidence": 0.0-1.0,
  "partNumbers": ["list of all part numbers found"],
  "serialNumbers": ["list of all serial numbers found"],
  "dates": [
    {"type": "manufacture|repair|inspection|issuance|expiry", "date": "YYYY-MM-DD", "context": "what this date refers to"}
  ],
  "cycleData": [
    {"type": "TSN|CSN|TSO|CSO", "value": number, "context": "..."}
  ],
  "hourData": [
    {"type": "TSN|HSN|TSO|HSO", "value": number, "context": "..."}
  ],
  "facility": {
    "name": "facility name",
    "location": "city, state/country",
    "certificateNumber": "FAA Part 145 cert number if found",
    "type": "oem|airline|mro|distributor|broker"
  },
  "personnel": [
    {"name": "person name", "role": "mechanic|inspector|signatory", "certificateNumber": "A&P or IA cert number"}
  ],
  "workPerformed": "brief summary of work if this is a work order or 8130-3",
  "disposition": "serviceable|unserviceable|scrapped|overhauled|repaired|inspected|null",
  "cmmReferences": ["list of CMM references mentioned"],
  "aircraftRegistration": "N-number or registration if mentioned",
  "summary": "One paragraph summary of what this document says",
  "qualityAssessment": {
    "legibility": 1-5,
    "completeness": 1-5,
    "redFlags": ["list any suspicious elements — inconsistent dates, unusual formatting, missing required fields, etc."]
  }
}

Be precise. Only extract data that is clearly present in the document text. Do not guess
or infer values that aren't explicitly stated. For dates, use the actual date found even
if the format is unusual.
```

3. Parse the Claude response and store it in the Document record
4. If a componentId was provided, link the document to that component
5. If no componentId but extracted P/N and S/N match an existing component, suggest the link

**Return:** The classified document data with extracted metadata

### 3. Sample Documents for Demo

Create 3 sample PDF files in `/public/sample-docs/` for the demo. Use `pdf-lib` to generate them programmatically (create a script at `/scripts/generate-sample-docs.ts`):

**Sample 1: `sample-8130-3.pdf`**
- A realistic-looking FAA Form 8130-3 for Component 1 (881700-1001)
- All 14 blocks filled with realistic data matching the seed data
- Facility: ACE Services Singapore
- Date: February 2022
- Work: "Overhauled per CMM 29-10-01 Rev. 12"

**Sample 2: `sample-work-order.pdf`**
- A repair station work order for Component 6 (881700-1089)
- Facility: AAR Corp, Miami FL
- Sections: As-Received Condition, Findings, Work Performed, Test Results
- Include realistic aerospace maintenance language

**Sample 3: `sample-poor-quality.pdf`**
- A deliberately lower-quality document (sparse content, some fields missing)
- For Component 2 (the gap component) — the São Paulo repair
- Show AI handling imperfect input and flagging issues in qualityAssessment

### 4. Frontend: Upload & Classify Interface

Add an "Upload Legacy Document" feature accessible from two places:

**A) Part Detail Page — Upload Button**
On the Part Detail page, in the documents section, add an "Upload Legacy Document" button that:
1. Opens a file picker (accept .pdf, .jpg, .png)
2. Shows upload progress
3. Shows a "Analyzing document..." spinner while AI processes
4. When complete, shows a result card:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📄 AI Classification Result                     Confidence: 96% │
│                                                                   │
│ Document Type: FAA Form 8130-3                                   │
│                                                                   │
│ Extracted Data:                                                   │
│ • Part Number: 881700-1001                                       │
│ • Serial Number: SN-2019-07842                                   │
│ • Date: February 12, 2022                                        │
│ • Facility: ACE Services, Singapore                              │
│ • Work: Overhauled per CMM 29-10-01 Rev. 12                     │
│ • Disposition: Overhauled — Return to Service                    │
│ • Signatory: Michael Tan, Certificate #AP-SG-2019-4421          │
│                                                                   │
│ Quality: ★★★★★ Legibility | ★★★★★ Completeness                  │
│ Red Flags: None detected                                         │
│                                                                   │
│ ✅ Auto-linked to: 881700-1001 (SN-2019-07842)                  │
│                                                                   │
│ [View Original PDF]  [Edit Extracted Data]  [Add to Timeline]    │
└─────────────────────────────────────────────────────────────────┘
```

5. "Add to Timeline" creates a LifecycleEvent from the extracted data and links the Document to it

**B) Standalone Upload Page (/documents/upload)**
A dedicated page for uploading documents when you're not starting from a specific component:
- Drag-and-drop zone for single or multiple PDFs (up to 10 at a time for MVP)
- Each uploaded file gets its own classification card
- For each, show extracted P/N and S/N with "Link to Component" button
- If P/N+S/N matches an existing component, auto-suggest the link

### 5. Demo Flow

For the demo, have a pre-printed sample 8130-3 PDF ready. The presenter:
1. Opens Component 1's Part Detail page
2. Clicks "Upload Legacy Document"
3. Selects the sample PDF
4. AI analyzes it in ~3-5 seconds
5. All 14 blocks are extracted and displayed
6. "Add to Timeline" puts it on the component's timeline
7. Say to Parker: "You have 20 years of these in filing cabinets. AeroTrack can read them all."

---

## Acceptance Criteria

- [ ] `Document` model has new fields: aiClassification, aiConfidence, extractedData, processingStatus
- [ ] API route accepts PDF upload and sends extracted text to Claude for classification
- [ ] AI correctly classifies 8130-3 forms, work orders, findings reports, and other document types
- [ ] AI extracts part numbers, serial numbers, dates, cycle counts, and facility info from documents
- [ ] AI provides a quality assessment (legibility, completeness, red flags) for each document
- [ ] 3 sample PDFs exist in /public/sample-docs/ with realistic aerospace content
- [ ] Part Detail page has "Upload Legacy Document" button
- [ ] Upload shows progress spinner during AI analysis
- [ ] Classification result card shows extracted data clearly
- [ ] Auto-links document to matching component when P/N + S/N match
- [ ] "Add to Timeline" creates a LifecycleEvent from extracted data
- [ ] Standalone upload page (/documents/upload) exists with drag-and-drop
- [ ] Confidence scores are shown (green >90%, yellow 70-90%, red <70%)
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
