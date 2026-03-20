// LLM post-processing for transcript segments
// Strips filler words, formats measurements, fixes part numbers
// Runs after ElevenLabs transcription, before measurement extraction

import { CORRECTION_MODELS } from "./models";
import { callWithFallback, callOpenAI, callAnthropic, callOpenRouter } from "./provider";
import { AEROSPACE_VOCABULARY_PROMPT } from "./openai";
import { formatOrgInstructions } from "./org-context";

const CORRECTION_SYSTEM_PROMPT_BASE = `You are an aerospace maintenance transcript corrector. Your job is to clean up speech-to-text output WITHOUT changing the meaning.

RULES:
1. STRIP filler words: "uh", "um", "yeah" (when filler), "so" (when filler), "like" (when filler), "you know", "I mean", "basically", "actually" (when filler)
2. FORMAT measurements as numbers with units:
   - "forty five foot pounds" → "45 ft-lbs"
   - "one fourteen point five millimeters" → "114.5 mm"
   - "three thousandths" → "0.003 in"
   - "twenty five hundred psi" → "2500 psi"
   - "point zero zero five inches" → "0.005 in"
   - "inch pounds" → "in-lbs", "foot pounds" → "ft-lbs", "Newton meters" → "N-m"
3. DECIMAL FORMATTING (CRITICAL — aerospace measurements use decimal points, NEVER commas):
   - ALWAYS use a period (.) as the decimal separator, NEVER a comma
   - "four point zero two three" → "4.023" (NOT "4,023")
   - "fifteen point four nine nine" → "15.499" (NOT "15,499")
   - "one point seven five zero two" → "1.7502" (NOT "1,7502")
   - "zero point zero zero one four" → "0.0014" (NOT "0,0014")
   - When digits are spoken after "point", they are ALWAYS decimals: "four zero two three" after "point" = ".0023"
   - When a number sounds like it could be thousands (e.g., "fifteen four ninety nine"), check context:
     if it's a measurement (diameter, depth, clearance, etc.), it's almost certainly a decimal (15.499)
   - Numbers like "four thousand twenty three" ARE thousands (4023), but "four point zero two three" is a decimal (4.023)
4. FIX part number patterns — spoken digits become formatted:
   - "eight eight one seven hundred dash one oh eight nine" → "881700-1089"
   - "five oh five two dash A one two three" → "5052-A123"
   - "serial number sierra november dash two zero two four" → "S/N SN-2024"
5. FIX aviation abbreviations: "P N" → "P/N", "S N" → "S/N"
6. PRESERVE all technical content — never add or remove factual information
7. PRESERVE the speaker's intent and meaning exactly
8. Keep it natural — this is spoken maintenance notes, not a formal document

AEROSPACE VOCABULARY FOR CONTEXT:
${AEROSPACE_VOCABULARY_PROMPT}`;

// Build the full system prompt, optionally including org-specific instructions
function buildCorrectionPrompt(orgInstructions?: string | null): string {
  const orgBlock = formatOrgInstructions(orgInstructions);
  return CORRECTION_SYSTEM_PROMPT_BASE + orgBlock + "\n\nReturn ONLY the corrected text. No explanations, no JSON wrapping.";
}

// Correct a single transcript segment using a lightweight LLM
export async function correctTranscriptSegment(text: string, orgInstructions?: string | null): Promise<string> {
  // Skip correction for very short or empty text
  if (!text || text.trim().length < 5) return text;

  const result = await callWithFallback({
    models: CORRECTION_MODELS,
    timeoutMs: 10000,
    taskName: "transcript_correction",
    // If correction fails entirely, return the original text (never lose data)
    cachedFallback: text,
    execute: async (model) => {
      let corrected: string;
      const systemPrompt = buildCorrectionPrompt(orgInstructions);

      switch (model.provider) {
        case "openai":
          corrected = await callOpenAI({
            model: model.id,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text },
            ],
            maxTokens: 1000,
            timeoutMs: 10000,
          });
          break;

        case "anthropic":
          corrected = await callAnthropic({
            model: model.id,
            system: systemPrompt,
            messages: [{ role: "user", content: text }],
            maxTokens: 1000,
            timeoutMs: 10000,
          });
          break;

        case "openrouter":
          corrected = await callOpenRouter({
            model: model.id,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text },
            ],
            maxTokens: 1000,
            timeoutMs: 10000,
          });
          break;

        default:
          throw new Error(`Unsupported provider for correction: ${model.provider}`);
      }

      // Safety check: if the LLM returned empty or much shorter text, keep original
      const trimmed = corrected.trim();
      if (!trimmed || trimmed.length < text.trim().length * 0.3) {
        console.warn("[Correction] LLM returned suspiciously short output, keeping original");
        return text;
      }

      return trimmed;
    },
  });

  return result.data;
}
