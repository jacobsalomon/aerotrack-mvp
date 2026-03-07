// Gemini API client — handles video analysis via Google AI Studio
// Two main capabilities:
// 1. Upload video files via the Gemini File API (required before analysis)
// 2. Analyze video content (annotations, deep analysis with CMM context)
//
// Now uses callWithFallback() for automatic model failover

import { VIDEO_MODELS, ANNOTATION_MODELS } from "./models";
import { callWithFallback, callGemini } from "./provider";
import { cachedSessionAnalysis } from "./cached-responses";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

// Get the API key — fail loudly if missing
function getApiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY is not set");
  return key;
}

// ──────────────────────────────────────────────────────
// Types for Gemini responses
// ──────────────────────────────────────────────────────

export interface GeminiFileUpload {
  name: string; // e.g., "files/abc123"
  uri: string; // Full URI for referencing in prompts
  mimeType: string;
  sizeBytes: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED";
}

export interface VideoAnnotationResult {
  timestamp: number; // Seconds into the video
  tag: string; // "part_number", "action", "tool", "text", "condition"
  description: string;
  confidence: number;
}

export interface DeepAnalysisResult {
  actionLog: Array<{
    timestamp: number;
    action: string;
    details: string;
  }>;
  partsIdentified: Array<{
    partNumber: string;
    serialNumber?: string;
    description: string;
    confidence: number;
  }>;
  procedureSteps: Array<{
    stepNumber: number;
    description: string;
    completed: boolean;
    cmmReference?: string;
  }>;
  anomalies: Array<{
    description: string;
    severity: "info" | "warning" | "critical";
    timestamp?: number;
  }>;
  confidence: number;
}

// ──────────────────────────────────────────────────────
// Upload a file to Gemini File API
// Required before you can analyze video — Gemini needs the file hosted on their side
// Returns the file metadata including the URI to reference in prompts
// ──────────────────────────────────────────────────────
export async function uploadFileToGemini(
  fileBuffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<GeminiFileUpload> {
  const apiKey = getApiKey();

  // Step 1: Start a resumable upload to get the upload URI
  const startResponse = await fetch(
    `${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileBuffer.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
      },
      body: JSON.stringify({
        file: { displayName },
      }),
    }
  );

  if (!startResponse.ok) {
    await startResponse.text(); // drain body
    console.error(`Gemini upload start failed (status ${startResponse.status})`);
    throw new Error(`Gemini File API upload start failed (status ${startResponse.status})`);
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL returned from Gemini File API");

  // Step 2: Upload the actual file bytes
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(fileBuffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(fileBuffer),
  });

  if (!uploadResponse.ok) {
    await uploadResponse.text(); // drain body
    console.error(`Gemini upload failed (status ${uploadResponse.status})`);
    throw new Error(`Gemini File API upload failed (status ${uploadResponse.status})`);
  }

  const result = await uploadResponse.json();
  return result.file as GeminiFileUpload;
}

// ──────────────────────────────────────────────────────
// Wait for an uploaded file to finish processing
// Gemini needs time to process video files before they can be used in prompts
// Polls every 5 seconds, gives up after ~2 minutes
// ──────────────────────────────────────────────────────
export async function waitForFileProcessing(
  fileName: string,
  maxWaitMs = 120000
): Promise<GeminiFileUpload> {
  const apiKey = getApiKey();
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(
      `${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to check file status: ${response.status}`);
    }

    const file = (await response.json()) as GeminiFileUpload;

    if (file.state === "ACTIVE") return file;
    if (file.state === "FAILED") throw new Error(`File processing failed: ${fileName}`);

    // Still processing — wait 5 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`File processing timed out after ${maxWaitMs}ms: ${fileName}`);
}

// ──────────────────────────────────────────────────────
// Annotate a video chunk — real-time lightweight tagging
// Uses ANNOTATION_MODELS fallback chain (Gemini 3.1 Flash → 2.5 Flash)
// Takes a 2-minute video chunk and returns timestamped searchable tags
// ──────────────────────────────────────────────────────
export async function annotateVideoChunk(
  fileUri: string,
  mimeType: string
): Promise<VideoAnnotationResult[]> {
  const prompt = `You are an aerospace maintenance video analyst. Watch this video clip from an aircraft maintenance workbench and identify everything you see.

For each observation, provide:
- timestamp: seconds into the video when you see it
- tag: one of "part_number", "action", "tool", "text", "condition"
- description: what you observed
- confidence: 0.0 to 1.0

Focus on:
1. Part numbers visible on data plates, labels, or engravings
2. Actions being performed (installing, removing, inspecting, measuring, torquing, cleaning)
3. Tools in use (torque wrench, calipers, bore scope, etc.)
4. Any readable text (labels, markings, work order numbers)
5. Component condition observations (wear, damage, corrosion, normal)

Return your response as a JSON array:
[
  { "timestamp": 12.5, "tag": "part_number", "description": "Data plate shows P/N 881700-1089", "confidence": 0.95 },
  { "timestamp": 25.0, "tag": "action", "description": "Technician removing hydraulic pump mounting bolts", "confidence": 0.88 }
]

Be thorough — this creates a permanent searchable index of maintenance footage for FAA auditors.`;

  const contents = [
    {
      parts: [
        { fileData: { mimeType, fileUri } },
        { text: prompt },
      ],
    },
  ];

  const result = await callWithFallback({
    models: ANNOTATION_MODELS,
    timeoutMs: 50000,
    taskName: "video_annotation",
    execute: async (model) => {
      const text = await callGemini({
        model: model.id,
        contents,
        timeoutMs: 50000,
      });

      try {
        return JSON.parse(text) as VideoAnnotationResult[];
      } catch {
        console.error("Gemini returned non-JSON annotation:", text);
        return [];
      }
    },
  });

  return result.data;
}

// ──────────────────────────────────────────────────────
// Deep analysis of a full session video
// Uses VIDEO_MODELS fallback chain (Gemini 3.1 Pro → 3.1 Flash → 2.5 Flash)
// Takes the full video + optional CMM content and produces detailed analysis
// This runs once after the mechanic finishes the session
// ──────────────────────────────────────────────────────
export async function analyzeSessionVideo(
  fileUri: string,
  mimeType: string,
  cmmContent?: string,
  expectedSteps?: string
): Promise<
  DeepAnalysisResult & {
    verificationSource: "cmm" | "expected_steps" | "ai_inferred";
    modelUsed: string;
    fallbackUsed?: boolean;
    fallbackReason?: string;
  }
> {
  // Build the prompt parts — video file + optional CMM + analysis instructions
  const parts: Array<Record<string, unknown>> = [
    { fileData: { mimeType, fileUri } },
  ];

  // Determine which verification source to use
  let verificationSource: "cmm" | "expected_steps" | "ai_inferred" = "ai_inferred";

  if (cmmContent) {
    verificationSource = "cmm";
    parts.push({
      text: `COMPONENT MAINTENANCE MANUAL (CMM) REFERENCE:
The following is the relevant maintenance manual for the component being worked on.
Use this to verify procedure compliance and identify specific step numbers.

${cmmContent}`,
    });
  } else if (expectedSteps) {
    verificationSource = "expected_steps";
    parts.push({
      text: `EXPECTED MAINTENANCE STEPS (SOP):
The following steps were defined by the supervisor as the expected procedure for this job.
Use these as the checklist to verify the technician's work. Map observed actions to these steps
and flag any steps that appear incomplete or skipped.

${expectedSteps}`,
    });
  }

  const procedureInstruction = cmmContent
    ? `3. PROCEDURE STEPS — The maintenance steps performed, mapped to CMM references:
   - Step number and description
   - Whether it appears completed correctly
   - The CMM section reference for each step`
    : expectedSteps
    ? `3. PROCEDURE STEPS — Verify the technician's work against the expected steps above:
   - Map each expected step to what you observe in the video
   - Mark each step as completed (true) or not observed (false)
   - Use the expected step descriptions as the step descriptions`
    : `3. PROCEDURE STEPS — The maintenance steps you can infer from the video:
   - Step number and description of what was done
   - Whether it appears completed correctly
   - Note: no CMM or SOP was provided, so these are AI-inferred from observation`;

  parts.push({
    text: `You are a senior aerospace maintenance analyst reviewing video footage of maintenance work. Analyze this video in detail and provide a comprehensive report.

Your analysis must include:

1. ACTION LOG — Every significant action you observe, with timestamps:
   - What was done (remove, install, inspect, measure, torque, etc.)
   - When it happened (timestamp in seconds)
   - Relevant details (torque values, measurements, observations)

2. PARTS IDENTIFIED — Every part number, serial number, or component you can identify:
   - Part number and serial number if visible
   - Description of the component
   - Confidence in the identification

${procedureInstruction}

4. ANOMALIES — Anything concerning or noteworthy:
   - Any deviations from standard procedure
   - Safety concerns
   - Damage or wear observed
   - Missing steps or documentation

5. CONFIDENCE — Your overall confidence in the analysis (0-1)

Return your response as JSON with this exact structure:
{
  "actionLog": [{"timestamp": 0, "action": "string", "details": "string"}],
  "partsIdentified": [{"partNumber": "string", "serialNumber": "string or null", "description": "string", "confidence": 0.95}],
  "procedureSteps": [{"stepNumber": 1, "description": "string", "completed": true, "cmmReference": "section 5.2 or null"}],
  "anomalies": [{"description": "string", "severity": "info|warning|critical", "timestamp": 0}],
  "confidence": 0.9
}

Be thorough and precise — this data feeds into FAA compliance documents.`,
  });

  const contents = [{ parts }];

  const result = await callWithFallback({
    models: VIDEO_MODELS,
    timeoutMs: 60000,
    taskName: "video_analysis",
    cachedFallback: {
      actionLog: cachedSessionAnalysis.actionLog ?? [],
      partsIdentified: cachedSessionAnalysis.partsIdentified ?? [],
      procedureSteps: cachedSessionAnalysis.procedureSteps ?? [],
      anomalies: cachedSessionAnalysis.anomalies ?? [],
      confidence: cachedSessionAnalysis.confidence ?? 0.5,
    } as DeepAnalysisResult,
    execute: async (model) => {
      const text = await callGemini({
        model: model.id,
        contents,
        timeoutMs: 60000,
      });

      try {
        return JSON.parse(text) as DeepAnalysisResult;
      } catch {
        console.error("Gemini returned non-JSON deep analysis:", text);
        return {
          actionLog: [],
          partsIdentified: [],
          procedureSteps: [],
          anomalies: [{ description: "AI returned unparseable response", severity: "warning" as const }],
          confidence: 0,
        };
      }
    },
  });

  return {
    ...result.data,
    verificationSource,
    modelUsed: result.cachedFallback ? "cached" : result.modelUsed.id,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.cachedFallback ? "all models failed" : undefined,
  };
}

// ──────────────────────────────────────────────────────
// Delete a file from Gemini File API (cleanup after processing)
// ──────────────────────────────────────────────────────
export async function deleteGeminiFile(fileName: string): Promise<void> {
  const apiKey = getApiKey();
  const response = await fetch(`${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    console.warn(`Gemini file cleanup failed for ${fileName} (status ${response.status}) — may need manual cleanup`);
  }
}
