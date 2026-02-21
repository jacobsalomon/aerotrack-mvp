// Gemini API client — handles video analysis via Google AI Studio
// Two main capabilities:
// 1. Upload video files via the Gemini File API (required before analysis)
// 2. Analyze video content (annotations, deep analysis with CMM context)

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
    const err = await startResponse.text();
    throw new Error(`Gemini File API upload start failed: ${startResponse.status} ${err}`);
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
    const err = await uploadResponse.text();
    throw new Error(`Gemini File API upload failed: ${uploadResponse.status} ${err}`);
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
// Annotate a video chunk — real-time Pass 1 (Gemini 2.0 Flash)
// Takes a 2-minute video chunk and returns timestamped searchable tags
// This runs during capture for every chunk
// ──────────────────────────────────────────────────────
export async function annotateVideoChunk(
  fileUri: string,
  mimeType: string
): Promise<VideoAnnotationResult[]> {
  const apiKey = getApiKey();
  const model = process.env.VIDEO_ANNOTATION_MODEL || "gemini-2.0-flash";

  const response = await fetch(
    `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                fileData: {
                  mimeType,
                  fileUri,
                },
              },
              {
                text: `You are an aerospace maintenance video analyst. Watch this video clip from an aircraft maintenance workbench and identify everything you see.

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

Be thorough — this creates a permanent searchable index of maintenance footage for FAA auditors.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini annotation failed: ${response.status} ${err}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error("No response from Gemini annotation");

  try {
    return JSON.parse(text) as VideoAnnotationResult[];
  } catch {
    console.error("Gemini returned non-JSON annotation:", text);
    return [];
  }
}

// ──────────────────────────────────────────────────────
// Deep analysis of a full session video — Pass 2 (Gemini 2.5 Flash)
// Takes the full video + optional CMM content and produces detailed analysis
// This runs once after the mechanic finishes the session
// ──────────────────────────────────────────────────────
export async function analyzeSessionVideo(
  fileUri: string,
  mimeType: string,
  cmmContent?: string // Full CMM text loaded into context
): Promise<DeepAnalysisResult> {
  const apiKey = getApiKey();
  const model = process.env.VIDEO_ANALYSIS_MODEL || "gemini-2.5-flash";

  // Build the prompt parts — video file + optional CMM + analysis instructions
  const parts: Array<Record<string, unknown>> = [
    {
      fileData: {
        mimeType,
        fileUri,
      },
    },
  ];

  // If we have a CMM, include it as context
  if (cmmContent) {
    parts.push({
      text: `COMPONENT MAINTENANCE MANUAL (CMM) REFERENCE:
The following is the relevant maintenance manual for the component being worked on.
Use this to verify procedure compliance and identify specific step numbers.

${cmmContent}`,
    });
  }

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

3. PROCEDURE STEPS — The maintenance steps performed, mapped to CMM references if available:
   - Step number and description
   - Whether it appears completed correctly
   - Any CMM section reference if a manual was provided

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

  const response = await fetch(
    `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini deep analysis failed: ${response.status} ${err}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error("No response from Gemini deep analysis");

  try {
    return JSON.parse(text) as DeepAnalysisResult;
  } catch {
    console.error("Gemini returned non-JSON deep analysis:", text);
    // Return empty structure rather than crashing
    return {
      actionLog: [],
      partsIdentified: [],
      procedureSteps: [],
      anomalies: [{ description: "AI returned unparseable response", severity: "warning" }],
      confidence: 0,
    };
  }
}

// ──────────────────────────────────────────────────────
// Delete a file from Gemini File API (cleanup after processing)
// ──────────────────────────────────────────────────────
export async function deleteGeminiFile(fileName: string): Promise<void> {
  const apiKey = getApiKey();
  await fetch(`${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`, {
    method: "DELETE",
  });
}
