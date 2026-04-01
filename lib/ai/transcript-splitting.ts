// Transcript splitting — takes a corrected transcript and splits it into
// segments, each associated with a specific inspection item.
// Used when a mechanic talks about multiple items in one audio chunk.

import { prisma } from "@/lib/db";
import { TRANSCRIPT_SPLIT_MODELS } from "./models";
import { callWithFallback, callAnthropic, callOpenAI } from "./provider";
import type { ModelConfig } from "./models";

export interface TranscriptSegment {
  text: string;
  inspectionItemId: string | null; // null = unmatched
  itemCallout: string | null;      // e.g. "#3.2.1" — for client display
  parameterName: string | null;    // e.g. "Bearing clearance" — for client display
}

// Load a compact list of inspection items for the session's template
async function getItemsForSession(sessionId: string): Promise<
  { id: string; callout: string | null; name: string; section: string }[]
> {
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: { inspectionTemplateId: true },
  });
  if (!session?.inspectionTemplateId) return [];

  const sections = await prisma.inspectionSection.findMany({
    where: { templateId: session.inspectionTemplateId },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, itemCallout: true, parameterName: true },
      },
    },
  });

  return sections.flatMap((s) =>
    s.items.map((item) => ({
      id: item.id,
      callout: item.itemCallout,
      name: item.parameterName,
      section: s.title,
    }))
  );
}

// Split a transcript into segments by inspection item using AI
export async function splitTranscriptByItem(
  transcript: string,
  sessionId: string
): Promise<TranscriptSegment[]> {
  if (!transcript.trim()) return [];

  const items = await getItemsForSession(sessionId);
  if (items.length === 0) {
    // No template items — return entire transcript as unmatched
    return [{ text: transcript, inspectionItemId: null, itemCallout: null, parameterName: null }];
  }

  // Build a compact item reference for the prompt
  const itemList = items
    .map((item) => `- ID: ${item.id} | ${item.callout ? `#${item.callout}` : "no callout"} | ${item.name} (${item.section})`)
    .join("\n");

  const systemPrompt = `You split aircraft maintenance transcripts into segments by inspection item.

Given a transcript from a mechanic and a list of inspection items, split the transcript so each segment is associated with the inspection item it's about.

Rules:
- Each segment should contain the mechanic's words about one specific item
- Preserve the exact transcript text — do not rephrase, summarize, or edit
- If a sentence clearly transitions between items, split at the transition point
- If a portion of the transcript doesn't relate to any specific item (general commentary, greetings, etc.), set inspectionItemId to null
- Match based on: item callout numbers mentioned, parameter names, measurement types, part references
- A short transcript about only one item should return a single segment

Return JSON: { "segments": [{ "text": "...", "inspectionItemId": "..." }] }
Each segment's inspectionItemId must be an exact ID from the list, or null if unmatched.`;

  const userMessage = `INSPECTION ITEMS:
${itemList}

TRANSCRIPT TO SPLIT:
"${transcript}"`;

  try {
    const result = await callWithFallback({
      models: TRANSCRIPT_SPLIT_MODELS,
      timeoutMs: 15000,
      taskName: "transcript_split",
      execute: async (model) => {
        const text = await callModelForSplit(model, systemPrompt, userMessage);
        const parsed = JSON.parse(text);
        return parsed.segments as Array<{ text: string; inspectionItemId: string | null }>;
      },
    });

    // Build a quick lookup for item metadata
    const itemMap = new Map(items.map((i) => [i.id, i]));

    return result.data.map((seg) => {
      const item = seg.inspectionItemId ? itemMap.get(seg.inspectionItemId) : null;
      return {
        text: seg.text,
        inspectionItemId: seg.inspectionItemId,
        itemCallout: item?.callout ?? null,
        parameterName: item?.name ?? null,
      };
    });
  } catch (err) {
    console.error("[TranscriptSplit] Failed, returning unsplit transcript:", err);
    // Graceful fallback — return the whole transcript as a single unmatched segment
    return [{ text: transcript, inspectionItemId: null, itemCallout: null, parameterName: null }];
  }
}

async function callModelForSplit(
  model: ModelConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  switch (model.provider) {
    case "anthropic":
      return callAnthropic({
        model: model.id,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 2000,
        timeoutMs: 15000,
      });
    case "openai":
      return callOpenAI({
        model: model.id,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        jsonMode: true,
        maxTokens: 2000,
        timeoutMs: 15000,
      });
    default:
      throw new Error(`Unsupported provider for transcript split: ${model.provider}`);
  }
}
