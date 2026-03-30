// Voice-driven pass/fail detection
// Scans corrected transcripts for patterns like "item 290 pass" or "item five fifty fail"
// Safety requirement: technician MUST say the item number — no context-based matching.

import { prisma } from "@/lib/db";

interface VoicePassFail {
  callout: string;      // The item callout spoken (e.g., "290", "5-50")
  result: "pass" | "fail";
  rawExcerpt: string;   // The matched text from the transcript
}

// Number words → digits for common spoken numbers
const WORD_TO_DIGIT: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
  twenty: "20", thirty: "30", forty: "40", fifty: "50",
  sixty: "60", seventy: "70", eighty: "80", ninety: "90",
};

// Convert spoken number words to digits: "five fifty" → "5-50", "two ninety" → "290"
function spokenToCallout(words: string): string {
  const parts = words.toLowerCase().split(/[\s-]+/);
  const digits = parts.map((w) => WORD_TO_DIGIT[w] || w);

  // Try to form a callout like "5-50" or "290"
  // If we have exactly 2 parts that look like numbers, join with dash
  if (digits.length === 2 && digits.every((d) => /^\d+$/.test(d))) {
    return `${digits[0]}-${digits[1]}`;
  }

  return digits.join("");
}

// Detect pass/fail patterns in transcript text.
// Matches patterns like: "item 290 pass", "check 5-50 fails", "number five fifty pass"
export function detectPassFail(text: string): VoicePassFail[] {
  const results: VoicePassFail[] = [];
  if (!text) return results;

  // Pattern: (item|check|number|callout) + (callout number or words) + (pass/fail keyword)
  // Also handles: "callout 290, pass" and "item 290 is a pass"
  const pattern =
    /(?:item|check|number|callout)\s+([\w\s-]+?)\s+(?:is\s+(?:a\s+)?)?(?:pass(?:es|ed)?|fail(?:s|ed)?|good|no\s*good|reject(?:s|ed)?)/gi;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const rawCallout = match[1].trim();
    const fullMatch = match[0];

    // Determine pass or fail from the matched text
    const lower = fullMatch.toLowerCase();
    const isFail = /fail|no\s*good|reject/.test(lower);
    const result: "pass" | "fail" = isFail ? "fail" : "pass";

    // Normalize the callout — could be digits ("290"), hyphenated ("5-50"), or words ("five fifty")
    let callout = rawCallout;
    if (/[a-z]/i.test(rawCallout) && !/^\d/.test(rawCallout)) {
      // Contains words — try to convert
      callout = spokenToCallout(rawCallout);
    }

    // Clean up: remove trailing whitespace, normalize hyphens
    callout = callout.replace(/\s+/g, "").replace(/--+/g, "-");

    if (callout) {
      results.push({ callout, result, rawExcerpt: fullMatch });
    }
  }

  return results;
}

// Process detected pass/fail calls: look up items by callout, create progress records.
// Returns count of items successfully completed via voice.
export async function processVoicePassFail(
  sessionId: string,
  detections: VoicePassFail[],
  userId: string
): Promise<number> {
  if (detections.length === 0) return 0;

  // Load the session's template items to match callouts
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      inspectionTemplateId: true,
      signedOffAt: true,
      inspectionTemplate: {
        select: {
          sections: {
            select: {
              items: {
                where: {
                  itemType: { in: ["visual_check", "procedural_check", "safety_wire"] },
                },
                select: {
                  id: true,
                  itemCallout: true,
                  instanceCount: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session?.inspectionTemplate || session.signedOffAt) return 0;

  // Build a map of callout → item (only pass/fail item types)
  const calloutMap = new Map<string, { id: string; instanceCount: number }>();
  for (const section of session.inspectionTemplate.sections) {
    for (const item of section.items) {
      if (item.itemCallout) {
        // Store with normalized callout (lowercase, no spaces)
        calloutMap.set(item.itemCallout.toLowerCase().replace(/\s+/g, ""), item);
      }
    }
  }

  let completed = 0;

  for (const detection of detections) {
    const normalizedCallout = detection.callout.toLowerCase().replace(/\s+/g, "");
    const item = calloutMap.get(normalizedCallout);

    if (!item) {
      console.log(`[VoicePassFail] No item found for callout "${detection.callout}" — skipping`);
      continue;
    }

    // Check if already completed (don't overwrite)
    const existing = await prisma.inspectionProgress.findUnique({
      where: {
        captureSessionId_inspectionItemId_instanceIndex: {
          captureSessionId: sessionId,
          inspectionItemId: item.id,
          instanceIndex: 0,
        },
      },
    });

    if (existing) {
      console.log(`[VoicePassFail] Item "${detection.callout}" already completed — skipping`);
      continue;
    }

    // Create progress record — same as the completion endpoint
    const progressStatus = detection.result === "fail" ? "problem" : "done";

    await prisma.inspectionProgress.create({
      data: {
        captureSessionId: sessionId,
        inspectionItemId: item.id,
        instanceIndex: 0,
        status: progressStatus,
        result: detection.result,
        notes: `Voice: "${detection.rawExcerpt}"`,
        completedAt: new Date(),
        completedById: userId,
      },
    });

    console.log(`[VoicePassFail] Completed item "${detection.callout}" as ${detection.result}`);
    completed++;
  }

  return completed;
}
