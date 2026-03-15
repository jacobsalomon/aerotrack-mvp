// Extract measurements from audio transcripts using AI
// Parses spoken measurement callouts like "torque reading 45 foot-pounds"
// into structured measurement data for the ledger.
// Routes to the correct provider (OpenAI, Anthropic, Gemini) based on model config.

import { GENERATION_MODELS } from "./models";
import { callWithFallback, callOpenAI, callAnthropic, callGemini } from "./provider";

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
Return {"measurements": []} if no measurements found.`;

// Extract measurement callouts from a transcript
export async function extractMeasurementsFromTranscript(
  transcript: string,
  words: Array<{ word: string; start: number; end: number }>
): Promise<ExtractedMeasurement[]> {
  if (!transcript || transcript.trim().length < 10) return [];

  const userMessage = `Transcript: "${transcript}"\n\nWord timings: ${JSON.stringify(words.slice(0, 200))}`;

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
