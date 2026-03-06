// Document verification — cross-checks generated documents using a DIFFERENT AI model
// Chain: Claude Sonnet 4.6 → GPT-5.4 → cached fallback

import { prisma } from "@/lib/db";
import { cachedVerificationResult } from "./cached-responses";
import type { ModelConfig } from "./models";
import { VERIFICATION_MODELS } from "./models";
import { callAnthropic, callOpenAI, callWithFallback } from "./provider";

type VerificationSeverity = "info" | "warning" | "critical";
type DiscrepancyStatus = "confirmed" | "resolved" | "needs_review";

export interface VerificationIssue {
  field: string;
  issue: string;
  severity: VerificationSeverity;
}

export interface VerificationDocumentReview {
  documentType: string;
  issues: VerificationIssue[];
  confidence: number;
}

export interface VerificationDiscrepancy {
  field: string;
  description: string;
  status: DiscrepancyStatus;
  relatedDocuments: string[];
  conflictingValues: Array<{
    source: string;
    value: string;
    confidence?: number;
  }>;
  resolution?: string | null;
}

export interface CrossDocumentConsistency {
  score: number;
  partNumberConsistent?: boolean;
  serialNumberConsistent?: boolean;
  findingsMatchActions?: boolean;
  testResultsMatch?: boolean;
  partsConsumedConsistent?: boolean;
  contradictionsDetected?: boolean;
  measurementsConsistent?: boolean;
  generatedDiscrepanciesHighlighted?: boolean;
  note?: string;
}

export interface VerificationResult {
  verified: boolean;
  overallConfidence: number;
  verificationModel: string;
  documentReviews: VerificationDocumentReview[];
  discrepancies: VerificationDiscrepancy[];
  crossDocumentConsistency: CrossDocumentConsistency;
}

export interface VerifyDocumentsResult {
  verification: VerificationResult;
  documentsVerified: number;
  model: string;
  latencyMs: number;
  sessionStatus: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
}

interface ParsedDocumentForVerification {
  id: string;
  documentType: string;
  contentJson: Record<string, unknown>;
  confidence: number;
  lowConfidenceFields: string[];
  provenanceJson: Record<string, unknown>;
  knownDiscrepancies: VerificationDiscrepancy[];
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function clampScore(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeSeverity(value: unknown): VerificationSeverity {
  if (value === "critical" || value === "warning" || value === "info") return value;
  return "warning";
}

function normalizeDiscrepancyStatus(value: unknown): DiscrepancyStatus {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("resolved")) return "resolved";
    if (normalized.includes("confirm")) return "confirmed";
  }
  return "needs_review";
}

function deriveDescriptionFromValues(
  field: string,
  conflictingValues: VerificationDiscrepancy["conflictingValues"]
): string {
  if (conflictingValues.length === 0) {
    return `Discrepancy detected for ${field}`;
  }

  return conflictingValues
    .map((entry) => `${entry.source}: ${entry.value}`)
    .join(" vs ");
}

function normalizeDocuments(value: unknown, fallbackDocument: string): string[] {
  if (!Array.isArray(value)) return [fallbackDocument];

  const relatedDocuments = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  return relatedDocuments.length > 0 ? relatedDocuments : [fallbackDocument];
}

function extractKnownDiscrepancies(
  documentType: string,
  provenanceJson: Record<string, unknown>
): VerificationDiscrepancy[] {
  const discrepancies: VerificationDiscrepancy[] = [];

  for (const [field, rawEntry] of Object.entries(provenanceJson)) {
    if (!rawEntry || typeof rawEntry !== "object") continue;

    const entry = rawEntry as Record<string, unknown>;
    const discrepancy = entry.discrepancy;
    if (!discrepancy || typeof discrepancy !== "object") continue;

    const discrepancyRecord = discrepancy as Record<string, unknown>;
    if (discrepancyRecord.detected === false) continue;

    const conflictingValues = Array.isArray(discrepancyRecord.values)
      ? discrepancyRecord.values
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item) => ({
            source:
              typeof item.sourceType === "string"
                ? item.sourceType
                : typeof item.source === "string"
                ? item.source
                : "unknown",
            value:
              item.value === undefined || item.value === null ? "" : String(item.value),
            confidence:
              typeof item.confidence === "number" ? clampScore(item.confidence) : undefined,
          }))
      : [];

    const resolution =
      typeof discrepancyRecord.resolution === "string"
        ? discrepancyRecord.resolution
        : null;

    discrepancies.push({
      field:
        typeof discrepancyRecord.field === "string" && discrepancyRecord.field.trim()
          ? discrepancyRecord.field
          : field,
      description:
        typeof discrepancyRecord.description === "string"
          ? discrepancyRecord.description
          : deriveDescriptionFromValues(field, conflictingValues),
      status: normalizeDiscrepancyStatus(resolution ?? discrepancyRecord.status),
      relatedDocuments: [documentType],
      conflictingValues,
      resolution,
    });
  }

  return discrepancies;
}

function mergeDiscrepancies(
  aiDiscrepancies: VerificationDiscrepancy[],
  knownDiscrepancies: VerificationDiscrepancy[]
): VerificationDiscrepancy[] {
  const merged = new Map<string, VerificationDiscrepancy>();

  for (const discrepancy of [...knownDiscrepancies, ...aiDiscrepancies]) {
    const key = `${discrepancy.field.toLowerCase()}::${discrepancy.relatedDocuments
      .join("|")
      .toLowerCase()}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, discrepancy);
      continue;
    }

    merged.set(key, {
      ...existing,
      ...discrepancy,
      relatedDocuments: Array.from(
        new Set([...existing.relatedDocuments, ...discrepancy.relatedDocuments])
      ),
      conflictingValues:
        discrepancy.conflictingValues.length > 0
          ? discrepancy.conflictingValues
          : existing.conflictingValues,
      resolution: discrepancy.resolution ?? existing.resolution,
    });
  }

  return Array.from(merged.values());
}

function buildCrossDocumentConsistency(
  rawValue: unknown,
  discrepancies: VerificationDiscrepancy[],
  knownDiscrepancies: VerificationDiscrepancy[]
): CrossDocumentConsistency {
  const raw =
    rawValue && typeof rawValue === "object"
      ? (rawValue as Record<string, unknown>)
      : {};

  const consistency: CrossDocumentConsistency = {
    score: clampScore(raw.score, Number.NaN),
    partNumberConsistent:
      typeof raw.partNumberConsistent === "boolean" ? raw.partNumberConsistent : undefined,
    serialNumberConsistent:
      typeof raw.serialNumberConsistent === "boolean" ? raw.serialNumberConsistent : undefined,
    findingsMatchActions:
      typeof raw.findingsMatchActions === "boolean" ? raw.findingsMatchActions : undefined,
    testResultsMatch:
      typeof raw.testResultsMatch === "boolean" ? raw.testResultsMatch : undefined,
    partsConsumedConsistent:
      typeof raw.partsConsumedConsistent === "boolean" ? raw.partsConsumedConsistent : undefined,
    contradictionsDetected:
      typeof raw.contradictionsDetected === "boolean" ? raw.contradictionsDetected : undefined,
    measurementsConsistent:
      typeof raw.measurementsConsistent === "boolean" ? raw.measurementsConsistent : undefined,
    generatedDiscrepanciesHighlighted:
      typeof raw.generatedDiscrepanciesHighlighted === "boolean"
        ? raw.generatedDiscrepanciesHighlighted
        : undefined,
    note: typeof raw.note === "string" ? raw.note : undefined,
  };

  if (consistency.generatedDiscrepanciesHighlighted === undefined) {
    consistency.generatedDiscrepanciesHighlighted =
      knownDiscrepancies.length === 0 ||
      knownDiscrepancies.every((known) =>
        discrepancies.some(
          (actual) =>
            actual.field.toLowerCase() === known.field.toLowerCase() ||
            actual.relatedDocuments.some((doc) => known.relatedDocuments.includes(doc))
        )
      );
  }

  if (Number.isNaN(consistency.score)) {
    const checks: boolean[] = [];
    const positiveChecks = [
      consistency.partNumberConsistent,
      consistency.serialNumberConsistent,
      consistency.findingsMatchActions,
      consistency.testResultsMatch,
      consistency.partsConsumedConsistent,
      consistency.measurementsConsistent,
      consistency.generatedDiscrepanciesHighlighted,
    ];

    for (const check of positiveChecks) {
      if (typeof check === "boolean") checks.push(check);
    }

    if (typeof consistency.contradictionsDetected === "boolean") {
      checks.push(!consistency.contradictionsDetected);
    }

    consistency.score =
      checks.length > 0 ? clampScore(checks.filter(Boolean).length / checks.length) : 0;
  }

  return consistency;
}

function normalizeVerificationResult(opts: {
  rawResult: unknown;
  documents: ParsedDocumentForVerification[];
  verificationModel: string;
}): VerificationResult {
  const raw =
    opts.rawResult && typeof opts.rawResult === "object"
      ? (opts.rawResult as Record<string, unknown>)
      : {};

  const knownDiscrepancies = opts.documents.flatMap((doc) => doc.knownDiscrepancies);

  const reviewsByType = new Map<string, VerificationDocumentReview>();
  const rawReviews = Array.isArray(raw.documentReviews) ? raw.documentReviews : [];
  for (const item of rawReviews) {
    if (!item || typeof item !== "object") continue;
    const review = item as Record<string, unknown>;
    const documentType =
      typeof review.documentType === "string" ? review.documentType : "unknown";
    const issues = Array.isArray(review.issues)
      ? review.issues
          .filter((issue): issue is Record<string, unknown> => !!issue && typeof issue === "object")
          .map((issue) => ({
            field: typeof issue.field === "string" ? issue.field : "unknown",
            issue:
              typeof issue.issue === "string" ? issue.issue : "Verification issue detected",
            severity: normalizeSeverity(issue.severity),
          }))
      : [];

    reviewsByType.set(documentType, {
      documentType,
      issues,
      confidence: clampScore(review.confidence, 0),
    });
  }

  for (const document of opts.documents) {
    if (!reviewsByType.has(document.documentType)) {
      reviewsByType.set(document.documentType, {
        documentType: document.documentType,
        issues: [],
        confidence: clampScore(document.confidence, 0),
      });
    }
  }

  const aiDiscrepancies: VerificationDiscrepancy[] = Array.isArray(raw.discrepancies)
    ? raw.discrepancies
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => {
          const conflictingValues = Array.isArray(item.conflictingValues)
            ? item.conflictingValues
                .filter(
                  (value): value is Record<string, unknown> => !!value && typeof value === "object"
                )
                .map((value) => ({
                  source:
                    typeof value.source === "string"
                      ? value.source
                      : typeof value.type === "string"
                      ? value.type
                      : "unknown",
                  value: value.value === undefined || value.value === null ? "" : String(value.value),
                  confidence:
                    typeof value.confidence === "number"
                      ? clampScore(value.confidence)
                      : undefined,
                }))
            : [
                item.sourceA,
                item.sourceB,
              ]
                .filter(
                  (value): value is Record<string, unknown> => !!value && typeof value === "object"
                )
                .map((value) => ({
                  source:
                    typeof value.source === "string"
                      ? value.source
                      : typeof value.type === "string"
                      ? value.type
                      : "unknown",
                  value: value.value === undefined || value.value === null ? "" : String(value.value),
                  confidence:
                    typeof value.confidence === "number"
                      ? clampScore(value.confidence)
                      : undefined,
                }));

          const field = typeof item.field === "string" ? item.field : "unknown";
          const description =
            typeof item.description === "string"
              ? item.description
              : deriveDescriptionFromValues(field, conflictingValues);

          return {
            field,
            description,
            status: normalizeDiscrepancyStatus(item.status ?? item.resolution),
            relatedDocuments: normalizeDocuments(item.relatedDocuments, field.split(" ")[0] || "unknown"),
            conflictingValues,
            resolution:
              typeof item.resolution === "string" ? item.resolution : null,
          };
        })
    : [];

  const discrepancies = mergeDiscrepancies(aiDiscrepancies, knownDiscrepancies);
  const crossDocumentConsistency = buildCrossDocumentConsistency(
    raw.crossDocumentConsistency,
    discrepancies,
    knownDiscrepancies
  );

  const documentReviews = Array.from(reviewsByType.values());
  const criticalIssueFound = documentReviews.some((review) =>
    review.issues.some((issue) => issue.severity === "critical")
  );
  const overallConfidence =
    typeof raw.overallConfidence === "number"
      ? clampScore(raw.overallConfidence)
      : documentReviews.length > 0
      ? clampScore(
          documentReviews.reduce((sum, review) => sum + review.confidence, 0) /
            documentReviews.length
        )
      : 0;

  return {
    verified:
      typeof raw.verified === "boolean" ? raw.verified && !criticalIssueFound : !criticalIssueFound,
    overallConfidence,
    verificationModel: opts.verificationModel,
    documentReviews,
    discrepancies,
    crossDocumentConsistency,
  };
}

function buildPerDocumentVerificationPayload(
  verification: VerificationResult,
  documentType: string
): Record<string, unknown> {
  const documentReview =
    verification.documentReviews.find((review) => review.documentType === documentType) ||
    {
      documentType,
      issues: [],
      confidence: verification.overallConfidence,
    };

  const relatedDiscrepancies = verification.discrepancies.filter(
    (discrepancy) =>
      discrepancy.relatedDocuments.includes(documentType) ||
      discrepancy.field.toLowerCase().includes(documentType.toLowerCase())
  );

  return {
    verified: verification.verified,
    overallConfidence: verification.overallConfidence,
    confidence: documentReview.confidence,
    issues: documentReview.issues,
    documentReviews: verification.documentReviews,
    discrepancies: relatedDiscrepancies,
    crossDocumentConsistency: verification.crossDocumentConsistency,
    verificationModel: verification.verificationModel,
  };
}

// Run independent AI verification on all generated documents for a session
export async function verifyDocuments(
  sessionId: string,
  technicianId: string
): Promise<VerifyDocumentsResult> {
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    include: {
      evidence: { orderBy: { capturedAt: "asc" } },
      documents: true,
      analysis: true,
      technician: true,
    },
  });

  if (!session) throw new Error("Session not found");
  if (session.documents.length === 0) throw new Error("No documents to verify — generate first");

  const photoExtractions = session.evidence
    .filter((evidence) => evidence.type === "PHOTO" && evidence.aiExtraction)
    .map((evidence) => safeParseJson<Record<string, unknown>>(evidence.aiExtraction, { raw: evidence.aiExtraction }));

  const audioChunks = session.evidence
    .filter((evidence) => evidence.type === "AUDIO_CHUNK" && evidence.transcription)
    .map((evidence) => evidence.transcription || "");
  const audioTranscript =
    session.analysis?.audioTranscript ||
    (audioChunks.length > 0 ? audioChunks.join("\n") : null);

  const videoAnalysis = session.analysis
    ? {
        actionLog: safeParseJson(session.analysis.actionLog, [] as unknown[]),
        partsIdentified: safeParseJson(session.analysis.partsIdentified, [] as unknown[]),
        procedureSteps: safeParseJson(session.analysis.procedureSteps, [] as unknown[]),
        anomalies: safeParseJson(session.analysis.anomalies, [] as unknown[]),
        confidence: session.analysis.confidence,
      }
    : null;

  const documentsToVerify: ParsedDocumentForVerification[] = session.documents.map((doc) => {
    const provenanceJson = safeParseJson<Record<string, unknown>>(
      doc.provenanceJson || doc.evidenceLineage,
      {}
    );

    return {
      id: doc.id,
      documentType: doc.documentType,
      contentJson: safeParseJson<Record<string, unknown>>(doc.contentJson, {}),
      confidence: clampScore(doc.confidence),
      lowConfidenceFields: safeParseJson<string[]>(doc.lowConfidenceFields, []),
      provenanceJson,
      knownDiscrepancies: extractKnownDiscrepancies(doc.documentType, provenanceJson),
    };
  });

  const knownDiscrepancies = documentsToVerify.flatMap((doc) => doc.knownDiscrepancies);

  const systemPrompt = `You are an independent FAA compliance document reviewer. Your job is to verify AI-generated documents against the raw evidence that was used to create them.

You are a SECOND opinion. Be skeptical, precise, and explain contradictions in plain language.

CHECKS TO PERFORM:
1. Part numbers are consistent across all documents.
2. Serial numbers are consistent across all documents.
3. Every finding in a findings/defect section has a corresponding work action or supporting observation.
4. Test results referenced in work order style sections match 8130-3 remarks.
5. Parts consumed or replaced are listed consistently across documents.
6. There are no logical contradictions across the document set.
7. Measurements cited match across documents and evidence.
8. Any discrepancy already flagged during generation is either confirmed, resolved, or still needs review.
9. Unsupported or hallucinated claims are flagged.

SEVERITY LEVELS:
- critical: wrong part number, serial number, safety-related field, or release-to-service contradiction
- warning: inconsistency or unsupported field that needs human review
- info: note or evidence gap that does not block the demo

Return JSON with this exact structure:
{
  "verified": true,
  "overallConfidence": 0.0,
  "documentReviews": [
    {
      "documentType": "8130-3",
      "issues": [
        {
          "field": "block7_remarks",
          "issue": "Reason for issue",
          "severity": "warning"
        }
      ],
      "confidence": 0.0
    }
  ],
  "discrepancies": [
    {
      "field": "8010-4 section2_part_number",
      "description": "Short plain-language explanation",
      "status": "confirmed",
      "relatedDocuments": ["8010-4", "8130-3"],
      "conflictingValues": [
        { "source": "photo", "value": "881700-1089", "confidence": 0.97 },
        { "source": "document", "value": "881700-1098", "confidence": 0.85 }
      ],
      "resolution": "Optional explanation"
    }
  ],
  "crossDocumentConsistency": {
    "score": 0.0,
    "partNumberConsistent": true,
    "serialNumberConsistent": true,
    "findingsMatchActions": true,
    "testResultsMatch": true,
    "partsConsumedConsistent": true,
    "contradictionsDetected": false,
    "measurementsConsistent": true,
    "generatedDiscrepanciesHighlighted": true,
    "note": "Optional short summary"
  }
}

Rules:
- If any critical issue exists, set verified to false.
- Use only the provided evidence and documents.
- Do not silently resolve conflicts. Put them in the discrepancies array.
- If a pre-flagged discrepancy is actually supported or resolved, mark status "resolved" and explain why.
- Keep explanations plain-language and demo-friendly.`;

  const userMessage = `Verify these AI-generated FAA compliance documents against the raw evidence.

=== RAW EVIDENCE ===

${photoExtractions.length > 0 ? `PHOTO ANALYSIS:
${JSON.stringify(photoExtractions, null, 2)}` : "No photo evidence."}

${audioTranscript ? `AUDIO TRANSCRIPT:
${audioTranscript}` : "No audio transcript."}

${videoAnalysis ? `VIDEO ANALYSIS:
${JSON.stringify(videoAnalysis, null, 2)}` : "No video analysis."}

=== GENERATED DOCUMENTS ===

${JSON.stringify(
    documentsToVerify.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      contentJson: doc.contentJson,
      confidence: doc.confidence,
      lowConfidenceFields: doc.lowConfidenceFields,
      provenanceJson: doc.provenanceJson,
      knownDiscrepancies: doc.knownDiscrepancies,
    })),
    null,
    2
  )}

=== PRE-FLAGGED DISCREPANCIES FROM GENERATION ===

${knownDiscrepancies.length > 0 ? JSON.stringify(knownDiscrepancies, null, 2) : "None."}

Review the full document set, compare each document to the evidence, and return only JSON.`;

  const startTime = Date.now();

  const result = await callWithFallback({
    models: VERIFICATION_MODELS,
    timeoutMs: 50000,
    taskName: "document_verification",
    cachedFallback: cachedVerificationResult as VerificationResult,
    execute: async (model) => {
      const text = await callModelForVerification(model, systemPrompt, userMessage);

      try {
        return JSON.parse(text) as VerificationResult;
      } catch {
        console.error("Verification AI returned non-JSON:", text);
        return {
          verified: false,
          overallConfidence: 0,
          verificationModel: model.id,
          documentReviews: [],
          discrepancies: [],
          crossDocumentConsistency: {
            score: 0,
            generatedDiscrepanciesHighlighted: knownDiscrepancies.length === 0,
          },
        } satisfies VerificationResult;
      }
    },
  });

  const latencyMs = Date.now() - startTime;
  const model = result.cachedFallback ? "cached" : result.modelUsed.id;
  const verification = normalizeVerificationResult({
    rawResult: result.data,
    documents: documentsToVerify,
    verificationModel: model,
  });

  const now = new Date();
  for (const doc of session.documents) {
    await prisma.documentGeneration2.update({
      where: { id: doc.id },
      data: {
        verificationJson: JSON.stringify(
          buildPerDocumentVerificationPayload(verification, doc.documentType)
        ),
        verifiedAt: now,
      },
    });
  }

  const sessionStatus = "verified";
  await prisma.captureSession.update({
    where: { id: sessionId },
    data: { status: sessionStatus },
  });

  await prisma.auditLogEntry.create({
    data: {
      organizationId: session.technician.organizationId,
      technicianId,
      action: "documents_verified",
      entityType: "CaptureSession",
      entityId: sessionId,
      metadata: JSON.stringify({
        model,
        verified: verification.verified,
        overallConfidence: verification.overallConfidence,
        crossDocumentConsistencyScore: verification.crossDocumentConsistency.score,
        documentCount: session.documents.length,
        discrepancyCount: verification.discrepancies.length,
        criticalIssueCount: verification.documentReviews.reduce(
          (sum, review) =>
            sum + review.issues.filter((issue) => issue.severity === "critical").length,
          0
        ),
        latencyMs,
        fallbackUsed: result.fallbackUsed,
        fallbackReason: result.cachedFallback ? "all models failed" : null,
      }),
    },
  });

  return {
    verification,
    documentsVerified: session.documents.length,
    model,
    latencyMs,
    sessionStatus,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.cachedFallback ? "all models failed" : undefined,
  };
}

async function callModelForVerification(
  model: ModelConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  switch (model.provider) {
    case "anthropic":
      return callAnthropic({
        model: model.id,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 3000,
        timeoutMs: 50000,
      });

    case "openai":
      return callOpenAI({
        model: model.id,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        jsonMode: true,
        maxTokens: 3000,
        timeoutMs: 50000,
      });

    default:
      throw new Error(`Unsupported provider for verification: ${model.provider}`);
  }
}
