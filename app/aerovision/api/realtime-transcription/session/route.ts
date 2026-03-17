// POST /api/realtime-transcription/session — Issue an ephemeral OpenAI Realtime API key
// The browser uses this short-lived token to connect directly to OpenAI's
// Realtime WebSocket for live transcription. Our real API key never leaves the server.
// Also returns the recommended session config (model, VAD, aerospace vocabulary).
// Protected by dashboard auth (passcode cookie).

import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/db";
import { AEROSPACE_VOCABULARY_PROMPT } from "@/lib/ai/openai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Check dashboard auth
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Verify the CaptureSession exists and is in a usable state
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "CaptureSession not found" },
        { status: 404 }
      );
    }

    const activeStatuses = new Set(["capturing", "processing", "documents_generated"]);
    if (!activeStatuses.has(session.status)) {
      return NextResponse.json(
        { success: false, error: `Session is in '${session.status}' state — cannot start live transcription` },
        { status: 409 }
      );
    }

    // Request an ephemeral token from OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const tokenResponse = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-transcribe",
        // We only need transcription, not a full conversation
        modalities: ["text"],
        input_audio_transcription: {
          model: "gpt-4o-transcribe",
          prompt: AEROSPACE_VOCABULARY_PROMPT,
          language: "en",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          silence_duration_ms: 2000,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text().catch(() => "");
      console.error(`OpenAI ephemeral token error (${tokenResponse.status}): ${errText.slice(0, 300)}`);
      return NextResponse.json(
        { success: false, error: "Failed to create ephemeral token from OpenAI" },
        { status: 502 }
      );
    }

    const tokenData = await tokenResponse.json();

    // Return the ephemeral key and config the browser needs to connect
    return NextResponse.json({
      success: true,
      data: {
        // The short-lived token the browser uses to open the WebSocket
        ephemeralKey: tokenData.client_secret?.value ?? tokenData.client_secret,
        // Where the browser connects
        websocketUrl: "wss://api.openai.com/v1/realtime?model=gpt-4o-transcribe",
        // Session config for reference (already baked into the token, but useful for the client)
        config: {
          model: "gpt-4o-transcribe",
          language: "en",
          aerospaceVocabularyPrompt: AEROSPACE_VOCABULARY_PROMPT,
          turnDetection: {
            type: "server_vad",
            silenceDurationMs: 2000,
          },
        },
        sessionId: session.id,
      },
    });
  } catch (error) {
    console.error("Realtime transcription session error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create transcription session" },
      { status: 500 }
    );
  }
}
