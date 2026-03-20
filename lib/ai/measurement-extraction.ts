// Extract measurements from audio transcripts using AI
// Parses spoken measurement callouts like "torque reading 45 foot-pounds"
// into structured measurement data for the ledger.
// Routes to the correct provider (OpenAI, Anthropic, Gemini) based on model config.

import { GENERATION_MODELS } from "./models";
import { callWithFallback, callOpenAI, callAnthropic, callGemini } from "./provider";
import { prisma } from "@/lib/db";

export interface ExtractedMeasurement {
  parameterName: string;
  measurementType: string;
  value: number;
  unit: string;
  confidence: number;
  rawExcerpt: string;
  timestampInChunk?: number; // Seconds into this audio chunk
}

const SYSTEM_PROMPT = `You extract measurement data from aerospace maintenance audio transcripts.

Return a JSON object with a "measurements" array. Each measurement needs:
- parameterName: descriptive name (e.g., "Engine mount bolt torque")
- measurementType: one of: torque, dimension, pressure, temperature, clearance, runout, endplay, backlash, weight, rpm, resistance
- value: numeric value
- unit: standardized unit (ft-lbs, in-lbs, N-m, inches, mm, mils, psi, degF, degC, ohms, rpm)
- confidence: 0-1 how certain you are
- rawExcerpt: the exact words from the transcript
- timestampInChunk: approximate seconds into the audio (if determinable from word timings)

Only extract actual measurements with numeric values. Ignore general discussion.
Return {"measurements": []} if no measurements found.

CROSS-CHUNK CONTEXT: If "Previous audio context" is provided, it contains up to 200 words
from earlier in the same recording session. Use it ONLY to understand measurement labels or
context that may have started in an earlier audio chunk. For example, if the previous context
ends with "a depth of" and the current transcript starts with "9.9 mm", the measurement is
"Depth: 9.9 mm". Do NOT re-extract measurements that already appear in the previous context
— only extract measurements from the CURRENT transcript.

COMPOUND MEASUREMENTS: When a measurement is expressed as an arithmetic expression
(e.g., "147 plus 127.9", "3 and a half inches", "12 + 8.5 mm"), extract it as:
- value: the computed result (e.g., 147 + 127.9 = 274.9)
- rawExcerpt: preserve the original spoken expression
If the expression cannot be computed, extract the individual values as separate measurements
with the same parameterName and a suffix like "(segment 1)", "(segment 2)".`;

// Extract measurement callouts from a transcript
// previousContext: up to ~200 words from all prior chunks in this session,
// so the AI can resolve labels that were split across chunk boundaries.
export async function extractMeasurementsFromTranscript(
  transcript: string,
  words: Array<{ word: string; start: number; end: number }>,
  previousContext?: string
): Promise<ExtractedMeasurement[]> {
  if (!transcript || transcript.trim().length < 10) return [];

  // Build the user message, optionally including prior context for cross-chunk continuity
  let userMessage = '';
  if (previousContext) {
    userMessage += `Previous audio context (for continuity — DO NOT re-extract measurements from this, only use it to understand labels/context for the CURRENT transcript): "...${previousContext}"\n\n`;
  }
  userMessage += `Current transcript: "${transcript}"\n\nWord timings: ${JSON.stringify(words.slice(0, 200))}`;

  const result = await callWithFallback({
    models: GENERATION_MODELS,
    timeoutMs: 15000,
    taskName: "measurement_extraction",
    execute: async (model) => {
      let response: string;

      // Route to the correct provider based on model config
      switch (model.provider) {
        case "openai":
          response = await callOpenAI({
            model: model.id,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
            jsonMode: true,
          });
          break;

        case "anthropic":
          response = await callAnthropic({
            model: model.id,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
          });
          break;

        case "google":
          response = await callGemini({
            model: model.id,
            contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          });
          break;

        default:
          throw new Error(`Unsupported provider: ${model.provider}`);
      }

      // Parse the JSON response
      const parsed = typeof response === "string" ? JSON.parse(response) : response;
      const measurements = Array.isArray(parsed) ? parsed : parsed.measurements || [];
      return measurements as ExtractedMeasurement[];
    },
  });

  return result.data;
}

// Session-level measurement reconciliation — runs on the full stitched transcript
// after capture ends. Catches measurements that were missed or mislabeled during
// chunk-by-chunk extraction (e.g., "Unknown parameter" when context was split).
export async function reconcileSessionMeasurements(
  sessionId: string,
  fullTranscript: string
): Promise<{ added: number; renamed: number; skipped: number }> {
  const stats = { added: 0, renamed: 0, skipped: 0 };

  if (!fullTranscript || fullTranscript.trim().length < 10) return stats;

  // Strip timestamp markers like [00:00] that were added during stitching
  const cleanTranscript = fullTranscript.replace(/\[\d{2}:\d{2}\]\s*/g, "");

  // Run measurement extraction on the full transcript (no chunk boundaries)
  const extracted = await extractMeasurementsFromTranscript(cleanTranscript, []);

  if (extracted.length === 0) return stats;

  // Fetch existing measurements for this session
  const existing = await prisma.measurement.findMany({
    where: { captureSessionId: sessionId },
    select: {
      id: true,
      parameterName: true,
      measurementType: true,
      value: true,
      unit: true,
    },
  });

  for (const ext of extracted) {
    // Check if this measurement already exists (same type + value within 5%)
    const match = existing.find((m) => {
      const sameType = m.measurementType === ext.measurementType;
      const valueDiff = Math.abs(m.value - ext.value);
      const valueClose = valueDiff < 0.005 || (Math.abs(m.value) > 0.01 && valueDiff / Math.abs(m.value) < 0.05);
      return sameType && valueClose;
    });

    if (match) {
      // If the existing measurement has a generic name but the full-transcript
      // extraction found a real name, update it
      const isGenericName = /unknown|unspecified|parameter/i.test(match.parameterName);
      const hasRealName = !/unknown|unspecified|parameter/i.test(ext.parameterName);

      if (isGenericName && hasRealName) {
        await prisma.measurement.update({
          where: { id: match.id },
          data: { parameterName: ext.parameterName },
        });
        stats.renamed++;
      } else {
        stats.skipped++;
      }
    } else {
      // Entirely new measurement missed by chunk-level extraction — add it
      const lastMeasurement = await prisma.measurement.findFirst({
        where: { captureSessionId: sessionId },
        orderBy: { sequenceInShift: "desc" },
        select: { sequenceInShift: true },
      });
      const nextSequence = (lastMeasurement?.sequenceInShift ?? 0) + 1;

      await prisma.measurement.create({
        data: {
          captureSessionId: sessionId,
          measurementType: ext.measurementType,
          parameterName: ext.parameterName,
          value: ext.value,
          unit: ext.unit,
          confidence: ext.confidence,
          corroborationLevel: "single",
          status: "pending",
          sequenceInShift: nextSequence,
          measuredAt: new Date(),
          sources: {
            create: {
              sourceType: "audio_callout",
              value: ext.value,
              unit: ext.unit,
              confidence: ext.confidence,
              rawExcerpt: ext.rawExcerpt || null,
            },
          },
        },
      });
      stats.added++;
    }
  }

  console.log(
    `[Reconciliation] session=${sessionId}: added=${stats.added}, renamed=${stats.renamed}, skipped=${stats.skipped}`
  );
  return stats;
}
