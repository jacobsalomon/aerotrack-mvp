// AI vision analysis to match a glasses photo to an inspection item.
// Uses vision-capable models to analyze what's in the photo and determine
// which checklist item it belongs to.

import { OCR_MODELS } from "./models";
import { callWithFallback, callOpenAI } from "./provider";
import type { ModelConfig } from "./models";

export interface PhotoMatchResult {
  inspectionItemId: string | null;
  confidence: number;
  reasoning: string;
}

interface InspectionItemInfo {
  id: string;
  parameterName: string;
  itemCallout: string | null;
  itemType: string;
  sectionTitle: string;
}

// Match a photo to an inspection item using AI vision analysis
export async function matchPhotoToItem(
  imageUrl: string,
  items: InspectionItemInfo[]
): Promise<PhotoMatchResult> {
  if (items.length === 0) {
    return { inspectionItemId: null, confidence: 0, reasoning: "No inspection items available" };
  }

  // Download image and convert to base64 for vision API
  let imageBase64: string;
  let mimeType = "image/jpeg";
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const contentType = response.headers.get("content-type");
    if (contentType) mimeType = contentType;
    const buffer = Buffer.from(await response.arrayBuffer());
    imageBase64 = buffer.toString("base64");
  } catch (err) {
    console.error("[PhotoMatch] Failed to download image:", err);
    return { inspectionItemId: null, confidence: 0, reasoning: "Failed to download image" };
  }

  const itemList = items
    .map((item) => `- ID: ${item.id} | ${item.itemCallout ? `#${item.itemCallout}` : "no callout"} | ${item.parameterName} (${item.itemType}) — ${item.sectionTitle}`)
    .join("\n");

  const systemPrompt = `You match aircraft maintenance inspection photos to inspection checklist items.

Given a photo taken during maintenance and a list of inspection items, determine which item the photo is documenting.

Consider:
- What component, surface, or measurement is visible in the photo
- Whether callout numbers or labels are visible
- The type of inspection shown (visual check, measurement, tool application)
- General context clues (part orientation, surrounding components)

Return JSON: { "inspectionItemId": "..." or null, "confidence": 0.0-1.0, "reasoning": "brief explanation" }

If the photo clearly matches an item, return that item's ID with high confidence.
If the photo could match multiple items, return the best match with medium confidence.
If the photo doesn't clearly relate to any item, return null with low confidence.`;

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  try {
    const result = await callWithFallback({
      models: OCR_MODELS, // GPT-5.4 → Gemini 2.5 Flash → Claude (all support images)
      timeoutMs: 15000,
      taskName: "photo_item_match",
      execute: async (model) => {
        const text = await callModelForPhotoMatch(model, systemPrompt, itemList, dataUrl);
        return JSON.parse(text) as PhotoMatchResult;
      },
    });

    // Validate the returned itemId exists in our list
    const match = result.data;
    if (match.inspectionItemId && !items.some((i) => i.id === match.inspectionItemId)) {
      console.warn(`[PhotoMatch] AI returned unknown itemId: ${match.inspectionItemId}`);
      return { inspectionItemId: null, confidence: 0, reasoning: "AI returned invalid item ID" };
    }

    return match;
  } catch (err) {
    console.error("[PhotoMatch] AI matching failed:", err);
    return { inspectionItemId: null, confidence: 0, reasoning: "AI matching failed" };
  }
}

async function callModelForPhotoMatch(
  model: ModelConfig,
  systemPrompt: string,
  itemList: string,
  imageDataUrl: string
): Promise<string> {
  const userContent = `INSPECTION ITEMS:\n${itemList}\n\nMatch the photo below to the most relevant inspection item.`;

  // Use OpenAI-compatible API for all vision providers (GPT-5.4, Gemini via Google, OpenRouter)
  // callOpenAI handles multimodal content with image_url
  return callOpenAI({
    model: model.id,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userContent },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    jsonMode: true,
    maxTokens: 500,
    timeoutMs: 15000,
  });
}
