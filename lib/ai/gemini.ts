// Gemini API client — handles video analysis via Google AI Studio
// Two main capabilities:
// 1. Upload video files via the Gemini File API (required before analysis)
// 2. Analyze video content (annotations, deep analysis with CMM context)
//
// Now uses callWithFallback() for automatic model failover

import { VIDEO_MODELS, ANNOTATION_MODELS } from "./models";
import { callWithFallback, callGemini } from "./provider";

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

type VerificationSource = "cmm" | "expected_steps" | "ai_inferred";

function resolveVerificationSource(
  cmmContent?: string,
  expectedSteps?: string
): VerificationSource {
  if (cmmContent) return "cmm";
  if (expectedSteps) return "expected_steps";
  return "ai_inferred";
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
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const response = await fetch(
      `${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to check file status: ${response.status}`);
    }

    const file = (await response.json()) as GeminiFileUpload;

    if (file.state === "ACTIVE") return file;
    if (file.state === "FAILED") throw new Error(`File processing failed: ${fileName}`);

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

  const verificationSource = resolveVerificationSource(cmmContent, expectedSteps);

  if (cmmContent) {
    parts.push({
      text: `COMPONENT MAINTENANCE MANUAL (CMM) REFERENCE:
The following is the relevant maintenance manual for the component being worked on.
Use this to verify procedure compliance and identify specific step numbers.

${cmmContent}`,
    });
  } else if (expectedSteps) {
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
    modelUsed: result.modelUsed.id,
    fallbackUsed: result.fallbackUsed,
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

// ──────────────────────────────────────────────────────
// Map-Reduce Video Analysis
// Analyzes ALL video chunks instead of just the largest one.
// Map: Flash analyzes each chunk independently (cheap, parallel)
// Reduce: Pro merges chunk results into one unified analysis (text-only)
// ──────────────────────────────────────────────────────

// Map phase — analyze a single chunk with Flash for cost efficiency.
// Same prompt as analyzeSessionVideo but with chunk context preamble.
async function analyzeVideoChunkWithFlash(
  fileUri: string,
  mimeType: string,
  chunkLabel: string,
  cmmContent?: string,
  expectedSteps?: string
): Promise<
  DeepAnalysisResult & {
    verificationSource: "cmm" | "expected_steps" | "ai_inferred";
    modelUsed: string;
    fallbackUsed: boolean;
  }
> {
  const parts: Array<Record<string, unknown>> = [
    { fileData: { mimeType, fileUri } },
  ];

  const verificationSource = resolveVerificationSource(cmmContent, expectedSteps);

  if (cmmContent) {
    parts.push({
      text: `COMPONENT MAINTENANCE MANUAL (CMM) REFERENCE:\n${cmmContent}`,
    });
  } else if (expectedSteps) {
    parts.push({
      text: `EXPECTED MAINTENANCE STEPS (SOP):\n${expectedSteps}`,
    });
  }

  const procedureInstruction = cmmContent
    ? `3. PROCEDURE STEPS — Map observed actions to CMM references. Mark completed or not.`
    : expectedSteps
    ? `3. PROCEDURE STEPS — Verify work against the expected steps. Mark each as completed or not.`
    : `3. PROCEDURE STEPS — Infer maintenance steps from what you observe.`;

  parts.push({
    text: `You are a senior aerospace maintenance analyst. You are reviewing ${chunkLabel} of a maintenance session video. Focus on what you can observe in THIS segment — other segments are being analyzed separately and results will be merged.

Provide:
1. ACTION LOG — Every significant action with timestamps (seconds into this clip)
2. PARTS IDENTIFIED — Part numbers, serial numbers, components with confidence
${procedureInstruction}
4. ANOMALIES — Deviations, safety concerns, damage, missing steps
5. CONFIDENCE — Your confidence in this segment's analysis (0-1)

Return JSON:
{
  "actionLog": [{"timestamp": 0, "action": "string", "details": "string"}],
  "partsIdentified": [{"partNumber": "string", "serialNumber": "string or null", "description": "string", "confidence": 0.95}],
  "procedureSteps": [{"stepNumber": 1, "description": "string", "completed": true, "cmmReference": "section 5.2 or null"}],
  "anomalies": [{"description": "string", "severity": "info|warning|critical", "timestamp": 0}],
  "confidence": 0.9
}

Be thorough — this feeds into FAA compliance documents.`,
  });

  const result = await callWithFallback({
    models: ANNOTATION_MODELS,
    timeoutMs: 60000,
    taskName: `video_map_${chunkLabel}`,
    execute: async (model) => {
      const text = await callGemini({
        model: model.id,
        contents: [{ parts }],
        timeoutMs: 60000,
      });
      try {
        return JSON.parse(text) as DeepAnalysisResult;
      } catch {
        console.error(`[MapReduce] ${chunkLabel} returned non-JSON:`, text?.slice(0, 200));
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
    modelUsed: result.modelUsed.id,
    fallbackUsed: result.fallbackUsed,
  };
}

// Reduce phase — merge chunk results with Pro (text-only, no video).
async function mergeChunkAnalyses(
  chunkResults: Array<{ chunkIndex: number; result: DeepAnalysisResult }>,
  cmmContent?: string,
  expectedSteps?: string
): Promise<
  DeepAnalysisResult & {
    modelUsed: string;
    fallbackUsed: boolean;
    verificationSource: "cmm" | "expected_steps" | "ai_inferred";
  }
> {
  const verificationSource = resolveVerificationSource(cmmContent, expectedSteps);

  const chunksJson = chunkResults
    .map((c) => `--- CHUNK ${c.chunkIndex + 1} ---\n${JSON.stringify(c.result)}`)
    .join("\n\n");

  const promptText = `You are a senior aerospace maintenance analyst. You have analysis results from ${chunkResults.length} consecutive video segments of a single maintenance session. Each was analyzed independently. Timestamps are already adjusted to session-global time.

MERGE RULES:
1. ACTION LOG: Concatenate all entries, sort by timestamp. Remove exact duplicates (same timestamp + same action).
2. PARTS IDENTIFIED: Deduplicate by partNumber. When the same part appears in multiple chunks, keep highest confidence. Merge serialNumber if one chunk found it and another didn't.
3. PROCEDURE STEPS: A step may appear in multiple chunks — that's ONE step, not duplicates. Mark completed=true if ANY chunk reports it completed. Keep the most detailed description and cmmReference. Renumber sequentially.
4. ANOMALIES: Deduplicate semantically similar ones. Keep all unique anomalies with their timestamps.
5. CONFIDENCE: Weighted average of chunk confidences (weight by actionLog length — more observations = more weight).

${cmmContent ? `CMM REFERENCE:\n${cmmContent}\n` : ""}${expectedSteps ? `EXPECTED STEPS:\n${expectedSteps}\n` : ""}
CHUNK RESULTS:
${chunksJson}

Return merged JSON:
{
  "actionLog": [{"timestamp": 0, "action": "string", "details": "string"}],
  "partsIdentified": [{"partNumber": "string", "serialNumber": "string or null", "description": "string", "confidence": 0.95}],
  "procedureSteps": [{"stepNumber": 1, "description": "string", "completed": true, "cmmReference": "section 5.2 or null"}],
  "anomalies": [{"description": "string", "severity": "info|warning|critical", "timestamp": 0}],
  "confidence": 0.9
}`;

  const result = await callWithFallback({
    models: VIDEO_MODELS,
    timeoutMs: 30000,
    taskName: "video_merge",
    execute: async (model) => {
      const text = await callGemini({
        model: model.id,
        contents: [{ parts: [{ text: promptText }] }],
        timeoutMs: 30000,
      });
      try {
        return JSON.parse(text) as DeepAnalysisResult;
      } catch {
        console.error("[MapReduce] Merge returned non-JSON:", text?.slice(0, 200));
        // Fallback: programmatic merge without LLM
        return programmaticMerge(chunkResults);
      }
    },
  });

  return {
    ...result.data,
    modelUsed: result.modelUsed.id,
    fallbackUsed: result.fallbackUsed,
    verificationSource,
  };
}

// Simple programmatic merge as a last resort if the LLM merge fails
function programmaticMerge(
  chunkResults: Array<{ chunkIndex: number; result: DeepAnalysisResult }>
): DeepAnalysisResult {
  const actionLog = chunkResults
    .flatMap((c) => c.result.actionLog)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Dedup parts by partNumber, keep highest confidence
  const partsMap = new Map<string, DeepAnalysisResult["partsIdentified"][0]>();
  for (const chunk of chunkResults) {
    for (const part of chunk.result.partsIdentified) {
      const existing = partsMap.get(part.partNumber);
      if (!existing || part.confidence > existing.confidence) {
        partsMap.set(part.partNumber, {
          ...part,
          serialNumber: part.serialNumber || existing?.serialNumber,
        });
      }
    }
  }

  // Merge procedure steps. When CMM references exist, dedup by cmmReference.
  // Otherwise each chunk numbers steps independently so we just concatenate
  // and renumber to avoid losing genuinely different steps.
  const hasCmmRefs = chunkResults.some((c) =>
    c.result.procedureSteps.some((s) => s.cmmReference)
  );

  let mergedSteps: DeepAnalysisResult["procedureSteps"];
  if (hasCmmRefs) {
    // CMM mode: dedup by cmmReference (stable identifier across chunks)
    const stepsMap = new Map<string, DeepAnalysisResult["procedureSteps"][0]>();
    for (const chunk of chunkResults) {
      for (const step of chunk.result.procedureSteps) {
        const key = step.cmmReference || `step-${step.stepNumber}-${chunk.chunkIndex}`;
        const existing = stepsMap.get(key);
        if (!existing) {
          stepsMap.set(key, step);
        } else {
          stepsMap.set(key, {
            ...existing,
            completed: existing.completed || step.completed,
            cmmReference: existing.cmmReference || step.cmmReference,
            description: step.description.length > existing.description.length
              ? step.description
              : existing.description,
          });
        }
      }
    }
    mergedSteps = Array.from(stepsMap.values()).sort((a, b) => a.stepNumber - b.stepNumber);
  } else {
    // No CMM: each chunk inferred steps independently — concatenate and renumber
    mergedSteps = chunkResults
      .flatMap((c) => c.result.procedureSteps)
      .map((step, i) => ({ ...step, stepNumber: i + 1 }));
  }

  const anomalies = chunkResults.flatMap((c) => c.result.anomalies);

  // Weighted average confidence
  let totalWeight = 0;
  let weightedSum = 0;
  for (const chunk of chunkResults) {
    const weight = Math.max(1, chunk.result.actionLog.length);
    weightedSum += chunk.result.confidence * weight;
    totalWeight += weight;
  }

  return {
    actionLog,
    partsIdentified: Array.from(partsMap.values()),
    procedureSteps: mergedSteps,
    anomalies,
    confidence: totalWeight > 0 ? weightedSum / totalWeight : 0,
  };
}

// Orchestrator — runs map phase in parallel, then reduce phase
export interface MapReduceChunk {
  evidenceId: string;
  fileUri: string;
  mimeType: string;
  offsetSeconds: number;
}

export interface MapReduceResult {
  result: DeepAnalysisResult;
  verificationSource: "cmm" | "expected_steps" | "ai_inferred";
  chunkModels: Array<{ evidenceId: string; model: string; fallbackUsed: boolean }>;
  mergeModel: string;
  mergeFallbackUsed: boolean;
  chunksSucceeded: number;
  chunksFailed: number;
}

export async function analyzeVideoChunksMapReduce(
  chunks: MapReduceChunk[],
  cmmContent?: string,
  expectedSteps?: string
): Promise<MapReduceResult> {
  const totalChunks = chunks.length;

  // ── Map phase: analyze each chunk with Flash in parallel ──
  console.log(`[MapReduce] Starting map phase: ${totalChunks} chunks`);
  const mapStart = Date.now();

  const mapResults = await Promise.allSettled(
    chunks.map(async (chunk, i) => {
      const label = `chunk ${i + 1}/${totalChunks}`;
      const analysis = await analyzeVideoChunkWithFlash(
        chunk.fileUri,
        chunk.mimeType,
        label,
        cmmContent,
        expectedSteps
      );

      // Apply timestamp offset so all timestamps are session-global
      const offsetResult: DeepAnalysisResult = {
        ...analysis,
        actionLog: analysis.actionLog.map((entry) => ({
          ...entry,
          timestamp: entry.timestamp + chunk.offsetSeconds,
        })),
        anomalies: analysis.anomalies.map((a) => ({
          ...a,
          timestamp: a.timestamp != null ? a.timestamp + chunk.offsetSeconds : undefined,
        })),
      };

      return {
        chunkIndex: i,
        evidenceId: chunk.evidenceId,
        result: offsetResult,
        modelUsed: analysis.modelUsed,
        fallbackUsed: analysis.fallbackUsed,
      };
    })
  );

  const succeeded: Array<{
    chunkIndex: number;
    evidenceId: string;
    result: DeepAnalysisResult;
    modelUsed: string;
    fallbackUsed: boolean;
  }> = [];
  for (const r of mapResults) {
    if (r.status === "fulfilled") succeeded.push(r.value);
  }

  const failed = mapResults.filter((r) => r.status === "rejected");

  console.log(
    `[MapReduce] Map phase done in ${Date.now() - mapStart}ms: ${succeeded.length}/${totalChunks} succeeded`
  );

  if (succeeded.length === 0) {
    const reasons = failed.map((r) => (r as PromiseRejectedResult).reason);
    throw new Error(`All ${totalChunks} video chunks failed: ${reasons.map(String).join("; ")}`);
  }

  const chunkModels = succeeded.map((s) => ({
    evidenceId: s.evidenceId,
    model: s.modelUsed,
    fallbackUsed: s.fallbackUsed,
  }));

  // ── Short-circuit for single success — no merge needed ──
  if (succeeded.length === 1) {
    const only = succeeded[0];
    return {
      result: only.result,
      verificationSource: resolveVerificationSource(cmmContent, expectedSteps),
      chunkModels,
      mergeModel: only.modelUsed,
      mergeFallbackUsed: false,
      chunksSucceeded: 1,
      chunksFailed: failed.length,
    };
  }

  // ── Reduce phase: merge with Pro (text-only) ──
  console.log(`[MapReduce] Starting reduce phase: merging ${succeeded.length} chunk results`);
  const mergeStart = Date.now();

  const merged = await mergeChunkAnalyses(
    succeeded.map((s) => ({ chunkIndex: s.chunkIndex, result: s.result })),
    cmmContent,
    expectedSteps
  );

  console.log(`[MapReduce] Reduce phase done in ${Date.now() - mergeStart}ms`);

  return {
    result: merged,
    verificationSource: merged.verificationSource,
    chunkModels,
    mergeModel: merged.modelUsed,
    mergeFallbackUsed: merged.fallbackUsed,
    chunksSucceeded: succeeded.length,
    chunksFailed: failed.length,
  };
}
