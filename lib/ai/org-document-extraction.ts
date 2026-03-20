// Extract form fields from an uploaded org document (PDF) using Gemini vision.
// The PDF is sent directly to Gemini which can read complex layouts,
// tables, checkboxes, and multi-page forms natively.
//
// Used during the drafting stage: if a session has an orgDocumentId,
// we extract the form structure so the AI can fill in fields from evidence.

import { callGemini } from "./provider";

export interface ExtractedFormField {
  fieldName: string;        // Human-readable label (e.g., "Part Number")
  fieldType: string;        // "text", "number", "checkbox", "date", "signature", "dropdown"
  currentValue: string;     // Pre-filled value if any, otherwise empty string
  required: boolean;        // Whether the field appears mandatory
  section: string;          // Which section/page of the form this belongs to
}

export interface OrgDocumentExtraction {
  documentTitle: string;
  documentPurpose: string;  // What this form is used for
  fields: ExtractedFormField[];
  sections: string[];       // Ordered list of form sections
  pageCount: number;
  rawStructure: string;     // Full text description for the AI prompt
}

// Fetch a PDF from Vercel Blob and extract its form structure using Gemini vision
export async function extractOrgDocumentFields(
  fileUrl: string
): Promise<OrgDocumentExtraction> {
  // Download the PDF
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch org document PDF (status ${response.status})`);
  }
  const pdfBuffer = Buffer.from(await response.arrayBuffer());
  const pdfBase64 = pdfBuffer.toString("base64");

  // Send the PDF to Gemini for vision-based form field extraction
  const extractionPrompt = `You are a form analysis expert. Analyze this PDF document and extract its complete structure.

This is an internal form used by an aircraft maintenance organization. Your job is to identify every fillable field so that an AI can later populate them automatically from captured measurements and evidence.

Return JSON matching this exact structure:
{
  "documentTitle": "The form's title",
  "documentPurpose": "One sentence describing what this form is used for",
  "fields": [
    {
      "fieldName": "Human-readable label (exactly as printed on the form)",
      "fieldType": "text|number|checkbox|date|signature|dropdown",
      "currentValue": "Any pre-filled value, or empty string",
      "required": true,
      "section": "Section name from the form"
    }
  ],
  "sections": ["Ordered list of section names"],
  "pageCount": 1
}

IMPORTANT RULES:
- Extract EVERY fillable field, even small ones like date fields and checkboxes

CRITICAL — MEASUREMENT/INSPECTION TABLES:
- Many aerospace forms have tables where each ROW is a separate measurement (e.g., "1st Stage Blade Tip Diameter", "Main Bearing Journal OD").
- For these tables, extract EACH ROW as its own field. The fieldName should be the measurement name from that row (e.g., "1st Stage Blade Tip Diameter").
- If a row has an "Actual" or "Measured" column that needs to be filled in, that row IS a field — the measurement name is the fieldName and the fieldType is "number".
- Include the specification/tolerance in currentValue if printed (e.g., "Spec: 18.742 - 18.758 in").
- Do NOT just extract the column headers ("ACTUAL", "STATUS") as fields — extract each individual measurement row.
- If the table has a section header row (e.g., "COMPRESSOR ROTOR", "SHAFT ASSEMBLY"), use that as the section name for the rows beneath it.

OTHER RULES:
- Preserve the exact field labels as printed on the form
- Group fields by their visual section
- If a field has a pre-printed value, include it in currentValue
- Mark fields as required if they have asterisks, bold labels, or appear essential
- For header fields (Part Number, Serial Number, Work Order, Date, etc.), extract each as a separate field in a "Header" section`;

  const resultText = await callGemini({
    model: "gemini-2.5-flash-preview-05-20",
    contents: [
      {
        role: "user",
        parts: [
          { text: extractionPrompt },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
    timeoutMs: 60000,
  });

  const parsed = JSON.parse(resultText) as Omit<OrgDocumentExtraction, "rawStructure">;

  // Build a human-readable structure summary for the document generation prompt
  const rawStructure = buildStructureSummary(parsed);

  return {
    ...parsed,
    rawStructure,
  };
}

// Build a text summary of the form structure for injection into the generation prompt
function buildStructureSummary(
  extraction: Omit<OrgDocumentExtraction, "rawStructure">
): string {
  const lines: string[] = [
    `FORM: ${extraction.documentTitle}`,
    `PURPOSE: ${extraction.documentPurpose}`,
    `PAGES: ${extraction.pageCount}`,
    "",
    "FIELDS TO FILL:",
  ];

  // Group fields by section
  const bySection = new Map<string, ExtractedFormField[]>();
  for (const field of extraction.fields) {
    const section = field.section || "General";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push(field);
  }

  for (const [section, fields] of bySection) {
    lines.push(`\n  [${section}]`);
    for (const f of fields) {
      const req = f.required ? " (REQUIRED)" : "";
      const pre = f.currentValue ? ` [pre-filled: ${f.currentValue}]` : "";
      lines.push(`    - ${f.fieldName} (${f.fieldType})${req}${pre}`);
    }
  }

  return lines.join("\n");
}
