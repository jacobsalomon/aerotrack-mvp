// Centralized model registry — update model IDs here when new versions release
// Last updated: March 2026 — upgraded GPT-4o → GPT-5.4 across all chains

export type AIProvider = "google" | "openai" | "anthropic" | "openrouter" | "groq" | "elevenlabs";

export interface ModelConfig {
  id: string;           // Model ID as the API expects it
  provider: AIProvider;
  displayName: string;  // Human-readable name for logs
  inputCostPer1M: number;  // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  contextWindow: number;   // Max tokens
  supportsVideo?: boolean;
  supportsAudio?: boolean;
  supportsImages?: boolean;
  supportsJsonOutput?: boolean;
}

// ── Video Analysis Models (native video understanding) ──────────────
export const VIDEO_MODELS: ModelConfig[] = [
  {
    id: "gemini-2.5-pro",
    provider: "google",
    displayName: "Gemini 2.5 Pro",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    contextWindow: 1_000_000,
    supportsVideo: true,
    supportsJsonOutput: true,
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    displayName: "Gemini 2.5 Flash",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.5,
    contextWindow: 1_000_000,
    supportsVideo: true,
    supportsJsonOutput: true,
  },
];

// ── Video Annotation Models (real-time lightweight tagging) ──────────
export const ANNOTATION_MODELS: ModelConfig[] = [
  {
    id: "gemini-2.5-flash",
    provider: "google",
    displayName: "Gemini 2.5 Flash",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.5,
    contextWindow: 1_000_000,
    supportsVideo: true,
    supportsJsonOutput: true,
  },
];

// ── Audio Transcription Models ──────────────────────────────────────
// ElevenLabs Scribe v2 is primary — best accuracy with keyterm prompting
export const TRANSCRIPTION_MODELS: ModelConfig[] = [
  {
    id: "scribe_v2",
    provider: "elevenlabs",
    displayName: "ElevenLabs Scribe v2",
    inputCostPer1M: 3.0, // ~$0.003/min
    outputCostPer1M: 0,
    contextWindow: 0,
    supportsAudio: true,
  },
  {
    id: "gpt-4o-transcribe",
    provider: "openai",
    displayName: "GPT-4o Transcribe (~2.5% WER)",
    inputCostPer1M: 6.0,
    outputCostPer1M: 0,
    contextWindow: 0,
    supportsAudio: true,
  },
  // NOTE: keeping gpt-4o-transcribe models — OpenAI's transcription models are
  // separate from the chat/generation line and haven't been updated to 5.x yet
  {
    id: "gpt-4o-mini-transcribe",
    provider: "openai",
    displayName: "GPT-4o Mini Transcribe (~4% WER)",
    inputCostPer1M: 3.0,
    outputCostPer1M: 0,
    contextWindow: 0,
    supportsAudio: true,
  },
];

// ── Transcript Correction Models (lightweight LLMs for post-processing) ──
export const CORRECTION_MODELS: ModelConfig[] = [
  {
    id: "gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o Mini (correction)",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    contextWindow: 128_000,
    supportsJsonOutput: true,
  },
  {
    id: "claude-sonnet-4-6-20250514",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6 (fallback correction)",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 200_000,
    supportsJsonOutput: true,
  },
];

// ── Photo OCR Models ────────────────────────────────────────────────
export const OCR_MODELS: ModelConfig[] = [
  {
    id: "gpt-5.4",
    provider: "openai",
    displayName: "GPT-5.4",
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.0,
    contextWindow: 128_000,
    supportsImages: true,
    supportsJsonOutput: true,
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    displayName: "Gemini 2.5 Flash (fallback OCR)",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.5,
    contextWindow: 1_000_000,
    supportsImages: true,
    supportsJsonOutput: true,
  },
];

// ── Document Generation Models ──────────────────────────────────────
export const GENERATION_MODELS: ModelConfig[] = [
  {
    id: "gpt-5.4",
    provider: "openai",
    displayName: "GPT-5.4",
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.0,
    contextWindow: 128_000,
    supportsJsonOutput: true,
  },
  {
    id: "claude-sonnet-4-6-20250514",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 200_000,
    supportsJsonOutput: true,
  },
  {
    id: "gemini-2.5-pro",
    provider: "google",
    displayName: "Gemini 2.5 Pro (fallback generation)",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    contextWindow: 1_000_000,
    supportsJsonOutput: true,
  },
];

// ── Document Verification Models ────────────────────────────────────
export const VERIFICATION_MODELS: ModelConfig[] = [
  {
    id: "claude-sonnet-4-6-20250514",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 200_000,
    supportsJsonOutput: true,
  },
  {
    id: "gpt-5.4",
    provider: "openai",
    displayName: "GPT-5.4 (fallback verification)",
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.0,
    contextWindow: 128_000,
    supportsJsonOutput: true,
  },
];

// ── Helper to get API key for a provider ────────────────────────────
export function getApiKey(provider: AIProvider): string {
  const keyMap: Record<AIProvider, string> = {
    google: "GOOGLE_AI_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    groq: "GROQ_API_KEY",
    elevenlabs: "ELEVENLABS_API_KEY",
  };

  const envVar = keyMap[provider];
  const key = process.env[envVar];
  if (!key) throw new Error(`${envVar} is not set`);
  return key;
}

// ── Helper to get API base URL for a provider ───────────────────────
export function getApiBase(provider: AIProvider): string {
  const bases: Record<AIProvider, string> = {
    google: "https://generativelanguage.googleapis.com",
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    groq: "https://api.groq.com/openai/v1",
    elevenlabs: "https://api.elevenlabs.io/v1",
  };
  return bases[provider];
}
