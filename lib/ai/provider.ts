// Resilient AI provider — tries the best model first, falls back automatically
// Every AI call in the pipeline goes through this layer

import { type ModelConfig, type AIProvider, getApiKey, getApiBase } from "./models";

// ── Types ───────────────────────────────────────────────────────────

export interface CallResult<T> {
  data: T;
  modelUsed: ModelConfig;
  fallbackLevel: number;    // 0 = primary, 1 = first fallback, etc.
  latencyMs: number;
  fallbackUsed: boolean;
  cachedFallback: boolean;  // True if we had to use pre-cached data
}

export interface CallLog {
  model: string;
  provider: AIProvider;
  latencyMs: number;
  success: boolean;
  error?: string;
  fallbackLevel: number;
}

// Keep a log of all calls for debugging/reporting
const callHistory: CallLog[] = [];

export function getCallHistory(): CallLog[] {
  return [...callHistory];
}

export function clearCallHistory(): void {
  callHistory.length = 0;
}

// ── Core: call with fallback chain ──────────────────────────────────

// Generic fallback wrapper — tries each model in order until one succeeds
// If all models fail and a cachedFallback is provided, returns that instead of throwing
export async function callWithFallback<T>(opts: {
  models: ModelConfig[];
  timeoutMs?: number;
  cachedFallback?: T;
  taskName: string; // For logging (e.g., "video_analysis", "document_generation")
  execute: (model: ModelConfig) => Promise<T>;
}): Promise<CallResult<T>> {
  const { models, timeoutMs = 30000, cachedFallback, taskName, execute } = opts;
  const errors: string[] = []; // Collect all errors for the final error message

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const start = Date.now();

    try {
      // Race the execution against a timeout
      const result = await Promise.race([
        execute(model),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      const latencyMs = Date.now() - start;

      // Log success
      const log: CallLog = {
        model: model.id,
        provider: model.provider,
        latencyMs,
        success: true,
        fallbackLevel: i,
      };
      callHistory.push(log);
      if (callHistory.length > 200) callHistory.splice(0, callHistory.length - 200);

      console.log(
        `[AI] ${taskName} succeeded with ${model.displayName} in ${latencyMs}ms` +
          (i > 0 ? ` (fallback level ${i})` : "")
      );

      return {
        data: result,
        modelUsed: model,
        fallbackLevel: i,
        latencyMs,
        fallbackUsed: i > 0,
        cachedFallback: false,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Log failure
      const log: CallLog = {
        model: model.id,
        provider: model.provider,
        latencyMs,
        success: false,
        error: errorMsg,
        fallbackLevel: i,
      };
      callHistory.push(log);
      if (callHistory.length > 200) callHistory.splice(0, callHistory.length - 200);

      errors.push(`${model.id}: ${errorMsg.slice(0, 150)}`);
      console.warn(
        `[AI] ${taskName} failed with ${model.displayName} (${latencyMs}ms): ${errorMsg}` +
          (i < models.length - 1
            ? ` — trying ${models[i + 1].displayName}`
            : cachedFallback !== undefined
            ? " — using cached fallback"
            : " — no more fallbacks")
      );
    }
  }

  // All models failed — use cached fallback if available
  if (cachedFallback !== undefined) {
    console.warn(`[AI] ${taskName}: all ${models.length} models failed — using cached fallback`);

    const log: CallLog = {
      model: "cached_fallback",
      provider: "openai", // Placeholder
      latencyMs: 0,
      success: true,
      fallbackLevel: models.length,
    };
    callHistory.push(log);
    if (callHistory.length > 200) callHistory.splice(0, callHistory.length - 200);

    return {
      data: cachedFallback,
      modelUsed: models[0], // Report primary model
      fallbackLevel: models.length,
      latencyMs: 0,
      fallbackUsed: true,
      cachedFallback: true,
    };
  }

  throw new Error(
    `[AI] ${taskName}: all ${models.length} models failed. Errors: ${errors.join(" | ")}`
  );
}

// ── Provider-specific API helpers ───────────────────────────────────

// Call Google Gemini API (for video analysis, annotations, OCR)
export async function callGemini(opts: {
  model: string;
  contents: unknown[];
  generationConfig?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = getApiKey("google");
  const base = getApiBase("google");

  const response = await fetch(
    `${base}/v1beta/models/${opts.model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs || 60000),
      body: JSON.stringify({
        contents: opts.contents,
        generationConfig: opts.generationConfig || {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

// Call OpenAI chat completions API (for doc generation, OCR, verification)
export async function callOpenAI(opts: {
  model: string;
  messages: Array<{ role: string; content: string | unknown[] }>;
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = getApiKey("openai");
  const base = getApiBase("openai");

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens || 4000,
    temperature: 0.2,
  };

  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(opts.timeoutMs || 30000),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");
  return content;
}

// Call Anthropic Claude API directly (for verification, generation fallback)
export async function callAnthropic(opts: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = getApiKey("anthropic");
  const base = getApiBase("anthropic");

  const response = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(opts.timeoutMs || 30000),
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens || 4000,
      temperature: opts.temperature ?? 0.2,
      system: opts.system,
      messages: opts.messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text;
  if (!content) throw new Error("Empty response from Anthropic");
  return content;
}
