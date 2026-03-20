// Quick script to reprocess all sessions with the improved extraction pipeline.
// Run with: npx tsx scripts/reprocess-sessions.ts
//
// This runs locally against the production database, bypassing the Vercel
// deployment entirely. It uses the same extraction code as the API endpoints.

import { prisma } from "../lib/db";
import { correctTranscriptSegment } from "../lib/ai/transcript-correction";
import {
  extractMeasurementsFromTranscript,
  getExtractionContext,
  reconcileSessionMeasurements,
} from "../lib/ai/measurement-extraction";
import { getOrgInstructions } from "../lib/ai/org-context";

async function reprocessSession(sessionId: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Reprocessing session: ${sessionId}`);
  console.log("=".repeat(60));

  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    console.log("  Session not found, skipping");
    return;
  }

  // Load org instructions
  const orgInstructions = session.organizationId
    ? await getOrgInstructions(session.organizationId)
    : null;

  // Load document context
  const documentContext = await getExtractionContext(sessionId);
  console.log(`  Document context: ${documentContext.length > 0 ? `${documentContext.length} chars` : "none"}`);

  // Fetch all audio chunks
  const audioChunks = await prisma.captureEvidence.findMany({
    where: { sessionId, type: "AUDIO_CHUNK" },
    orderBy: { capturedAt: "asc" },
    select: {
      id: true,
      transcription: true,
      capturedAt: true,
      durationSeconds: true,
    },
  });
  console.log(`  Audio chunks: ${audioChunks.length}`);

  if (audioChunks.length === 0) {
    console.log("  No audio chunks, skipping");
    return;
  }

  // Delete existing measurements
  const deleted = await prisma.measurement.deleteMany({
    where: { captureSessionId: sessionId },
  });
  console.log(`  Deleted ${deleted.count} existing measurements`);

  // Temporarily set session to "capturing" for recordMeasurement
  const originalStatus = session.status;
  await prisma.captureSession.update({
    where: { id: sessionId },
    data: { status: "capturing" },
  });

  let totalMeasurements = 0;

  try {
    // Process each chunk
    for (let i = 0; i < audioChunks.length; i++) {
      const chunk = audioChunks[i];
      let correctedText = chunk.transcription || "";

      if (!correctedText) continue;

      // Re-run LLM correction
      try {
        correctedText = await correctTranscriptSegment(correctedText, orgInstructions);
        await prisma.captureEvidence.update({
          where: { id: chunk.id },
          data: { transcription: correctedText },
        });
      } catch (e) {
        console.error(`  Correction failed for chunk ${i + 1}:`, e);
      }

      // Build prior context (up to 2000 words)
      const priorTranscripts = audioChunks
        .slice(0, i)
        .filter((c) => c.transcription)
        .map((c) => c.transcription!)
        .join(" ");
      const priorWords = priorTranscripts.split(/\s+/);
      const priorContext =
        priorWords.length > 2000
          ? priorWords.slice(-2000).join(" ")
          : priorTranscripts;

      // Extract measurements with document context
      const extracted = await extractMeasurementsFromTranscript(
        correctedText,
        [],
        priorContext || undefined,
        orgInstructions,
        documentContext || undefined
      );

      // Record measurements directly in DB (bypass recordMeasurement to avoid status check issues)
      for (const m of extracted) {
        const lastMeasurement = await prisma.measurement.findFirst({
          where: { captureSessionId: sessionId },
          orderBy: { sequenceInShift: "desc" },
          select: { sequenceInShift: true },
        });
        const nextSequence = (lastMeasurement?.sequenceInShift ?? 0) + 1;
        const isGenericName = /unknown|unspecified|parameter/i.test(m.parameterName);

        await prisma.measurement.create({
          data: {
            captureSessionId: sessionId,
            measurementType: m.measurementType,
            parameterName: m.parameterName,
            value: m.value,
            unit: m.unit,
            confidence: m.confidence,
            corroborationLevel: "single",
            status: isGenericName ? "flagged" : "pending",
            flagReason: isGenericName
              ? "Needs label — the AI couldn't determine what this measurement refers to"
              : null,
            sequenceInShift: nextSequence,
            measuredAt: chunk.capturedAt || new Date(),
            sources: {
              create: {
                sourceType: "audio_callout",
                value: m.value,
                unit: m.unit,
                confidence: m.confidence,
                rawExcerpt: m.rawExcerpt || null,
                captureEvidenceId: chunk.id,
              },
            },
          },
        });
        totalMeasurements++;
      }

      // Update local array for next iteration
      audioChunks[i] = { ...chunk, transcription: correctedText };
      console.log(`  Chunk ${i + 1}/${audioChunks.length}: ${extracted.length} measurements extracted`);
    }

    // Run reconciliation on the full stitched transcript
    const fullTranscript = audioChunks
      .filter((c) => c.transcription)
      .map((c) => {
        const offset = c.capturedAt && audioChunks[0].capturedAt
          ? (c.capturedAt.getTime() - audioChunks[0].capturedAt.getTime()) / 1000
          : 0;
        const minutes = Math.floor(offset / 60);
        const seconds = Math.floor(offset % 60);
        return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}] ${c.transcription}`;
      })
      .join("\n");

    console.log("  Running reconciliation pass...");
    const reconciliation = await reconcileSessionMeasurements(sessionId, fullTranscript);
    console.log(`  Reconciliation: added=${reconciliation.added}, renamed=${reconciliation.renamed}, flagged=${reconciliation.flagged}, skipped=${reconciliation.skipped}`);

    totalMeasurements += reconciliation.added;
  } finally {
    // Restore original status
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: originalStatus },
    });
  }

  console.log(`  Total measurements: ${totalMeasurements}`);
  return totalMeasurements;
}

async function main() {
  console.log("Finding sessions with audio evidence...\n");

  const sessions = await prisma.captureSession.findMany({
    where: {
      evidence: { some: { type: "AUDIO_CHUNK" } },
    },
    select: {
      id: true,
      description: true,
      status: true,
      startedAt: true,
      _count: { select: { evidence: { where: { type: "AUDIO_CHUNK" } } } },
    },
    orderBy: { startedAt: "desc" },
  });

  console.log(`Found ${sessions.length} session(s) with audio:\n`);
  for (const s of sessions) {
    console.log(`  ${s.id} — ${s.description || "(no description)"} — ${s._count.evidence} chunks — ${s.status}`);
  }

  let totalMeasurements = 0;
  for (const session of sessions) {
    try {
      const count = await reprocessSession(session.id);
      totalMeasurements += count || 0;
    } catch (error) {
      console.error(`\n  ERROR on session ${session.id}:`, error);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`DONE — ${sessions.length} sessions reprocessed, ${totalMeasurements} total measurements`);
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
