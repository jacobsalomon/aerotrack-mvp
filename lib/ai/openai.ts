// OpenAI API client — handles audio transcription and document generation
// Two main capabilities:
// 1. GPT-4o-transcribe for best-in-class audio transcription (~2.5% WER)
// 2. GPT-4o for structured FAA document generation

const OPENAI_API_BASE = "https://api.openai.com/v1";

// Get the API key — fail loudly if missing
function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

// Aerospace vocabulary prompt — feeds domain-specific terms to the transcription model
// so it correctly recognizes part numbers, abbreviations, and technical terminology.
// Both Whisper and GPT-4o-transcribe support this via the "prompt" parameter.
const AEROSPACE_VOCABULARY_PROMPT = [
  // Common abbreviations
  "P/N, S/N, NDT, CMM, FAR, AD, SB, STC, PMA, TSO, EASA, MRO, AOG, MEL, IPC, TBO, MTBF",
  // Regulatory and compliance
  "FAA, 8130-3, Form 337, 8010-4, airworthiness, serviceable, unserviceable, BER, beyond economical repair",
  // Maintenance actions
  "torque, torqued, safety wire, safety wired, cotter pin, locknut, overhaul, inspect, NDI, borescope",
  "dimensional check, wear limit, service limit, run-out, backlash, end-play, axial play, radial play",
  // Measurements and units
  "inch-pounds, foot-pounds, Newton-meters, thousandths, mils, microinches, psi, psig",
  // Part number formats (guide the model to expect these patterns)
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
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

export interface TranscriptionResult {
  text: string; // Full transcription text
  duration: number; // Audio duration in seconds
  words: TranscriptionWord[]; // Word-level timestamps
  language: string;
  model: string;
}

export interface DocumentGenerationResult {
  documents: Array<{
    documentType: string; // "8130-3", "337", "8010-4"
    title: string;
    contentJson: Record<string, unknown>;
    confidence: number;
    lowConfidenceFields: string[];
    reasoning: string;
  }>;
  summary: string;
}

// ──────────────────────────────────────────────────────
// Transcribe audio using GPT-4o-transcribe
// Best word error rate (~2.5%) — worth the cost for part number accuracy
// Returns word-level timestamps via verbose_json format
// ──────────────────────────────────────────────────────
export async function transcribeAudio(
  audioFile: File | Blob,
  fileName: string
): Promise<TranscriptionResult> {
  const apiKey = getApiKey();
  const model = process.env.TRANSCRIPTION_MODEL || "gpt-4o-transcribe";

  const formData = new FormData();
  formData.append("file", audioFile, fileName);
  formData.append("model", model);
  formData.append("language", "en");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  // Aerospace vocabulary helps the model correctly recognize technical terms
  formData.append("prompt", AEROSPACE_VOCABULARY_PROMPT);

  const response = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI transcription failed: ${response.status} ${err}`);
  }

  const result = await response.json();

  return {
    text: result.text || "",
    duration: result.duration || 0,
    words: result.words || [],
    language: result.language || "en",
    model,
  };
}

// ──────────────────────────────────────────────────────
// Transcribe audio using Groq Whisper as fallback
// Cheaper but lower accuracy (~10-12% WER) — used when OpenAI fails
// ──────────────────────────────────────────────────────
export async function transcribeAudioGroqFallback(
  audioFile: File | Blob,
  fileName: string
): Promise<TranscriptionResult> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY is not set for fallback transcription");

  const formData = new FormData();
  formData.append("file", audioFile, fileName);
  formData.append("model", "whisper-large-v3");
  formData.append("language", "en");
  formData.append("response_format", "verbose_json");
  // Aerospace vocabulary helps the model correctly recognize technical terms
  formData.append("prompt", AEROSPACE_VOCABULARY_PROMPT);

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq fallback transcription failed: ${response.status} ${err}`);
  }

  const result = await response.json();

  return {
    text: result.text || "",
    duration: result.duration || 0,
    words: result.words || [],
    language: result.language || "en",
    model: "whisper-large-v3 (groq fallback)",
  };
}

// ──────────────────────────────────────────────────────
// Transcribe with automatic fallback
// Tries GPT-4o-transcribe first, falls back to Groq Whisper if it fails
// ──────────────────────────────────────────────────────
export async function transcribeWithFallback(
  audioFile: File | Blob,
  fileName: string
): Promise<TranscriptionResult & { usedFallback: boolean }> {
  try {
    const result = await transcribeAudio(audioFile, fileName);
    return { ...result, usedFallback: false };
  } catch (error) {
    console.warn(
      "OpenAI transcription failed, falling back to Groq:",
      error instanceof Error ? error.message : error
    );
    const result = await transcribeAudioGroqFallback(audioFile, fileName);
    return { ...result, usedFallback: true };
  }
}

// ──────────────────────────────────────────────────────
// Generate FAA compliance documents from session evidence
// Uses GPT-4o for best structured JSON output
// Takes all evidence (photo OCR, video analysis, transcripts) and produces form data
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
  audioTranscript: string | null;
  cmmReference: string | null;
  referenceData: string | null; // Formatted reference data text (procedures, limits, specs)
}): Promise<DocumentGenerationResult> {
  const apiKey = getApiKey();
  const model = process.env.GENERATION_MODEL || "openai/gpt-4o";
  // Strip "openai/" prefix if present — OpenAI API doesn't want it
  const modelId = model.replace("openai/", "");

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "system",
          content: `You are an FAA compliance document generator for aircraft maintenance. Given evidence from a maintenance session, determine which compliance documents are needed and generate complete form field data.

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

DOCUMENT TYPES YOU CAN GENERATE:
- "8130-3": FAA Form 8130-3 (Authorized Release Certificate) — use when work is complete and part is being released
- "337": FAA Form 337 (Major Repair and Alteration) — use when major repairs or alterations were performed
- "8010-4": FAA Form 8010-4 (Malfunction/Defect Report) — use when defects were found

For each document, generate complete form field data as JSON. Include a confidence score (0-1) and list any fields you're uncertain about.

Return JSON with this exact structure:
{
  "documents": [
    {
      "documentType": "8130-3",
      "title": "Human-readable title",
      "contentJson": { ...all form fields... },
      "confidence": 0.85,
      "lowConfidenceFields": ["fieldName1"],
      "reasoning": "Why this document type was chosen"
    }
  ],
  "summary": "Brief summary of what was done"
}

Be thorough but conservative — only generate documents that the evidence supports.
Today's date is ${new Date().toISOString().split("T")[0]}.`,
        },
        {
          role: "user",
          content: `Generate FAA compliance documents from this maintenance session evidence.

${opts.photoExtractions.length > 0 ? `PHOTO ANALYSIS (AI-extracted from images):
${JSON.stringify(opts.photoExtractions, null, 2)}` : "No photo evidence."}

${opts.videoAnalysis ? `VIDEO ANALYSIS (AI analysis of maintenance video):
${JSON.stringify(opts.videoAnalysis, null, 2)}` : "No video analysis available."}

${opts.audioTranscript ? `AUDIO TRANSCRIPT:
${opts.audioTranscript}` : "No audio transcript available."}

Generate the appropriate FAA compliance documents based on this evidence.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI document generation failed: ${response.status} ${err}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) throw new Error("No response from OpenAI document generation");

  try {
    return JSON.parse(content) as DocumentGenerationResult;
  } catch {
    throw new Error("OpenAI returned invalid JSON for document generation");
  }
}
