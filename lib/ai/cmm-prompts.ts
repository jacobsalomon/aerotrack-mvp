// Prompts for CMM inspection sheet extraction.
// Separated into their own file so we can iterate on them quickly
// during prompt validation without touching extraction logic.

// ── Pass 1: classify each page and identify sub-assemblies ──────────

export const PASS1_CLASSIFICATION_PROMPT = `You are an aerospace CMM (Component Maintenance Manual) expert analyzing inspection sheet pages.

For this page, identify:
1. Whether it contains an inspection diagram, text instructions, a parts list, or should be ignored
2. If it's a diagram: the figure number, sub-assembly name, and sheet number

Return JSON matching this exact structure:
{
  "pageType": "diagram" | "inspection_text" | "parts_list" | "ignore",
  "figureNumber": "816" or null,
  "subAssemblyTitle": "Assembly of End Housing Unit" or null,
  "sheetNumber": 1,
  "totalSheets": 3,
  "partNumbers": ["739515", "745329"],
  "notes": "any relevant context about what this page covers",
  "explicitReferences": {
    "figureReferences": ["812", "823"],
    "pageReferences": ["73-24", "73-25"],
    "checkReferences": ["23"],
    "repairReferences": ["6", "25"],
    "specialAssemblyReferences": ["823"]
  }
}

RULES:
- "diagram" = exploded assembly view with torque specs, callout numbers, tool requirements scattered on the drawing
- "inspection_text" = text-heavy pages with warnings, cautions, general notes, check/repair procedures, tool lists
- "parts_list" = IPL (Illustrated Parts List) tables showing part numbers, descriptions, quantities
- "ignore" = cover pages, title pages, boilerplate, revision history, blank pages
- Look for "FIGURE XXX" or "FIG. XXX" patterns for figure numbers
- Look for "SHEET X OF Y" patterns for multi-sheet figures
- Extract the sub-assembly title from figure captions (e.g., "ASSEMBLY OF END HOUSING UNIT")
- Extract any part number patterns (typically 6-7 digit numbers, sometimes with letter suffixes)

EXPLICIT REFERENCE EXTRACTION:
- Look for cross-references to other figures: "REFER TO FIGURE 812", "SEE FIGURE 823", "FIG. 812", "FIGURE 812"
  → Extract just the figure number into figureReferences (e.g., ["812", "823"])
- Look for page references: "SEE PAGE 73-24", "REFER TO PAGE 73-25", "PAGE 73-24"
  → Extract the page identifier into pageReferences (e.g., ["73-24"])
- Look for check references: "CHECK 23", "REFER TO CHECK 23", "SEE CHECK 12"
  → Extract just the check number into checkReferences (e.g., ["23"])
- Look for repair references: "REPAIR 6", "REFER TO REPAIR 6, 25", "SEE REPAIR 25"
  → Extract the repair numbers into repairReferences (e.g., ["6", "25"])
- Look for special assembly references: "SPECIAL ASSEMBLY FIGURE 823"
  → Extract the figure number into specialAssemblyReferences (e.g., ["823"])
- Return empty arrays if no references of that type are found
- Only extract references that point to OTHER figures/pages, not the current page's own figure number`;

// ── Pass 2: deep extraction with systematic scan + few-shot examples ──

// System instruction for the extraction role (used as system prompt for Claude,
// systemInstruction for Gemini)
export const PASS2_SYSTEM_INSTRUCTION = `You are a meticulous, certified aerospace inspector with 20+ years of experience interpreting Component Maintenance Manual (CMM) diagrams. You analyze inspection sheet pages with safety-critical precision. Missing a single torque spec or tool requirement could cause an aircraft incident.

Your task: extract EVERY specification, check, tool requirement, and note from the provided CMM diagram page into a structured JSON format. You must be exhaustive — it is far better to include an item with lower confidence than to omit it.`;

// The main extraction prompt with context placeholders, naming convention,
// itemType definitions, few-shot examples, and output schema.
export const PASS2_EXTRACTION_PROMPT = `CONTEXT: This is Figure {figureNumber} — "{sectionTitle}" from a CMM for part numbers {partNumbers}.

STEP 1 — SYSTEMATIC PAGE SCAN:
Before extracting items, scan the ENTIRE page systematically:
- Top-left to top-right: all callout numbers, leader lines, and annotations
- Middle-left to middle-right: all torque specs, dimensional notes, tool callouts
- Bottom-left to bottom-right: all text boxes, warnings, cautions, notes
- Margins and insets: any supplementary information, cross-references, or configuration notes
Write your findings in the "pageAnalysis" field of the JSON output.

STEP 2 — STRUCTURED EXTRACTION:
For each item found in your scan, create a JSON entry following the schema and rules below.

ITEM TYPE DEFINITIONS (use ONLY these values):
- "torque_spec": An instruction to tighten a fastener to a specific torque value with a numerical range.
- "dimension_check": An instruction to measure a dimension (length, diameter, runout, clearance) — often with a CHECK reference.
- "dimensional_spec": A passive dimensional statement on the drawing, not an explicit check instruction.
- "visual_check": An instruction to visually inspect for damage, wear, corrosion, or correct assembly.
- "procedural_check": A check to verify a process (e.g., "Ensure part is seated", "Verify rotation").
- "safety_wire": Any instruction related to safety wire or lockwire installation/inspection.
- "tool_requirement": A standalone callout for a required tool, fixture, or equipment. NOT for tools alongside a torque spec.
- "matched_set": Parts marked as matched sets that must not be interchanged.
- "replace_if_disturbed": An instruction to replace a part (gasket, o-ring, self-locking nut) if removed or disturbed.
- "general_note": Any important note, warning, caution, or instruction that does not fit the categories above.

PARAMETER NAMING CONVENTION (CRITICAL for consistency):
Use the format: "Item [callout] [Component Description] [Parameter Type]"
Examples:
- "Item 290 End Housing Bolt Torque"
- "Item 110 Shaft End Play Check"
- "Item 50 O-Ring Replacement"
- For items without a callout number, omit "Item [callout]": "Assembly Part Number Reference"

EXTRACTION RULES:

Torque Specs:
- Extract BOTH imperial and metric values when both shown (e.g., "51-56 LB-IN (5.8-6.3 N-m)")
- If only one unit shown, leave the other fields as null
- Parse ranges into specValueLow and specValueHigh
- For single values, set both low and high to that value

Dimensional Specs:
- Clearances, fits, gaps, runouts, endplay measurements
- e.g., "0.010 INCH MAXIMUM" → specValueLow: 0, specValueHigh: 0.010, specUnit: "INCH"

Tool Requirements:
- Extract ALL tool/fixture identifiers: AGE, WCS, DJS, FDS, PES, BLS, AKS, HTS numbers
- Tools mentioned alongside a torque spec go in that spec's toolsRequired, NOT as a separate tool_requirement item
- For standalone tool_requirement items, put tool IDs in the specification field too

Check/Repair References:
- "REFER TO CHECK 23" → checkReference: "CHECK 23"
- "REFER TO REPAIR 6, 25" → repairReference: "REPAIR 6, 25"

Configuration-Specific Items:
- "P/N 1709614C CONFIGURATION" → configurationApplicability: ["1709614C"]
- If applies to all configurations, leave as empty array

Test Results and Data Tables:
- If the page contains a test results form, data table, or measurement log, extract EVERY row as a separate item
- Use "general_note" for test results that don't fit other categories (electrical tests, surge tests, resistance checks, etc.)
- Use the full field name as parameterName (e.g., "Surge Test Peak Voltage L1", "EAR 1-2/2-3/3-1 (%)")
- Include the value AND units in the specification field (e.g., "2000 V", "0/--/--", "1.6/1.4/-- %")
- Do NOT skip rows just because they have zero values, dashes, or "No Test Performed" — extract every row
- For multi-column tables, extract each data cell that contains a measurement or result

Units (CRITICAL):
- ALWAYS include units in the specification field and specUnit field
- Electrical: V (volts), A (amps), OHM/OHMS, Hz, kW, HP, VA, W
- Percentage: % (for EAR, delta, ratio values)
- Temperature: °F, °C
- If a unit is shown anywhere on the page (e.g., in a column header or page header), apply it to all values in that column
- Never extract a bare number without its unit — check the column header, row label, or page header for the unit

Confidence Scoring:
- 0.9-1.0: clearly visible, unambiguous spec
- 0.7-0.9: readable but some interpretation needed
- 0.5-0.7: partially obscured or ambiguous
- Below 0.5: guessing — include but flag

FEW-SHOT EXAMPLES:

Example 1 — Torque Spec with Tool:
Source text on diagram: "290 TORQUE 51-56 LB-IN (5.8-6.3 N-m) USE AGE10037"
Extracted item:
{
  "itemType": "torque_spec",
  "itemCallout": "290",
  "parameterName": "Item 290 End Housing Bolt Torque",
  "specification": "51-56 LB-IN (5.8-6.3 N-m)",
  "specValueLow": 51,
  "specValueHigh": 56,
  "specUnit": "LB-IN",
  "specValueLowMetric": 5.8,
  "specValueHighMetric": 6.3,
  "specUnitMetric": "N-m",
  "toolsRequired": ["AGE10037"],
  "checkReference": null,
  "repairReference": null,
  "specialAssemblyRef": null,
  "configurationApplicability": [],
  "notes": null,
  "confidence": 0.98
}

Example 2 — Standalone Tool Requirement:
Source text on diagram: "USE TOOL DJS-34414 TO HEAT BEARING SUPPORT"
Extracted item:
{
  "itemType": "tool_requirement",
  "itemCallout": "180",
  "parameterName": "Item 180 Bearing Support Heating Fixture",
  "specification": "DJS-34414",
  "specValueLow": null,
  "specValueHigh": null,
  "specUnit": null,
  "specValueLowMetric": null,
  "specValueHighMetric": null,
  "specUnitMetric": null,
  "toolsRequired": ["DJS-34414"],
  "checkReference": null,
  "repairReference": null,
  "specialAssemblyRef": null,
  "configurationApplicability": [],
  "notes": "Heat bearing support assembly for installation",
  "confidence": 0.95
}

Example 3 — Replace If Disturbed:
Source text: Note box reading "REPLACE O-RINGS IF DISTURBED"
Extracted item:
{
  "itemType": "replace_if_disturbed",
  "itemCallout": null,
  "parameterName": "O-Ring Replacement If Disturbed",
  "specification": "REPLACE O-RINGS IF DISTURBED",
  "specValueLow": null,
  "specValueHigh": null,
  "specUnit": null,
  "specValueLowMetric": null,
  "specValueHighMetric": null,
  "specUnitMetric": null,
  "toolsRequired": null,
  "checkReference": null,
  "repairReference": null,
  "specialAssemblyRef": null,
  "configurationApplicability": [],
  "notes": null,
  "confidence": 0.99
}

OUTPUT FORMAT:
Return a single JSON object with this structure:
{
  "pageAnalysis": "Detailed inventory of everything visible on this page — list every callout number, every torque value, every tool ID, every text box, every note you can see.",
  "items": [ ... ],
  "sectionConfidence": 0.9,
  "extractionNotes": "Any ambiguities, illegible text, or items you are uncertain about."
}`;

// Additional instructions for Claude — appended to the user message.
// Addresses Claude's tendency to find fewer items and its JSON output format.
export const PASS2_CLAUDE_ADDITIONS = `

IMPORTANT OUTPUT FORMAT: Return ONLY raw JSON. Do NOT wrap in markdown code fences, do NOT add any text before or after the JSON object.

COMPLETENESS VERIFICATION: Before finalizing your response, perform this check:
1. Count every callout number visible on the page (circled numbers with leader lines)
2. Count every torque value visible (numbers followed by LB-IN, LB-FT, N-m, etc.)
3. Count every tool identifier visible (AGE, WCS, DJS, FDS, PES, BLS, AKS, HTS prefixes)
4. Count every text box (CAUTION, WARNING, NOTE boxes)
5. Verify your items array accounts for ALL of the above. If any are missing, add them now.`;

// ── Gemini responseSchema — enforces JSON structure at the API level ──

// This schema tells Gemini exactly what shape to return. Field descriptions
// act as inline instructions. The pageAnalysis field is first, forcing the
// model to reason through the page before generating items.
export const CMM_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    pageAnalysis: {
      type: "string",
      description: "A thorough inventory of everything visible on this CMM diagram page. List every callout number, torque value, tool ID, text box, note, and cross-reference you can see. This analysis must be complete before generating items.",
    },
    items: {
      type: "array",
      description: "Array of every extracted specification, check, tool requirement, and note from the page.",
      items: {
        type: "object",
        properties: {
          itemType: {
            type: "string",
            enum: [
              "torque_spec",
              "dimension_check",
              "dimensional_spec",
              "visual_check",
              "procedural_check",
              "safety_wire",
              "tool_requirement",
              "matched_set",
              "general_note",
              "replace_if_disturbed",
            ],
            description: "The category of this inspection item.",
          },
          itemCallout: {
            type: "string",
            nullable: true,
            description: "The callout number on the diagram pointing to this part (e.g., '290', '15'). Null if no specific callout.",
          },
          partNumber: {
            type: "string",
            nullable: true,
            description: "Part number if explicitly associated with this item. Usually null.",
          },
          parameterName: {
            type: "string",
            description: "Descriptive name in the format 'Item [callout] [Component] [Type]'. Example: 'Item 290 End Housing Bolt Torque'.",
          },
          specification: {
            type: "string",
            description: "The exact specification text from the diagram. For torque specs include both units: '51-56 LB-IN (5.8-6.3 N-m)'. For tool items, include the tool ID. Never empty.",
          },
          specValueLow: {
            type: "number",
            nullable: true,
            description: "Lower bound of the spec range in imperial units. Null if not a numeric spec.",
          },
          specValueHigh: {
            type: "number",
            nullable: true,
            description: "Upper bound of the spec range in imperial units. For single values, same as specValueLow.",
          },
          specUnit: {
            type: "string",
            nullable: true,
            description: "Imperial unit: LB-IN, LB-FT, INCH, PSI, etc. Null if not applicable.",
          },
          specValueLowMetric: {
            type: "number",
            nullable: true,
            description: "Lower bound in metric units (N-m, mm, etc.). Null if not shown.",
          },
          specValueHighMetric: {
            type: "number",
            nullable: true,
            description: "Upper bound in metric units. Null if not shown.",
          },
          specUnitMetric: {
            type: "string",
            nullable: true,
            description: "Metric unit: N-m, N-cm, MM, etc. Null if not applicable.",
          },
          toolsRequired: {
            type: "array",
            nullable: true,
            items: { type: "string" },
            description: "Array of tool/fixture IDs required (AGE, WCS, DJS, FDS, PES, BLS, AKS, HTS numbers). Null or empty if none.",
          },
          checkReference: {
            type: "string",
            nullable: true,
            description: "Reference to a CHECK in the CMM text (e.g., 'CHECK 23'). Null if none.",
          },
          repairReference: {
            type: "string",
            nullable: true,
            description: "Reference to a REPAIR procedure (e.g., 'REPAIR 6, 25'). Null if none.",
          },
          specialAssemblyRef: {
            type: "string",
            nullable: true,
            description: "Reference to a special assembly figure (e.g., 'SPECIAL ASSEMBLY FIGURE 823'). Null if none.",
          },
          configurationApplicability: {
            type: "array",
            items: { type: "string" },
            description: "Part number configurations this item applies to. Empty array if applies to all.",
          },
          notes: {
            type: "string",
            nullable: true,
            description: "Additional notes, warnings, or context for this item. Null if none.",
          },
          confidence: {
            type: "number",
            description: "Confidence score 0.0-1.0. 0.9+ for clear specs, 0.7-0.9 for readable but interpreted, below 0.7 for ambiguous.",
          },
        },
        required: [
          "itemType",
          "parameterName",
          "specification",
          "confidence",
        ],
      },
    },
    sectionConfidence: {
      type: "number",
      description: "Overall confidence for the entire page extraction, 0.0-1.0.",
    },
    extractionNotes: {
      type: "string",
      description: "Any ambiguities, illegible text, partially obscured areas, or difficulties encountered.",
    },
  },
  required: ["pageAnalysis", "items", "sectionConfidence", "extractionNotes"],
};
