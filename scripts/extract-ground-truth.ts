// Extract session data for ground truth fixture
// Usage: set -a && source .env.production && set +a && npx tsx scripts/extract-ground-truth.ts

import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const SESSION_ID = "cmmydgw4f000004l492wen6bs";

async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const session = await prisma.captureSession.findUnique({
    where: { id: SESSION_ID },
    include: {
      evidence: { orderBy: { createdAt: "asc" } },
      measurements: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) {
    console.log("Session not found");
    return;
  }

  console.log(
    JSON.stringify(
      {
        session: {
          id: session.id,
          componentId: session.componentId,
          status: session.status,
          evidenceCount: session.evidence.length,
          measurementCount: session.measurements.length,
        },
        audio: session.evidence
          .filter((e) => e.type === "voice_note")
          .map((e) => ({
            id: e.id,
            transcription: e.transcription,
          })),
        measurements: session.measurements.map((m) => ({
          id: m.id,
          parameterName: m.parameterName,
          value: m.value,
          unit: m.unit,
          status: m.status,
          flagReason: m.flagReason,
        })),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(console.error);
