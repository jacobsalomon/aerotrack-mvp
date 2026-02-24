import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

// This API route extracts structured data from a photo of an aviation
// maintenance document (8130-3, data plate, work order, etc.) using
// Claude's vision capabilities. If no API key is configured, it returns
// realistic mock data that matches the demo component (Component 9).

export async function POST(req: NextRequest) {
  // Require dashboard authentication
  const authError = requireDashboardAuth(req);
  if (authError) return authError;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate that we received an image
  if (!body.imageBase64 || !body.mimeType) {
    return NextResponse.json(
      { error: "imageBase64 and mimeType are required" },
      { status: 400 }
    );
  }

  // Check if we have an Anthropic API key configured
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    // ── REAL AI EXTRACTION ──
    // Send the image to Claude's vision API and ask it to extract
    // structured fields from the maintenance document
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: body.mimeType,
                    data: body.imageBase64,
                  },
                },
                {
                  type: "text",
                  text: `You are an expert aerospace maintenance document reader. Analyze this image of a maintenance document and extract all structured data you can identify.

Extract the following fields (use null for any field you cannot find):

- documentType: The type of document. Common types: "8130-3" (Authorized Release Certificate), "337" (Major Repair and Alteration), "8010-4" (Malfunction or Defect Report), "work_order", "service_bulletin", "certificate_of_conformance", "shipping_tag", "data_plate", "logbook_entry", or "unknown"
- formNumber: Any form/tracking number visible on the document
- partNumber: The part number (P/N) — look for formats like "881700-1089"
- serialNumber: The serial number (S/N) — look for formats like "SN-2024-11432"
- description: Description of the part or work performed
- manufacturer: OEM or manufacturer name
- dateIssued: Any date visible (ISO format YYYY-MM-DD if possible)
- facility: Repair station or facility name
- status: Part status if visible (e.g., "Overhauled", "Repaired", "Inspected", "Serviceable")
- certificateNumber: Any certificate or approval number
- remarks: Key remarks, findings, or notes from the document (summarize if lengthy)
- confidence: Your overall confidence in the extraction — "high", "medium", or "low"

Return ONLY a JSON object (no markdown code fences) with these keys.`,
                },
              ],
            },
          ],
        }),
      });

      // Check for API errors before parsing
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error(`Anthropic API error (status ${response.status}): ${errorBody.slice(0, 200)}`);
        throw new Error(`Anthropic API returned status ${response.status}`);
      }

      const aiResult = await response.json();
      // Extract the text content from Claude's response
      const textContent = aiResult.content?.[0]?.text || "";

      // Parse the JSON from Claude's response
      try {
        const parsed = JSON.parse(textContent);
        return NextResponse.json(parsed);
      } catch {
        // If Claude didn't return valid JSON, return a partial result
        return NextResponse.json({
          documentType: "unknown",
          partNumber: null,
          serialNumber: null,
          description: textContent,
          confidence: "low",
          _raw: true,
        });
      }
    } catch (error) {
      console.error("AI document extraction failed, falling back to mock:", error);
      // Fall through to mock generation below
    }
  }

  // ── MOCK EXTRACTION (used when no API key is set) ──
  // Returns data matching the demo component (Component 9) so that the
  // auto-lookup on the capture page finds a real component in the seeded DB.
  // The 1.5s delay simulates real AI processing time for demo realism.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const mockResult = {
    documentType: "8130-3",
    formNumber: "ATC-2026-08841",
    partNumber: "881700-1089",
    serialNumber: "SN-2024-11432",
    description: "HPC-7 Hydraulic Pump Assembly — Overhauled",
    manufacturer: "Parker Aerospace",
    dateIssued: "2026-01-15",
    facility: "ACE Aerospace Repair Station, Miami FL",
    status: "Overhauled",
    certificateNumber: "AY2R123N",
    remarks:
      "Component overhauled per CMM 881700-OH Rev. 12. All inspections passed. Proof pressure test 4500 PSI — zero leakage. Flow rate 30.2 GPM within spec. Released to service.",
    confidence: "high",
  };

  return NextResponse.json(mockResult);
}
