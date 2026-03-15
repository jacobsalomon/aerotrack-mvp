// CMM Cross-Referencing — look up Component Maintenance Manuals by part number.
// Used by the glasses HUD, the AI pipeline, and the iOS app.
// Returns the manual metadata + any reference data entries for the part.

import { prisma } from "@/lib/db";

export interface CmmLookupResult {
  // The matching CMM manual (null if none found for this part number)
  manual: {
    id: string;
    title: string;
    fileUrl: string;
    pageCount: number | null;
    fileSizeBytes: number;
  } | null;
  // Reference data entries for this part (procedures, limits, intervals, specs)
  references: Array<{
    id: string;
    title: string;
    category: string; // "procedure" | "limit" | "interval" | "specification"
    content: string;
    source: string; // e.g., "CMM Rev. 12, Section 5.2"
  }>;
  // The part number that was looked up
  partNumber: string;
  // Whether any match was found
  matched: boolean;
}

// Look up CMM manual and reference data for a given part number.
// Uses exact match on the part number field.
export async function lookupCmmByPartNumber(
  partNumber: string
): Promise<CmmLookupResult> {
  // Run both queries in parallel for speed
  const [manual, references] = await Promise.all([
    prisma.componentManual.findFirst({
      where: { partNumber },
      select: {
        id: true,
        title: true,
        fileUrl: true,
        pageCount: true,
        fileSizeBytes: true,
      },
    }),
    prisma.referenceData.findMany({
      where: { partNumber },
      select: {
        id: true,
        title: true,
        category: true,
        content: true,
        source: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    manual,
    references,
    partNumber,
    matched: manual !== null || references.length > 0,
  };
}

// Look up CMM by part number prefix (for fuzzy matching when exact match fails).
// E.g., "881700-1089" would match manuals for "881700" (the part family).
export async function lookupCmmByPartFamily(
  partNumber: string
): Promise<CmmLookupResult> {
  // Extract the part family prefix (everything before the last dash)
  const dashIndex = partNumber.lastIndexOf("-");
  const prefix = dashIndex > 0 ? partNumber.substring(0, dashIndex) : partNumber;

  const [manual, references] = await Promise.all([
    prisma.componentManual.findFirst({
      where: { partNumber: { startsWith: prefix } },
      select: {
        id: true,
        title: true,
        fileUrl: true,
        pageCount: true,
        fileSizeBytes: true,
      },
    }),
    prisma.referenceData.findMany({
      where: { partNumber: { startsWith: prefix } },
      select: {
        id: true,
        title: true,
        category: true,
        content: true,
        source: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    manual,
    references,
    partNumber,
    matched: manual !== null || references.length > 0,
  };
}
