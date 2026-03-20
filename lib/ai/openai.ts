// OpenAI API client — handles audio transcription and document generation
// Now uses callWithFallback() for automatic model failover
//
// Transcription chain: gpt-4o-transcribe → gpt-4o-mini-transcribe → cached
// Generation chain: GPT-5.4 → Claude Sonnet 4.6 → Gemini 3.1 Pro → cached

import { TRANSCRIPTION_MODELS, OCR_MODELS, GENERATION_MODELS } from "./models";
import { callWithFallback, callOpenAI, callAnthropic, callGemini } from "./provider";
import { formatOrgInstructions } from "./org-context";
import type { ModelConfig } from "./models";

// Aerospace vocabulary prompt — feeds domain-specific terms to the transcription model
// so it correctly recognizes part numbers, abbreviations, and technical terminology.
export const AEROSPACE_VOCABULARY_PROMPT = [
  // Common abbreviations
  "P/N, S/N, NDT, CMM, FAR, AD, SB, STC, PMA, TSO, EASA, MRO, AOG, MEL, IPC, TBO, MTBF",
  // Regulatory and compliance
  "FAA, 8130-3, Form 337, 8010-4, airworthiness, serviceable, unserviceable, BER, beyond economical repair",
  // Maintenance actions
  "torque, torqued, safety wire, safety wired, cotter pin, locknut, overhaul, inspect, NDI, borescope",
  "dimensional check, wear limit, service limit, run-out, backlash, end-play, axial play, radial play",
  // Measurements and units
  "inch-pounds, foot-pounds, Newton-meters, thousandths, mils, microinches, psi, psig",
  // Part number formats
  "881700-1089, 5052-A123, PN dash number, serial number prefix SN",
  // Common manufacturers
  "Honeywell, Pratt Whitney, Collins Aerospace, Safran, Parker Hannifin, Hamilton Sundstrand, Rolls-Royce",
  "Eaton, Moog, Dukes, Crane, Woodward, Curtiss-Wright, Heico, TransDigm",
  // Component types
  "hydraulic pump, fuel control unit, actuator, servo valve, accumulator, heat exchanger, turbine blade",
  "compressor rotor, bearing, seal, gasket, O-ring, bushing, shim, spacer",
].join(". ");

// ──────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  text: string;
  duration: number;
  words: TranscriptionWord[];
  language: string;
  model: string;
}

export interface ProvenanceSource {
  sourceType: "photo" | "video" | "audio" | "cmm" | "ai_inferred";
  excerpt: string;
  confidence: number;
  timestamp?: number;
}

export interface FieldProvenance {
  value: unknown;
  sources: ProvenanceSource[];
  overallConfidence: number;
  corroborationLevel: "single" | "double" | "triple";
}

export interface DocumentGenerationResult {
  documents: Array<{
    documentType: string;
    title: string;
    contentJson: Record<string, unknown>;
    confidence: number;
    lowConfidenceFields: string[];
    reasoning: string;
    provenance?: Record<string, FieldProvenance>;
    // Legacy field — kept for backward compatibility with older cached responses
    evidenceLineage?: Record<string, unknown>;
    discrepancies?: Array<Record<string, unknown>>;
  }>;
  summary: string;
  discrepancies?: Array<Record<string, unknown>>;
}

export interface ImageOcrResult {
  partNumber: string | null;
  serialNumber: string | null;
  description: string | null;
  manufacturer: string | null;
  allText: string[];
  confidence: number;
  notes: string;
  model: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
}

// ──────────────────────────────────────────────────────
// Transcribe audio with automatic fallback chain
// Chain: gpt-4o-transcribe → ElevenLabs Scribe v2 → gpt-4o-mini-transcribe
// Falls back through TRANSCRIPTION_MODELS automatically
// ──────────────────────────────────────────────────────
export async function transcribeAudio(
  audioFile: File | Blob,
  fileName: string,
  previousTranscript?: string,
  orgInstructions?: string | null
): Promise<TranscriptionResult> {
  const result = await callWithFallback({
    models: TRANSCRIPTION_MODELS,
    timeoutMs: 25000,
    taskName: "audio_transcription",
    execute: async (model) => {
      if (model.provider === "elevenlabs") {
        return transcribeWithElevenLabs(audioFile, fileName, model.id);
      }
      return transcribeWithOpenAI(audioFile, fileName, model.id, previousTranscript, orgInstructions);
    },
  });

  return result.data;
}

// OpenAI transcription (gpt-4o-transcribe, gpt-4o-mini-transcribe)
async function transcribeWithOpenAI(
  audioFile: File | Blob,
  fileName: string,
  modelId: string,
  previousTranscript?: string,
  orgInstructions?: string | null
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  // Combine aerospace vocabulary with previous chunk's transcript (for cross-chunk continuity).
  // OpenAI only considers the final ~224 tokens of the prompt field, so vocabulary goes LAST
  // to ensure it's always in the model's attention window. Previous transcript goes first
  // (it's useful context but getting cut off is acceptable).
  // Org-specific instructions go between previous transcript and vocabulary.
  const promptParts: string[] = [];
  if (previousTranscript) promptParts.push(previousTranscript);
  if (orgInstructions) promptParts.push(orgInstructions);
  promptParts.push(AEROSPACE_VOCABULARY_PROMPT);
  const combinedPrompt = promptParts.join("\n\n");

  const formData = new FormData();
  formData.append("file", audioFile, fileName);
  formData.append("model", modelId);
  formData.append("language", "en");
  // gpt-4o-transcribe only supports "json" or "text" (NOT verbose_json)
  formData.append("response_format", "json");
  formData.append("prompt", combinedPrompt);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI transcription failed (${response.status}): ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  return {
    text: data.text || "",
    duration: data.duration || 0,
    words: data.words || [],
    language: data.language || "en",
    model: modelId,
  };
}

// ElevenLabs Scribe v2 transcription
async function transcribeWithElevenLabs(
  audioFile: File | Blob,
  fileName: string,
  modelId: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  // Build aerospace keyterms for ElevenLabs (max 100 terms)
  const keyterms = [
    "P/N", "S/N", "NDT", "CMM", "FAR", "8130-3", "MRO", "AOG", "IPC",
    "881700-1089", "5052-A123", "ft-lbs", "in-lbs", "N-m", "psi", "psig",
    "torque", "torqued", "borescope", "run-out", "backlash", "end-play",
    "Honeywell", "Pratt Whitney", "Collins Aerospace", "Safran", "Parker Hannifin",
    "Hamilton Sundstrand", "Rolls-Royce", "Eaton", "Moog", "Dukes", "Crane",
    "hydraulic pump", "fuel control unit", "actuator", "servo valve",
    "accumulator", "heat exchanger", "turbine blade", "compressor rotor",
    "bearing", "seal", "gasket", "O-ring", "bushing", "shim", "spacer",
    "serviceable", "unserviceable", "BER", "beyond economical repair",
    "safety wire", "safety wired", "cotter pin", "locknut", "overhaul",
    "thousandths", "mils", "microinches", "axial play", "radial play",
  ];

  const formData = new FormData();
  formData.append("file", audioFile, fileName);
  formData.append("model_id", modelId);
  formData.append("language_code", "eng");
  formData.append("timestamps_granularity", "word");
  formData.append("tag_audio_events", "false");
  // Add keyterms so ElevenLabs recognizes aerospace vocabulary
  // Each keyword is a separate repeated form field (max 100 terms, each < 50 chars)
  for (const term of keyterms) {
    formData.append("keyterms", term);
  }

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs transcription failed (${response.status}): ${err.slice(0, 200)}`);
  }

  const data = await response.json();

  // Map ElevenLabs word format to our TranscriptionWord format
  const words: TranscriptionWord[] = (data.words || [])
    .filter((w: { type?: string }) => w.type === "word")
    .map((w: { text: string; start: number; end: number }) => ({
      word: w.text,
      start: w.start,
      end: w.end,
    }));

  // Estimate duration from the last word's end time
  const duration = words.length > 0 ? words[words.length - 1].end : 0;

  return {
    text: data.text || "",
    duration,
    words,
    language: data.language_code || "en",
    model: modelId,
  };
}

export async function transcribeWithFallback(
  audioFile: File | Blob,
  fileName: string
): Promise<TranscriptionResult & { usedFallback: boolean }> {
  const result = await transcribeAudio(audioFile, fileName);
  return { ...result, usedFallback: false };
}

// ──────────────────────────────────────────────────────
// Generate FAA compliance documents with fallback chain
// Chain: GPT-5.4 → Claude Sonnet 4.6 → Gemini 3.1 Pro Preview
// Each model gets the same prompt but uses provider-specific API helpers
// ──────────────────────────────────────────────────────
export async function generateDocuments(opts: {
  organizationName: string;
  organizationCert: string | null;
  organizationAddress: string;
  userName: string;
  userBadge: string;
  componentInfo: {
    partNumber: string;
    serialNumber: string;
    description: string;
    oem: string;
    totalHours: number;
    totalCycles: number;
  } | null;
  photoExtractions: Array<Record<string, unknown>>;
  videoAnalysis: Record<string, unknown> | null;
  videoAnnotations?: Array<{ timestamp: number; tag: string; description: string; confidence: number }>;
  audioTranscript: string | null;
  cmmReference: string | null;
  referenceData: string | null;
  orgInstructions?: string | null;
  targetFormType?: string | null; // If set, only generate this specific document type
  orgDocumentStructure?: string | null; // Extracted form structure from an uploaded org document
}): Promise<
  DocumentGenerationResult & {
    modelUsed: string;
    fallbackUsed?: boolean;
    fallbackReason?: string;
  }
> {
  // Build the system prompt (same for all providers)
  // Structure: role → fusion rules (most important) → constraints → output schema
  const systemPrompt = `You are an FAA compliance document generator for aircraft maintenance. Given evidence from a maintenance session, determine which compliance documents are needed and generate complete form field data.

Be thorough but conservative — only generate documents that the evidence supports.
Today's date is ${new Date().toISOString().split("T")[0]}.

MULTI-SOURCE FUSION RULES — follow these for EVERY field:
1. Use ALL available sources for each field; never rely on a single source when corroboration exists.
2. If sources agree → raise confidence, set corroborationLevel to "double" or "triple".
3. If sources conflict → do NOT silently pick one. Add a discrepancy entry with both values. Set resolution to "REQUIRES MECHANIC REVIEW".
4. Source authority hierarchy:
   - Photo OCR: authoritative for data plate text, part numbers, serial numbers, and precise visible readings.
   - Video: authoritative for sequence of actions, physical work performed, and tool usage.
   - Audio: authoritative for mechanic judgment calls, spoken CMM references, and verbal measurements.
5. For measurements: prefer highest-precision source (photo > audio > video), but include all corroborating sources in the provenance array.

ORGANIZATION:
- Name: ${opts.organizationName}
- FAA Repair Station Certificate: ${opts.organizationCert || "N/A"}
- Address: ${opts.organizationAddress}

TECHNICIAN:
- Name: ${opts.userName}
- Badge: ${opts.userBadge}

${opts.componentInfo ? `COMPONENT:
- Part Number: ${opts.componentInfo.partNumber}
- Serial Number: ${opts.componentInfo.serialNumber}
- Description: ${opts.componentInfo.description}
- OEM: ${opts.componentInfo.oem}
- Total Hours: ${opts.componentInfo.totalHours}
- Total Cycles: ${opts.componentInfo.totalCycles}` : "COMPONENT: Not yet identified from evidence"}

${opts.cmmReference ? `CMM REFERENCE:\n${opts.cmmReference}` : ""}

${opts.referenceData ? `${opts.referenceData}\n\nUse this reference data to ensure generated documents include correct procedures, torque values, wear limits, and service bulletin references. Cross-reference evidence against these specifications.` : ""}

DOCUMENT TYPES (generate only those supported by the evidence):

| Type | When to use |
|------|-------------|
| "8130-3" | FAA Form 8130-3 — work complete, part being released |
| "337" | FAA Form 337 — major repairs or alterations performed |
| "8010-4" | FAA Form 8010-4 — defects found, malfunction/defect report |
| "easa-form-1" | EASA Form 1 — European equivalent of 8130-3 (blocks 1-14) |
| "8130-1" | FAA Form 8130-1 — part being exported to a foreign country |
| "8130-6" | FAA Form 8130-6 — applying for U.S. airworthiness certificate |
${opts.targetFormType ? `\nIMPORTANT: The user has specifically requested ONLY the "${opts.targetFormType}" document type. Generate ONLY that document — do not generate any other document types, even if the evidence could support them.\n` : ""}
${opts.orgDocumentStructure ? `INTERNAL FORM TO FILL:
The user selected an internal organization form for this session. Instead of (or in addition to) generating FAA forms, you MUST fill in the fields of this form using evidence from the capture session.

${opts.orgDocumentStructure}

INSTRUCTIONS FOR FILLING THIS FORM:
1. Generate a document with documentType "org-form" and title matching the form title above
2. In contentJson, include a key for EVERY field listed above
3. For each field, use evidence (photos, video, audio) to determine the correct value
4. If evidence doesn't cover a field, set its value to "" and add it to lowConfidenceFields
5. For checkbox fields, set value to "checked" or "unchecked" based on evidence
6. For signature fields, set value to the technician name if they verbally confirmed
7. Include provenance for each filled field showing which evidence source provided the value
8. This form takes PRIORITY — generate it first, then generate any applicable FAA forms
` : ""}
OUTPUT SCHEMA — return JSON matching this structure exactly. Do NOT add fields not listed here. All top-level keys are REQUIRED.

{
  "documents": [           // REQUIRED — array of generated documents
    {
      "documentType": "",  // REQUIRED — one of the types above
      "title": "",         // REQUIRED — human-readable title
      "contentJson": {},   // REQUIRED — all form fields as key-value pairs
      "confidence": 0.0,   // REQUIRED — overall confidence 0-1
      "lowConfidenceFields": [],  // REQUIRED — field names with confidence < 0.7
      "reasoning": "",     // REQUIRED — why this document type was chosen
      "provenance": {},    // REQUIRED — per-field audit trail (see structure below)
      "discrepancies": []  // REQUIRED — conflicting evidence (see structure below)
    }
  ],
  "summary": "",           // REQUIRED — brief summary of what was done
  "discrepancies": []      // REQUIRED — top-level cross-document conflicts
}

PROVENANCE structure (one entry per field in contentJson):
{
  "fieldName": {
    "value": "the field value",
    "sources": [
      {
        "sourceType": "photo|video|audio|cmm|ai_inferred",
        "excerpt": "short evidence excerpt",
        "confidence": 0.95,
        "timestamp": 0
      }
    ],
    "overallConfidence": 0.95,
    "corroborationLevel": "single|double|triple"
  }
}

DISCREPANCY structure:
{
  "field": "field path",
  "description": "what conflicts",
  "sourceA": { "type": "photo", "value": "123", "confidence": 0.9 },
  "sourceB": { "type": "audio", "value": "132", "confidence": 0.85 },
  "resolution": "REQUIRES MECHANIC REVIEW"
}

FEW-SHOT EXAMPLE (truncated — shows correct structure for one document with two fields):
{
  "documents": [
    {
      "documentType": "8130-3",
      "title": "Authorized Release Certificate — HPC Module Overhaul",
      "contentJson": {
        "partNumber": "881700-1089",
        "serialNumber": "SN-2024-11432",
        "description": "High Pressure Compressor Module"
      },
      "confidence": 0.92,
      "lowConfidenceFields": [],
      "reasoning": "Overhaul work is complete with all inspections passed. Part is being released as serviceable.",
      "provenance": {
        "partNumber": {
          "value": "881700-1089",
          "sources": [
            { "sourceType": "photo", "excerpt": "Data plate reads P/N 881700-1089", "confidence": 0.98, "timestamp": 0 },
            { "sourceType": "audio", "excerpt": "part number eight eight one seven hundred dash one oh eight nine", "confidence": 0.90, "timestamp": 45 }
          ],
          "overallConfidence": 0.98,
          "corroborationLevel": "double"
        },
        "serialNumber": {
          "value": "SN-2024-11432",
          "sources": [
            { "sourceType": "photo", "excerpt": "S/N SN-2024-11432 visible on data plate", "confidence": 0.97, "timestamp": 0 }
          ],
          "overallConfidence": 0.97,
          "corroborationLevel": "single"
        }
      },
      "discrepancies": []
    }
  ],
  "summary": "HPC module overhaul completed. All dimensional checks within limits. Part released as serviceable.",
  "discrepancies": []
}`;

  // Append org-specific instructions if set (e.g. equipment types, measurement precision)
  const fullSystemPrompt = systemPrompt + formatOrgInstructions(opts.orgInstructions);

  // Build the user message (same for all providers)
  const userMessage = `Generate FAA compliance documents from this maintenance session evidence.

${opts.photoExtractions.length > 0 ? `PHOTO ANALYSIS (AI-extracted from images):
${JSON.stringify(opts.photoExtractions, null, 2)}` : "No photo evidence."}

${opts.videoAnalysis ? `VIDEO ANALYSIS (AI deep analysis of maintenance video — includes action log, procedure steps, parts identified, anomalies):
${JSON.stringify(opts.videoAnalysis, null, 2)}` : "No video analysis available."}

${opts.videoAnnotations && opts.videoAnnotations.length > 0 ? `VIDEO ANNOTATIONS (timestamped observations from video — when specific parts, tools, and actions were seen):
${JSON.stringify(opts.videoAnnotations, null, 2)}` : ""}

${opts.audioTranscript ? `AUDIO TRANSCRIPT (technician verbal observations during maintenance):
${opts.audioTranscript}` : "No audio transcript available."}

Generate the appropriate FAA compliance documents based on this evidence.
Remember: conflicts must be output as discrepancies; do not silently resolve conflicting values.`;

  // Call the generation model with automatic fallback (no cached fallback —
  // if all models fail, throw so the user gets an honest error instead of fake data)
  const result = await callWithFallback({
    models: GENERATION_MODELS,
    timeoutMs: 50000,
    taskName: "document_generation",
    execute: async (model) => {
      // Route to the right provider API
      const text = await callModelForGeneration(model, fullSystemPrompt, userMessage);

      try {
        return JSON.parse(text) as DocumentGenerationResult;
      } catch {
        throw new Error("Model returned invalid JSON for document generation");
      }
    },
  });

  return {
    ...result.data,
    modelUsed: result.modelUsed.id,
    fallbackUsed: result.fallbackUsed,
  };
}

export async function analyzeImageWithFallback(opts: {
  imageBase64: string;
  mimeType?: string;
}): Promise<ImageOcrResult> {
  const result = await callWithFallback({
    models: OCR_MODELS,
    timeoutMs: 15000,
    taskName: "photo_ocr",
    execute: async (model) => {
      const prompt = `You are an aerospace parts identification and OCR expert. Read this image and extract all possible data plate content.

Return JSON:
{
  "partNumber": "string or null",
  "serialNumber": "string or null",
  "description": "string or null",
  "manufacturer": "string or null",
  "allText": ["array", "of", "all", "text", "found"],
  "confidence": 0.0,
  "notes": "string"
}`;

      const dataUrl = opts.imageBase64.startsWith("data:")
        ? opts.imageBase64
        : `data:${opts.mimeType || "image/jpeg"};base64,${opts.imageBase64}`;

      const raw = await callModelForOcr(model, prompt, dataUrl);
      const parsed = JSON.parse(raw) as Omit<ImageOcrResult, "model">;

      return {
        partNumber: parsed.partNumber ?? null,
        serialNumber: parsed.serialNumber ?? null,
        description: parsed.description ?? null,
        manufacturer: parsed.manufacturer ?? null,
        allText: Array.isArray(parsed.allText) ? parsed.allText : [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.4,
        notes: parsed.notes || "",
        model: model.id,
      } as ImageOcrResult;
    },
  });

  return {
    ...result.data,
    model: result.modelUsed.id,
    fallbackUsed: result.fallbackUsed,
  };
}

// Route a generation call to the correct provider API based on the model config
async function callModelForGeneration(
  model: ModelConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  switch (model.provider) {
    case "openai":
      return callOpenAI({
        model: model.id,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        jsonMode: true,
        maxTokens: 4000,
        timeoutMs: 50000,
      });

    case "anthropic":
      return callAnthropic({
        model: model.id,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 4000,
        timeoutMs: 50000,
      });

    case "google":
      return callGemini({
        model: model.id,
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
        timeoutMs: 50000,
      });

    default:
      throw new Error(`Unsupported provider for generation: ${model.provider}`);
  }
}

async function callModelForOcr(
  model: ModelConfig,
  systemPrompt: string,
  imageDataUrl: string
): Promise<string> {
  switch (model.provider) {
    case "openai":
      return callOpenAI({
        model: model.id,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image from an aircraft maintenance workbench. Extract all part identification information.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        jsonMode: true,
        maxTokens: 1000,
        timeoutMs: 15000,
      });

    case "google":
      return callGemini({
        model: model.id,
        contents: [
          {
            role: "user",
            parts: [
              { text: systemPrompt },
              {
                inlineData: {
                  mimeType: imageDataUrl.split(";")[0].replace("data:", "") || "image/jpeg",
                  data: imageDataUrl.split(",")[1] || "",
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
        timeoutMs: 15000,
      });

    default:
      throw new Error(`Unsupported provider for OCR: ${model.provider}`);
  }
}
