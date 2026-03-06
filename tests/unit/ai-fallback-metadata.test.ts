import { beforeEach, describe, expect, it, vi } from "vitest";

const callWithFallbackMock = vi.hoisted(() => vi.fn());
const callOpenAIMock = vi.hoisted(() => vi.fn());
const callGeminiMock = vi.hoisted(() => vi.fn());
const callAnthropicMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/provider", () => ({
  callWithFallback: callWithFallbackMock,
  callOpenAI: callOpenAIMock,
  callGemini: callGeminiMock,
  callAnthropic: callAnthropicMock,
}));

describe("AI fallback metadata", () => {
  beforeEach(() => {
    callWithFallbackMock.mockReset();
    callOpenAIMock.mockReset();
    callGeminiMock.mockReset();
    callAnthropicMock.mockReset();
  });

  it("preserves live fallback usage for document generation", async () => {
    callWithFallbackMock.mockResolvedValue({
      data: {
        documents: [],
        summary: "ok",
      },
      modelUsed: { id: "claude-sonnet-4-6-20250217" },
      fallbackLevel: 1,
      latencyMs: 123,
      fallbackUsed: true,
      cachedFallback: false,
    });

    const { generateDocuments } = await import("@/lib/ai/openai");
    const result = await generateDocuments({
      photoExtractions: [],
      videoAnalysis: null,
      videoAnnotations: [],
      audioTranscript: null,
    });

    expect(result.modelUsed).toBe("claude-sonnet-4-6-20250217");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBeUndefined();
  });

  it("preserves live fallback usage for image OCR", async () => {
    callWithFallbackMock.mockResolvedValue({
      data: {
        partNumber: "881700-1001",
        serialNumber: "SN-TEST",
        description: "Pump",
        manufacturer: "Parker",
        allText: ["881700-1001"],
        confidence: 0.9,
        notes: "",
        model: "gpt-4o",
      },
      modelUsed: { id: "gpt-4o" },
      fallbackLevel: 1,
      latencyMs: 55,
      fallbackUsed: true,
      cachedFallback: false,
    });

    const { analyzeImageWithFallback } = await import("@/lib/ai/openai");
    const result = await analyzeImageWithFallback({
      imageBase64: "data:image/jpeg;base64,ZmFrZQ==",
      mimeType: "image/jpeg",
    });

    expect(result.model).toBe("gpt-4o");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBeUndefined();
  });

  it("preserves live fallback usage for session video analysis", async () => {
    callWithFallbackMock.mockResolvedValue({
      data: {
        actionLog: [],
        partsIdentified: [],
        procedureSteps: [],
        anomalies: [],
        confidence: 0.72,
      },
      modelUsed: { id: "gemini-3.1-flash" },
      fallbackLevel: 1,
      latencyMs: 250,
      fallbackUsed: true,
      cachedFallback: false,
    });

    const { analyzeSessionVideo } = await import("@/lib/ai/gemini");
    const result = await analyzeSessionVideo("gs://video", "video/mp4");

    expect(result.modelUsed).toBe("gemini-3.1-flash");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBeUndefined();
  });
});
