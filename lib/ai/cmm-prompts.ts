// Prompts for CMM inspection sheet extraction.
// Separated into their own file so we can iterate on them quickly
// during US-008 prompt validation without touching extraction logic.

// Pass 1: classify each page and identify sub-assemblies
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
  "notes": "any relevant context about what this page covers"
}

RULES:
- "diagram" = exploded assembly view with torque specs, callout numbers, tool requirements scattered on the drawing
- "inspection_text" = text-heavy pages with warnings, cautions, general notes, check/repair procedures, tool lists
- "parts_list" = IPL (Illustrated Parts List) tables showing part numbers, descriptions, quantities
- "ignore" = cover pages, title pages, boilerplate, revision history, blank pages
- Look for "FIGURE XXX" or "FIG. XXX" patterns for figure numbers
- Look for "SHEET X OF Y" patterns for multi-sheet figures
- Extract the sub-assembly title from figure captions (e.g., "ASSEMBLY OF END HOUSING UNIT")
- Extract any part number patterns (typically 6-7 digit numbers, sometimes with letter suffixes)`;

// Pass 2: deep extraction of specs, tools, and checks from a sub-assembly
export const PASS2_EXTRACTION_PROMPT = `You are an expert aerospace inspector analyzing CMM inspection sheet diagrams. Extract EVERY specification, check, tool requirement, and note from this sub-assembly diagram.

Context: This is Figure {figureNumber} — "{sectionTitle}" from a CMM for part numbers {partNumbers}.

Return JSON matching this exact structure:
{
  "items": [
    {
      "itemType": "torque_spec" | "dimension_check" | "dimensional_spec" | "visual_check" | "procedural_check" | "safety_wire" | "tool_requirement" | "matched_set" | "general_note" | "replace_if_disturbed",
      "itemCallout": "290",
      "partNumber": null,
      "parameterName": "End Housing Bolt Torque",
      "specification": "51-56 LB-IN (5.8-6.3 N-m)",
      "specValueLow": 51,
      "specValueHigh": 56,
      "specUnit": "LB-IN",
      "specValueLowMetric": 5.8,
      "specValueHighMetric": 6.3,
      "specUnitMetric": "N-m",
      "toolsRequired": ["AGE10037", "BLS-34347"],
      "checkReference": "CHECK 23",
      "repairReference": "REPAIR 6, 25",
      "specialAssemblyRef": "SPECIAL ASSEMBLY FIGURE 823",
      "configurationApplicability": [],
      "notes": "REPLACE O-RINGS IF DISTURBED",
      "confidence": 0.95
    }
  ],
  "sectionConfidence": 0.9,
  "extractionNotes": "any issues or ambiguities encountered"
}

EXTRACTION RULES — read carefully:

TORQUE SPECS:
- Extract BOTH imperial and metric values when both are shown (e.g., "51-56 LB-IN (5.8-6.3 N-m)")
- If only one unit is shown, leave the other unit fields as null
- Parse ranges into specValueLow and specValueHigh
- For single values (e.g., "55 LB-IN"), set both low and high to the same value
- Common units: LB-IN, LB-FT, N-m, N-cm

DIMENSIONAL SPECS:
- Clearances, fits, gaps, runouts, endplay measurements
- e.g., "0.010 INCH MAXIMUM" → specValueLow: 0, specValueHigh: 0.010, specUnit: "INCH"

TOOL REQUIREMENTS:
- Extract ALL tool/fixture identifiers: AGE, WCS, DJS, FDS, PES, BLS, AKS, HTS numbers
- A single step may require multiple tools — list them all in toolsRequired
- Set itemType to "tool_requirement" ONLY for standalone tool callouts, NOT for tools mentioned alongside a torque spec (those go in the torque spec's toolsRequired)
- For tool_requirement items, put the tool IDs in the specification field too (e.g., "PES-34398-1, HTS-34395") — never leave specification empty

CHECK AND REPAIR REFERENCES:
- "REFER TO CHECK 23" → checkReference: "CHECK 23"
- "REFER TO REPAIR 6, 25" → repairReference: "REPAIR 6, 25"
- Include the full reference text

SAFETY WIRE:
- "SAFETY WIRE" or "LOCKWIRE" callouts → itemType: "safety_wire"
- Note the specific items that need safety wiring

MATCHED SETS:
- Items marked as matched sets or paired assemblies → itemType: "matched_set"

CONFIGURATION-SPECIFIC ITEMS:
- Items that only apply to certain part number configurations
- e.g., "P/N 1709614C CONFIGURATION" → configurationApplicability: ["1709614C"]
- If an item applies to all configurations, leave configurationApplicability as empty array

CAUTIONS / WARNINGS / NOTES:
- Text boxes with "CAUTION:", "WARNING:", "NOTE:" → itemType depends on content:
  - "REPLACE O-RINGS IF DISTURBED" → "replace_if_disturbed"
  - "MAKE SURE PUMPS ROTATE FREELY" → "procedural_check"
  - General information → "general_note"

CONFIDENCE:
- 0.9-1.0: clearly visible, unambiguous spec
- 0.7-0.9: readable but some interpretation needed
- 0.5-0.7: partially obscured or ambiguous
- Below 0.5: guessing — flag these

CRITICAL: Extract EVERY item visible on the page. Missing a torque spec or tool requirement could cause a safety issue. When in doubt, include it with lower confidence rather than omitting it.`;

// Additional instructions appended to the prompt when calling Claude.
// Claude tends to extract fewer items than Gemini — this nudges it toward completeness.
export const PASS2_CLAUDE_SUFFIX = `

IMPORTANT: Return ONLY raw JSON. Do NOT wrap in markdown code fences or add any text outside the JSON object.

COMPLETENESS CHECK: Before returning, count ALL callout numbers visible on this page. Verify your items list accounts for each one. If you see a callout number on the drawing that is not in your output, add it with your best interpretation.`;
