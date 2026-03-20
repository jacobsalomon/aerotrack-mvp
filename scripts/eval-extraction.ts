// Evaluate measurement extraction accuracy against ground truth
// Compares current DB measurements for a session against the manually verified fixture
//
// Usage: set -a && source .env.production && set +a && npx tsx scripts/eval-extraction.ts

import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as fs from "fs";
import * as path from "path";

// ── Load ground truth ──────────────────────────────────────────────
const fixturePath = path.join(
  __dirname,
  "../tests/fixtures/ground-truth-session.json"
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
const SESSION_ID = fixture.sessionId;
const GROUND_TRUTH = fixture.groundTruth.measurements;
const VALUE_TOLERANCE = fixture.tolerances.valueMatch;

// ── Fuzzy name matching ────────────────────────────────────────────
// Simple word overlap similarity — good enough for measurement names
function nameSimilarity(a: string, b: string): number {
  const wordsA = a.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/);
  const wordsB = b.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/);
  // Remove common filler words
  const stopWords = new Set(["the", "a", "an", "of", "at", "in", "for", "is"]);
  const filteredA = wordsA.filter((w) => !stopWords.has(w) && w.length > 1);
  const filteredB = wordsB.filter((w) => !stopWords.has(w) && w.length > 1);

  if (filteredA.length === 0 || filteredB.length === 0) return 0;

  const setA = new Set(filteredA);
  const setB = new Set(filteredB);
  const intersection = Array.from(setA).filter((w) => setB.has(w));
  // Jaccard similarity
  const union = new Set(Array.from(setA).concat(Array.from(setB)));
  return intersection.length / union.size;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  // Fetch current AI-extracted measurements from DB
  const dbMeasurements = await prisma.measurement.findMany({
    where: { captureSessionId: SESSION_ID },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n========================================");
  console.log("  MEASUREMENT EXTRACTION EVAL REPORT");
  console.log("========================================\n");
  console.log(`Session: ${SESSION_ID}`);
  console.log(`Ground truth measurements: ${GROUND_TRUTH.length}`);
  console.log(`AI-extracted measurements: ${dbMeasurements.length}`);
  console.log("");

  // Match each ground truth measurement to the best DB match
  const matched: {
    truth: (typeof GROUND_TRUTH)[0];
    extracted: (typeof dbMeasurements)[0] | null;
    nameScore: number;
    valueMatch: boolean;
  }[] = [];
  const usedDbIds = new Set<string>();

  for (const truth of GROUND_TRUTH) {
    let bestMatch: (typeof dbMeasurements)[0] | null = null;
    let bestScore = 0;

    for (const dbm of dbMeasurements) {
      if (usedDbIds.has(dbm.id)) continue;

      const nameScore = nameSimilarity(truth.parameterName, dbm.parameterName);
      const valueExact = Math.abs(truth.value - dbm.value) <= VALUE_TOLERANCE;

      // Score: name similarity + big bonus for value match
      const score = nameScore + (valueExact ? 1.0 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = dbm;
      }
    }

    // Accept match if value matches OR name is close enough
    const nameScore = bestMatch
      ? nameSimilarity(truth.parameterName, bestMatch.parameterName)
      : 0;
    const valueMatch = bestMatch
      ? Math.abs(truth.value - bestMatch.value) <= VALUE_TOLERANCE
      : false;

    if (bestMatch && (valueMatch || nameScore >= 0.5)) {
      usedDbIds.add(bestMatch.id);
      matched.push({ truth, extracted: bestMatch, nameScore, valueMatch });
    } else {
      matched.push({ truth, extracted: null, nameScore: 0, valueMatch: false });
    }
  }

  // ── Report ─────────────────────────────────────────────────────
  let correctValues = 0;
  let correctNames = 0;
  let missed = 0;

  console.log("── Per-Measurement Results ──\n");

  for (const m of matched) {
    const status = !m.extracted
      ? "MISSED"
      : m.valueMatch
        ? "VALUE OK"
        : "VALUE WRONG";

    if (m.extracted) {
      if (m.valueMatch) correctValues++;
      if (m.nameScore >= 0.5) correctNames++;
    } else {
      missed++;
    }

    const icon = status === "VALUE OK" ? "+" : status === "MISSED" ? "x" : "~";
    console.log(
      `  [${icon}] ${status.padEnd(12)} | Truth: "${m.truth.parameterName}" = ${m.truth.value} ${m.truth.unit}`
    );
    if (m.extracted) {
      console.log(
        `  ${"".padEnd(18)} | AI:    "${m.extracted.parameterName}" = ${m.extracted.value} ${m.extracted.unit}`
      );
      console.log(
        `  ${"".padEnd(18)} | Name similarity: ${(m.nameScore * 100).toFixed(0)}%`
      );
    }
  }

  // Check for extra measurements the AI found that aren't in ground truth
  const unmatched = dbMeasurements.filter((m) => !usedDbIds.has(m.id));

  if (unmatched.length > 0) {
    console.log("\n── Extra AI Measurements (not in ground truth) ──\n");
    for (const m of unmatched) {
      console.log(
        `  [?] "${m.parameterName}" = ${m.value} ${m.unit} (${m.status})`
      );
    }
  }

  // ── Summary ────────────────────────────────────────────────────
  const total = GROUND_TRUTH.length;
  const recall = ((total - missed) / total) * 100;
  const precision =
    dbMeasurements.length > 0
      ? ((total - missed) / dbMeasurements.length) * 100
      : 0;
  const valueAccuracy =
    total - missed > 0 ? (correctValues / (total - missed)) * 100 : 0;
  const nameAccuracy =
    total - missed > 0 ? (correctNames / (total - missed)) * 100 : 0;

  console.log("\n── Summary ──\n");
  console.log(`  Recall (found/expected):     ${total - missed}/${total} (${recall.toFixed(1)}%)`);
  console.log(`  Precision (correct/extracted): ${total - missed}/${dbMeasurements.length} (${precision.toFixed(1)}%)`);
  console.log(`  Value accuracy:              ${correctValues}/${total - missed} (${valueAccuracy.toFixed(1)}%)`);
  console.log(`  Name accuracy (>50% match):  ${correctNames}/${total - missed} (${nameAccuracy.toFixed(1)}%)`);
  console.log(`  Missed measurements:         ${missed}`);
  console.log(`  Extra measurements:          ${unmatched.length}`);
  console.log("");

  // Overall grade
  const overallScore = (recall + valueAccuracy) / 2;
  const grade =
    overallScore >= 95
      ? "A"
      : overallScore >= 85
        ? "B"
        : overallScore >= 70
          ? "C"
          : overallScore >= 50
            ? "D"
            : "F";
  console.log(`  OVERALL GRADE: ${grade} (${overallScore.toFixed(1)}%)`);
  console.log("");

  await prisma.$disconnect();
}

main().catch(console.error);
