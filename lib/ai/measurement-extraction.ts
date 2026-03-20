// Extract measurements from audio transcripts using AI
// Parses spoken measurement callouts like "torque reading 45 foot-pounds"
// into structured measurement data for the ledger.
// Routes to the correct provider (OpenAI, Anthropic, Gemini) based on model config.

import { GENERATION_MODELS } from "./models";
import { callWithFallback, callOpenAI, callAnthropic, callGemini } from "./provider";
import { formatOrgInstructions } from "./org-context";
import { getReferenceDataForPart, formatReferenceDataForPrompt } from "@/lib/reference-data";
import { prisma } from "@/lib/db";
import type { SpecItem } from "@/lib/measurement-ledger";

// ── Document context cache (per session, avoids repeated DB queries) ──
const contextCache = new Map<string, { context: string; loadedAt: number }>();
const CONTEXT_CACHE_TTL = 60_000; // 60 seconds

// Load document context for a session — includes target form fields,
// measurement specs, and reference data when available.
// This tells the extraction AI what measurements to expect.
export async function getExtractionContext(sessionId: string): Promise<string> {
  // Check cache first
  const cached = contextCache.get(sessionId);
  if (cached && Date.now() - cached.loadedAt < CONTEXT_CACHE_TTL) {
    return cached.context;
  }

  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      targetFormType: true,
      orgDocumentId: true,
      componentId: true,
      component: {
        select: { partNumber: true, description: true },
      },
    },
  });

  if (!session) return "";

  const sections: string[] = [];

  // 1. Load measurement specs for the part number (most specific context)
  if (session.component?.partNumber) {
    const specs = await prisma.measurementSpec.findMany({
      where: {
        componentPartNumber: session.component.partNumber,
        status: "active",
      },
      select: { name: true, specItemsJson: true },
    });

    if (specs.length > 0) {
      const specLines: string[] = [];
      for (const spec of specs) {
        try {
          const items = JSON.parse(spec.specItemsJson) as SpecItem[];
          for (const item of items) {
            let line = `- ${item.parameterName} (${item.measurementType}, ${item.unit})`;
            if (item.nominalValue != null) line += ` — nominal: ${item.nominalValue}`;
            if (item.toleranceLow != null || item.toleranceHigh != null) {
              line += ` [${item.toleranceLow ?? "—"} to ${item.toleranceHigh ?? "—"}]`;
            }
            specLines.push(line);
          }
        } catch { /* skip malformed JSON */ }
      }
      if (specLines.length > 0) {
        sections.push(`EXPECTED MEASUREMENTS (from measurement specs for P/N ${session.component.partNumber}):\n${specLines.join("\n")}`);
      }
    }

    // 2. Load reference data (limits, specifications) for the part
    const refEntries = await getReferenceDataForPart(session.component.partNumber);
    const limitEntries = refEntries.filter(
      (e) => e.category === "limit" || e.category === "specification"
    );
    if (limitEntries.length > 0) {
      sections.push(formatReferenceDataForPrompt(limitEntries));
    }
  }

  // 3. Load org document structure if one was selected
  if (session.orgDocumentId) {
    const orgDoc = await prisma.orgDocument.findUnique({
      where: { id: session.orgDocumentId },
      select: { rawStructure: true, name: true },
    });
    if (orgDoc?.rawStructure) {
      sections.push(`TARGET DOCUMENT STRUCTURE (${orgDoc.name}):\n${orgDoc.rawStructure}`);
    }
  }

  // 4. Add component description for general context
  if (session.component?.description) {
    sections.push(`COMPONENT: ${session.component.description} (P/N: ${session.component.partNumber})`);
  }

  const context = sections.join("\n\n");

  // Cache the result
  contextCache.set(sessionId, { context, loadedAt: Date.now() });

  return context;
}

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
- value: numeric value (ALWAYS use decimal point, NEVER commas — e.g., 4.023 not 4,023)
- unit: standardized unit (ft-lbs, in-lbs, N-m, inches, mm, mils, psi, degF, degC, ohms, rpm)
- confidence: 0-1 how certain you are
- rawExcerpt: the exact words from the transcript
- timestampInChunk: approximate seconds into the audio (if determinable from word timings)

Only extract actual measurements with numeric values. Ignore general discussion.
Return {"measurements": []} if no measurements found.

CROSS-CHUNK CONTEXT: If "Previous audio context" is provided, it contains the full prior
transcript from earlier in the same recording session (up to ~2000 words). Use it ONLY to
understand measurement labels or context that may have started in an earlier audio chunk.
For example, if the previous context ends with "a depth of" and the current transcript starts
with "9.9 mm", the measurement is "Depth: 9.9 mm". Do NOT re-extract measurements that
already appear in the previous context — only extract measurements from the CURRENT transcript.

EXPECTED MEASUREMENTS: When "Document context" is provided, it lists the measurements and
form fields that this inspection session is expected to produce. Use this to:
1. Match spoken values to the CORRECT expected parameter name when possible
   (e.g., if expected list includes "First stage blade tip dimension" and the speaker says
   "blade tip is 79.4", use the exact expected name, not a generic one)
2. Set higher confidence when a measurement matches an expected parameter
3. Still capture measurements NOT in the expected list — just prefer expected names when they fit
4. If you cannot determine a specific parameter name, use a descriptive name rather than
   "Unspecified dimension" — describe what the speaker was measuring based on context

COMPOUND MEASUREMENTS: When a measurement is expressed as an arithmetic expression
(e.g., "147 plus 127.9", "3 and a half inches", "12 + 8.5 mm"), extract it as:
- value: the computed result (e.g., 147 + 127.9 = 274.9)
- rawExcerpt: preserve the original spoken expression
If the expression cannot be computed, extract the individual values as separate measurements
with the same parameterName and a suffix like "(segment 1)", "(segment 2)".`;

// Extract measurement callouts from a transcript
// previousContext: full prior transcript from this session (up to ~2000 words),
// so the AI can resolve labels that were split across chunk boundaries.
// documentContext: expected measurements/form fields from the target document.
export async function extractMeasurementsFromTranscript(
  transcript: string,
  words: Array<{ word: string; start: number; end: number }>,
  previousContext?: string,
  orgInstructions?: string | null,
  documentContext?: string
): Promise<ExtractedMeasurement[]> {
  if (!transcript || transcript.trim().length < 10) return [];

  // Build the system prompt with optional org-specific instructions
  const systemPrompt = SYSTEM_PROMPT + formatOrgInstructions(orgInstructions);

  // Build the user message with all available context
  let userMessage = '';
  if (previousContext) {
    userMessage += `Previous audio context (for continuity — DO NOT re-extract measurements from this, only use it to understand labels/context for the CURRENT transcript): "...${previousContext}"\n\n`;
  }
  if (documentContext) {
    userMessage += `Document context (expected measurements/form fields for this inspection):\n${documentContext}\n\n`;
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
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            jsonMode: true,
          });
          break;

        case "anthropic":
          response = await callAnthropic({
            model: model.id,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          });
          break;

        case "google":
          response = await callGemini({
            model: model.id,
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
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
