import { NextRequest, NextResponse } from "next/server";

// This API route takes raw voice transcriptions from a mechanic and structures
// them into maintenance findings. This powers the "live findings summary"
// during the capture workflow. Uses Claude API (Haiku for speed) if available,
// otherwise returns realistic mock structured findings.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const transcription = body.transcription || "";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey && transcription.trim()) {
    // ── REAL AI STRUCTURING ──
    // Uses Haiku for speed — findings should update within 1-2 seconds
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `You are an aerospace maintenance assistant. A mechanic is dictating observations while working on a component. Structure their speech into maintenance findings.

For each distinct finding or observation, extract:
- component: the component/area described
- observation: what they saw or measured
- cmmReference: CMM reference if mentioned, otherwise null
- disposition: SERVICEABLE / REPLACE / REPAIR / MONITOR / UNKNOWN
- measurements: { parameter, value, spec, passFail } if any, otherwise null
- type: FINDING or ACTION (ACTION if they're just narrating what they're doing)

Input transcription: "${transcription}"

Return ONLY a JSON array of findings (no markdown code fences). If the speech is empty or unclear, return an empty array [].`,
            },
          ],
        }),
      });

      const aiResult = await response.json();
      const textContent = aiResult.content?.[0]?.text || "[]";

      try {
        return NextResponse.json(JSON.parse(textContent));
      } catch {
        // If parsing fails, wrap it as a single finding
        return NextResponse.json([
          {
            component: "General",
            observation: textContent,
            cmmReference: null,
            disposition: "UNKNOWN",
            measurements: null,
            type: "FINDING",
          },
        ]);
      }
    } catch (error) {
      console.error("AI voice structuring failed, falling back to mock:", error);
    }
  }

  // ── MOCK STRUCTURING ──
  // Parse simple patterns from the transcription text to create findings
  if (!transcription.trim()) {
    return NextResponse.json([]);
  }

  // Split on sentences and create a finding for each
  const sentences = transcription
    .split(/[.!?]+/)
    .map((s: string) => s.trim())
    .filter(Boolean);

  const mockFindings = sentences.map((sentence: string, i: number) => {
    // Simple keyword detection for disposition
    let disposition = "UNKNOWN";
    const lower = sentence.toLowerCase();
    if (lower.includes("replace") || lower.includes("worn") || lower.includes("degraded")) {
      disposition = "REPLACE";
    } else if (lower.includes("serviceable") || lower.includes("within limits") || lower.includes("good")) {
      disposition = "SERVICEABLE";
    } else if (lower.includes("repair") || lower.includes("rework")) {
      disposition = "REPAIR";
    } else if (lower.includes("monitor") || lower.includes("watch")) {
      disposition = "MONITOR";
    }

    // Detect if this is an action vs a finding
    const actionKeywords = [
      "removing",
      "installing",
      "cleaning",
      "applying",
      "torquing",
      "reassembling",
      "disassembling",
    ];
    const isAction = actionKeywords.some((kw) => lower.includes(kw));

    return {
      component: "General assembly",
      observation: sentence,
      cmmReference: null,
      disposition: isAction ? "N/A" : disposition,
      measurements: null,
      type: isAction ? "ACTION" : "FINDING",
      _index: i,
    };
  });

  return NextResponse.json(mockFindings);
}
