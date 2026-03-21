// Pass 2: Deep extraction of specs, tools, and checks from each sub-assembly section.
// Processes one section at a time (1-3 pages) with Gemini 2.5 Pro for max accuracy.
// Falls back to GPT-5.4 and Claude Sonnet 4.6 if Gemini fails.

import { prisma } from "@/lib/db";
import { extractPdfPages } from "@/lib/pdf-utils";
import { callWithFallback } from "./provider";
import { CMM_EXTRACTION_MODELS } from "./models";
import { PASS2_EXTRACTION_PROMPT } from "./cmm-prompts";
import {
  validateExtractionResults,
  type ExtractedItem,
} from "./cmm-validation";
import { callGemini } from "./provider";
import { getApiKey, getApiBase } from "./models";

// The structure Gemini returns for a section
interface ExtractionResponse {
  items: ExtractedItem[];
  sectionConfidence: number;
  extractionNotes: string;
}

/**
 * Extract specs from a single section. Returns the number of items created.
 */
export async function extractSection(
  templateId: string,
  sectionId: string
): Promise<number> {
  // Load the section and template
  const section = await prisma.inspectionSection.findUniqueOrThrow({
    where: { id: sectionId },
    include: { template: true },
  });

  // Update section status
  await prisma.inspectionSection.update({
    where: { id: sectionId },
    data: { status: "extracting" },
  });

  try {
    // Download the PDF
    const pdfResponse = await fetch(section.template.sourceFileUrl);
    if (!pdfResponse.ok) throw new Error("Failed to download PDF");
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());

    // Extract the relevant pages for this section
    const sectionPdfBuffer = await extractPdfPages(
      pdfBytes,
      section.pageNumbers
    );
    const sectionPdfBase64 = sectionPdfBuffer.toString("base64");

    // Build the prompt with section context
    const prompt = PASS2_EXTRACTION_PROMPT
      .replace("{figureNumber}", section.figureNumber)
      .replace("{sectionTitle}", section.title)
      .replace(
        "{partNumbers}",
        section.template.partNumbersCovered.join(", ") || "not specified"
      );

    // Call AI with fallback chain
    const result = await callWithFallback<ExtractionResponse>({
      models: CMM_EXTRACTION_MODELS,
      timeoutMs: 120000,
      taskName: `cmm_extraction_fig${section.figureNumber}`,
      execute: async (model) => {
        let responseText: string;

        if (model.provider === "google") {
          // Use Gemini directly (supports PDF inline data)
          responseText = await callGemini({
            model: model.id,
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: "application/pdf",
                      data: sectionPdfBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
            timeoutMs: 110000,
          });
        } else if (model.provider === "openai") {
          // OpenAI — send PDF as base64 image (they accept PDFs in image URLs)
          const apiKey = getApiKey("openai");
          const apiBase = getApiBase("openai");
          const response = await fetch(`${apiBase}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(110000),
            body: JSON.stringify({
              model: model.id,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:application/pdf;base64,${sectionPdfBase64}`,
                      },
                    },
                  ],
                },
              ],
              temperature: 0.1,
            }),
          });
          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 200)}`);
          }
          const data = await response.json();
          responseText = data.choices?.[0]?.message?.content || "";
        } else if (model.provider === "anthropic") {
          // Anthropic — send as document
          const apiKey = getApiKey("anthropic");
          const apiBase = getApiBase("anthropic");
          const response = await fetch(`${apiBase}/messages`, {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
              "anthropic-version": "2023-06-01",
            },
            signal: AbortSignal.timeout(110000),
            body: JSON.stringify({
              model: model.id,
              max_tokens: 8192,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "document",
                      source: {
                        type: "base64",
                        media_type: "application/pdf",
                        data: sectionPdfBase64,
                      },
                    },
                    { type: "text", text: prompt },
                  ],
                },
              ],
              temperature: 0.1,
            }),
          });
          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
          }
          const data = await response.json();
          responseText = data.content?.[0]?.text || "";
        } else {
          throw new Error(`Unsupported provider: ${model.provider}`);
        }

        // Parse the JSON response
        const parsed = JSON.parse(responseText) as ExtractionResponse;
        if (!parsed.items || !Array.isArray(parsed.items)) {
          throw new Error("Response missing items array");
        }
        return parsed;
      },
    });

    const extraction = result.data;

    // Run structural validation on all items
    const { validatedItems, sectionConfidence } = validateExtractionResults(
      extraction.items
    );

    // Save items to database
    let sortOrder = 0;
    for (const { item, adjustedConfidence } of validatedItems) {
      await prisma.inspectionItem.create({
        data: {
          sectionId,
          itemType: item.itemType,
          itemCallout: item.itemCallout || null,
          partNumber: item.partNumber || null,
          parameterName: item.parameterName,
          specification: item.specification,
          specValueLow: item.specValueLow ?? null,
          specValueHigh: item.specValueHigh ?? null,
          specUnit: item.specUnit || null,
          specValueLowMetric: item.specValueLowMetric ?? null,
          specValueHighMetric: item.specValueHighMetric ?? null,
          specUnitMetric: item.specUnitMetric || null,
          toolsRequired: item.toolsRequired || [],
          checkReference: item.checkReference || null,
          repairReference: item.repairReference || null,
          specialAssemblyRef: item.specialAssemblyRef || null,
          configurationApplicability: item.configurationApplicability || [],
          notes: item.notes || null,
          sortOrder: sortOrder++,
          confidence: adjustedConfidence,
        },
      });
    }

    // Update section with results
    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: {
        status: "extracted",
        itemCount: validatedItems.length,
        extractionConfidence: sectionConfidence,
        rawExtractionResponse: JSON.parse(JSON.stringify({
          modelUsed: result.modelUsed.displayName,
          fallbackLevel: result.fallbackLevel,
          latencyMs: result.latencyMs,
          extractionNotes: extraction.extractionNotes,
          rawItems: extraction.items,
        })),
      },
    });

    console.log(
      `[CMM Pass 2] Fig. ${section.figureNumber}: ${validatedItems.length} items extracted ` +
        `(confidence: ${sectionConfidence.toFixed(2)}, model: ${result.modelUsed.displayName})`
    );

    return validatedItems.length;
  } catch (error) {
    console.error(
      `[CMM Pass 2] Failed to extract Fig. ${section.figureNumber}:`,
      error
    );

    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: {
        status: "failed",
        rawExtractionResponse: JSON.parse(JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
          failedAt: new Date().toISOString(),
        })),
      },
    });

    return 0;
  }
}
