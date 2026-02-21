// Helper to fetch reference data for a part number
// Used by the document generation AI to get context about procedures, limits, and specs

import { prisma } from "@/lib/db";

export interface ReferenceDataEntry {
  title: string;
  category: string;
  content: string;
  source: string;
}

// Fetch all reference data for a given part number
// Returns entries grouped by category for easy inclusion in AI prompts
export async function getReferenceDataForPart(
  partNumber: string
): Promise<ReferenceDataEntry[]> {
  const entries = await prisma.referenceData.findMany({
    where: { partNumber },
    select: {
      title: true,
      category: true,
      content: true,
      source: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return entries;
}

// Format reference data as a text block for inclusion in AI prompts
export function formatReferenceDataForPrompt(
  entries: ReferenceDataEntry[]
): string {
  if (entries.length === 0) return "";

  const sections = entries.map(
    (e) => `### ${e.title} [${e.category}]\nSource: ${e.source}\n\n${e.content}`
  );

  return `REFERENCE DATA:\n${sections.join("\n\n---\n\n")}`;
}
