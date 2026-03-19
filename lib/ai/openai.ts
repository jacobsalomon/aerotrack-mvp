// OpenAI API client — handles audio transcription and document generation
// Now uses callWithFallback() for automatic model failover
//
// Transcription chain: gpt-4o-transcribe → gpt-4o-mini-transcribe → cached
// Generation chain: GPT-5.4 → Claude Sonnet 4.6 → Gemini 3.1 Pro → cached

import { TRANSCRIPTION_MODELS, OCR_MODELS, GENERATION_MODELS } from "./models";
import { callWithFallback, callOpenAI, callAnthropic, callGemini } from "./provider";
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

export interface EvidenceLineageEntry {
  source: "photo_extraction" | "video_analysis" | "video_annotation" | "audio_transcript" | "cmm_reference" | "ai_inferred";
  detail: string;
  confidence: number;
}

export interface DocumentGenerationResult {
  documents: Array<{
    documentType: string;
    title: string;
    contentJson: Record<string, unknown>;
    confidence: number;
    lowConfidenceFields: string[];
    reasoning: string;
    evidenceLineage?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
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
  fileName: string
): Promise<TranscriptionResult> {
  const result = await callWithFallback({
    models: TRANSCRIPTION_MODELS,
    timeoutMs: 25000,
    taskName: "audio_transcription",
    execute: async (model) => {
      if (model.provider === "elevenlabs") {
        return transcribeWithElevenLabs(audioFile, fileName, model.id);
      }
      return transcribeWithOpenAI(audioFile, fileName, model.id);
    },
  });

  return result.data;
}

// OpenAI transcription (gpt-4o-transcribe, gpt-4o-mini-transcribe)
async function transcribeWithOpenAI(
  audioFile: File | Blob,
  fileName: string,
  modelId: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const formData = new FormData();
  formData.append("file", audioFile, fileName);
  formData.append("model", modelId);
  formData.append("language", "en");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  formData.append("prompt", AEROSPACE_VOCABULARY_PROMPT);

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
  // ElevenLabs expects keyterms as a single JSON array string
  formData.append("keyterms", JSON.stringify(keyterms));

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
  technicianName: string;
  technicianBadge: string;
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
}): Promise<
  DocumentGenerationResult & {
    modelUsed: string;
    fallbackUsed?: boolean;
    fallbackReason?: string;
  }
> {
  // Build the system prompt (same for all providers)
  const systemPrompt = `You are an FAA compliance document generator for aircraft maintenance. Given evidence from a maintenance session, determine which compliance documents are needed and generate complete form field data.

ORGANIZATION:
- Name: ${opts.organizationName}
- FAA Repair Station Certificate: ${opts.organizationCert || "N/A"}
- Address: ${opts.organizationAddress}

TECHNICIAN:
- Name: ${opts.technicianName}
- Badge: ${opts.technicianBadge}

${opts.componentInfo ? `COMPONENT:
- Part Number: ${opts.componentInfo.partNumber}
- Serial Number: ${opts.componentInfo.serialNumber}
- Description: ${opts.componentInfo.description}
- OEM: ${opts.componentInfo.oem}
- Total Hours: ${opts.componentInfo.totalHours}
- Total Cycles: ${opts.componentInfo.totalCycles}` : "COMPONENT: Not yet identified from evidence"}

${opts.cmmReference ? `CMM REFERENCE:
${opts.cmmReference}` : ""}

${opts.referenceData ? `${opts.referenceData}

Use this reference data to ensure generated documents include correct procedures, torque values, wear limits, and service bulletin references. Cross-reference evidence against these specifications.` : ""}

HOW TO USE EVIDENCE:
- Use PHOTO ANALYSIS for part numbers, serial numbers, data plate info, and visual condition
- Use VIDEO ANALYSIS action log to populate work-performed sections with specific timestamped actions
- Use VIDEO ANALYSIS procedure steps to verify CMM compliance in remarks
- Use VIDEO ANALYSIS anomalies to flag defects or non-conformances
- Use VIDEO ANNOTATIONS for precise timestamps of when specific parts, tools, or actions were observed
- Use AUDIO TRANSCRIPT for technician observations, measurements, and verbal notes
- Use CMM REFERENCE to ensure correct manual citations and revision numbers

MULTI-SOURCE FUSION RULES (REQUIRED):
- Use all available sources for each field; do not rely on a single source when corroboration exists.
- If sources agree, raise confidence and mark corroboration level ("single", "double", "triple").
- If sources conflict, do not silently pick one value. Add a discrepancy with both values and mark for mechanic review.
- Source authority:
  - Video is authoritative for sequence of actions, physical work performed, and tool usage.
  - Audio is authoritative for mechanic judgment calls and spoken CMM references.
  - Photo OCR is authoritative for data plate text, part numbers, serials, and precise visible readings.
- For measurements, prefer highest-precision evidence (photo > audio > video), but include all corroborating sources.

DOCUMENT TYPES YOU CAN GENERATE:
- "8130-3": FAA Form 8130-3 (Authorized Release Certificate) — use when work is complete and part is being released
- "337": FAA Form 337 (Major Repair and Alteration) — use when major repairs or alterations were performed
- "8010-4": FAA Form 8010-4 (Malfunction/Defect Report) — use when defects were found
- "easa-form-1": EASA Form 1 (Authorized Release Certificate) — European equivalent of 8130-3, use for EASA-regulated work. Blocks match the official EASA Form 1 layout (block1=authority, block3=tracking number, block4=org, block5=work order, block6a-d=item, block7=remarks, block8=Part 21, block9=Part 145, block10=other regulation, block11=approval number, block12=date, block13=signature, block14=certifying statement)
- "8130-1": FAA Form 8130-1 (Application for Export Certificate of Airworthiness) — use when a part is being exported to a foreign country. Fields: applicantName, applicantAddress, productType, partNumber, serialNumber, manufacturer, modelDesignation, importingCountry, foreignAuthority, basisForIssuance, remarks, inspectorName, certificateNumber, date, signature
- "8130-6": FAA Form 8130-6 (Application for U.S. Airworthiness Certificate) — use when applying for airworthiness certification. Fields: registrationMark, aircraftBuilder, modelDesignation, serialNumber, engineModel, propellerModel, certificateType, category, operatingLimitations, typeCertNumber, productionBasis, remarks, applicantName, applicantSignature, date, inspectorSignature, inspectorDate

For each document, generate complete form field data as JSON. Include a confidence score (0-1) and list any fields you're uncertain about.

IMPORTANT: For each document, also return an "evidenceLineage" object that maps each form field name to its evidence source. This creates an audit trail showing WHERE each field's data came from.
Also return a "provenance" object with multi-source arrays for each field.

Return JSON with this exact structure:
{
  "documents": [
    {
      "documentType": "8130-3",
      "title": "Human-readable title",
      "contentJson": { ...all form fields... },
      "confidence": 0.85,
      "lowConfidenceFields": ["fieldName1"],
      "reasoning": "Why this document type was chosen",
      "provenance": {
        "fieldName": {
          "value": "field value",
          "provenance": [
            {
              "sourceType": "audio|video|photo|cmm|ai_inferred",
              "evidenceId": "optional",
              "timestamp": 0,
              "excerpt": "short evidence excerpt",
              "confidence": 0.95
            }
          ],
          "overallConfidence": 0.95,
          "corroborationLevel": "single|double|triple"
        }
      },
      "evidenceLineage": {
        "fieldName": {
          "source": "photo_extraction" | "video_analysis" | "video_annotation" | "audio_transcript" | "cmm_reference" | "ai_inferred",
          "detail": "Brief description of which specific evidence",
          "confidence": 0.95
        }
      },
      "discrepancies": [
        {
          "field": "field path",
          "description": "what conflicts",
          "sourceA": { "type": "photo", "value": "123", "confidence": 0.9 },
          "sourceB": { "type": "audio", "value": "132", "confidence": 0.85 },
          "resolution": "REQUIRES MECHANIC REVIEW"
        }
      ]
    }
  ],
  "summary": "Brief summary of what was done",
  "discrepancies": [
    {
      "field": "field path",
      "description": "conflict summary",
      "sourceA": { "type": "photo", "value": "123", "confidence": 0.9 },
      "sourceB": { "type": "audio", "value": "132", "confidence": 0.85 },
      "resolution": "REQUIRES MECHANIC REVIEW"
    }
  ]
}

Be thorough but conservative — only generate documents that the evidence supports.
Today's date is ${new Date().toISOString().split("T")[0]}.`;

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
      const text = await callModelForGeneration(model, systemPrompt, userMessage);

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
