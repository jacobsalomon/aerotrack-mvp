// POST /api/mobile/analyze-image — Send a photo to AI vision for OCR / data plate reading
// Uses OpenAI API directly (GPT-4o by default) to extract text from images
// Returns extracted part numbers, serial numbers, and all visible text
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

// Which model to use for vision — configurable via env var
// Defaults to GPT-4o for best-in-class data plate OCR accuracy
const VISION_MODEL = process.env.VISION_MODEL || "gpt-4o";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { evidenceId, imageBase64, sessionId } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Call OpenAI vision API directly for best data plate OCR accuracy
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [
            {
              role: "system",
              content: `You are an aerospace parts identification and OCR expert. Your primary job is reading data plates, stamped engravings, faded labels, and etched text on aircraft components — even when photographed at angles, in poor lighting, or partially obscured.

CRITICAL OCR GUIDANCE FOR AEROSPACE PARTS:
- Data plates are often stamped metal — look for embossed/debossed characters with shadows
- Part numbers frequently use dashes and mixed alphanumeric formats (e.g., 881700-1089, 5052-A123-B)
- Serial numbers may be stamped, engraved, or printed with prefixes like S/N, SN, SER NO
- Manufacturer names may be abbreviated or use logos (e.g., "HAM STD" = Hamilton Standard)
- Look for small text around edges of data plates — regulatory markings hide there
- FAA/PMA/TSO/STC markings are often tiny but legally critical
- Date codes may be in various formats: MM/YY, YYYY-MM, lot codes
- Torque values and measurement markings may appear on tools or callout tags
- Multiple data plates can appear on the same component — read ALL of them

EXTRACT:
- Part numbers (P/N) — be exact, every character matters
- Serial numbers (S/N) — include full string with any prefixes
- Manufacturer names
- Model or description of the component
- Regulatory markings (FAA, EASA, TSO, PMA, STC)
- Date codes or manufacturing dates
- Torque values, measurement readings, or specification callouts
- Work order or job card numbers if visible
- Any other text visible on data plates, labels, engravings, or tags

Return your response as JSON with this exact structure:
{
  "partNumber": "string or null",
  "serialNumber": "string or null",
  "description": "string or null - what this part appears to be",
  "manufacturer": "string or null",
  "allText": ["array", "of", "all", "text", "found"],
  "confidence": 0.0 to 1.0,
  "notes": "any additional observations about the image"
}

If characters are ambiguous (0 vs O, 1 vs I, 5 vs S), note the ambiguity and give your best reading.
If you can't read a value clearly, set confidence lower and mention it in notes.
Be precise — these values go directly into FAA compliance documents.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analyze this image from an aircraft maintenance workbench. Extract all part identification information, focusing on data plates, stampings, and labels.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageBase64.startsWith("data:")
                      ? imageBase64
                      : `data:image/jpeg;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1000,
          temperature: 0.1,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI vision error:", response.status, errorText);
      return NextResponse.json(
        { success: false, error: "AI vision analysis failed" },
        { status: 502 }
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "No response from AI model" },
        { status: 502 }
      );
    }

    // Parse the AI response
    let extraction;
    try {
      extraction = JSON.parse(content);
    } catch {
      // Model returned text instead of JSON — wrap it
      extraction = {
        partNumber: null,
        serialNumber: null,
        description: null,
        manufacturer: null,
        allText: [content],
        confidence: 0.3,
        notes: "Model returned non-JSON response",
        rawResponse: content,
      };
    }

    // If we have an evidenceId, update the evidence record with the extraction
    if (evidenceId) {
      await prisma.captureEvidence.update({
        where: { id: evidenceId },
        data: { aiExtraction: JSON.stringify(extraction) },
      });
    }

    // Try to match a component in our database by part number or serial number
    let componentMatch = null;
    if (extraction.partNumber || extraction.serialNumber) {
      const matchConditions = [];
      if (extraction.serialNumber) {
        matchConditions.push({ serialNumber: extraction.serialNumber });
      }
      if (extraction.partNumber) {
        matchConditions.push({ partNumber: extraction.partNumber });
      }

      const component = await prisma.component.findFirst({
        where: { OR: matchConditions },
        select: {
          id: true,
          partNumber: true,
          serialNumber: true,
          description: true,
        },
      });

      if (component) {
        componentMatch = component;

        // If we have a sessionId, auto-link the component to the session
        if (sessionId) {
          await prisma.captureSession.update({
            where: { id: sessionId },
            data: { componentId: component.id },
          });
        }
      }
    }

    // Log the analysis
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "image_analyzed",
        entityType: "CaptureEvidence",
        entityId: evidenceId || null,
        metadata: JSON.stringify({
          model: VISION_MODEL,
          partNumber: extraction.partNumber,
          serialNumber: extraction.serialNumber,
          confidence: extraction.confidence,
          componentMatched: !!componentMatch,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        extraction,
        componentMatch,
      },
    });
  } catch (error) {
    console.error("Analyze image error:", error);
    return NextResponse.json(
      { success: false, error: "Image analysis failed" },
      { status: 500 }
    );
  }
}
