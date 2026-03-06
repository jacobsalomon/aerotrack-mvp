// Centralized model registry — update model IDs here when new versions release
// Last updated: March 2026

export type AIProvider = "google" | "openai" | "anthropic" | "openrouter" | "groq";

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
    id: "gemini-3.1-pro-preview",
    provider: "google",
    displayName: "Gemini 3.1 Pro Preview",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    contextWindow: 2_000_000,
    supportsVideo: true,
    supportsJsonOutput: true,
  },
  {
    id: "gemini-3.1-flash",
    provider: "google",
    displayName: "Gemini 3.1 Flash",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.5,
    contextWindow: 1_000_000,
    supportsVideo: true,
    supportsJsonOutput: true,
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    displayName: "Gemini 2.5 Flash (legacy fallback)",
    inputCostPer1M: 0.30,
    outputCostPer1M: 2.5,
    contextWindow: 1_000_000,
    supportsVideo: true,
    supportsJsonOutput: true,
  },
];

// ── Video Annotation Models (real-time lightweight tagging) ──────────
export const ANNOTATION_MODELS: ModelConfig[] = [
  {
    id: "gemini-3.1-flash",
    provider: "google",
    displayName: "Gemini 3.1 Flash",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.5,
    contextWindow: 1_000_000,
    supportsVideo: true,
    supportsJsonOutput: true,
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    displayName: "Gemini 2.5 Flash (legacy fallback)",
    inputCostPer1M: 0.30,
    outputCostPer1M: 2.5,
    contextWindow: 1_000_000,
    supportsVideo: true,
    supportsJsonOutput: true,
  },
];

// ── Audio Transcription Models ──────────────────────────────────────
export const TRANSCRIPTION_MODELS: ModelConfig[] = [
  {
    id: "gpt-4o-transcribe",
    provider: "openai",
    displayName: "GPT-4o Transcribe (~2.5% WER)",
    inputCostPer1M: 6.0, // $0.006/min ≈ $6/M tokens
    outputCostPer1M: 0,
    contextWindow: 0, // Audio, not token-based
    supportsAudio: true,
  },
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

// ── Photo OCR Models ────────────────────────────────────────────────
export const OCR_MODELS: ModelConfig[] = [
  {
    id: "gpt-5.4",
    provider: "openai",
    displayName: "GPT-5.4",
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.0,
    contextWindow: 1_000_000,
    supportsImages: true,
    supportsJsonOutput: true,
  },
  {
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.0,
    contextWindow: 128_000,
    supportsImages: true,
    supportsJsonOutput: true,
  },
  {
    id: "gemini-3.1-flash",
    provider: "google",
    displayName: "Gemini 3.1 Flash (fallback OCR)",
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
    contextWindow: 1_000_000,
    supportsJsonOutput: true,
  },
  {
    id: "claude-sonnet-4-6-20250217",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 1_000_000,
    supportsJsonOutput: true,
  },
  {
    id: "gemini-3.1-pro-preview",
    provider: "google",
    displayName: "Gemini 3.1 Pro Preview (fallback generation)",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    contextWindow: 2_000_000,
    supportsJsonOutput: true,
  },
];

// ── Document Verification Models ────────────────────────────────────
export const VERIFICATION_MODELS: ModelConfig[] = [
  {
    id: "claude-sonnet-4-6-20250217",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 1_000_000,
    supportsJsonOutput: true,
  },
  {
    id: "gpt-5.4",
    provider: "openai",
    displayName: "GPT-5.4 (fallback verification)",
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.0,
    contextWindow: 1_000_000,
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
  };
  return bases[provider];
}
