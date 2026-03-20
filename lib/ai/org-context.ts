// Fetch and cache org-specific agent instructions for AI prompt injection.
// Called once per request pipeline (e.g. at the start of audio chunk processing)
// and the result is passed through to each AI call — avoids repeated DB hits.

import { prisma } from "@/lib/db";

// Simple in-memory cache: orgId -> { instructions, fetchedAt }
// Keeps instructions for 60 seconds so we don't hit the DB on every audio chunk
const cache = new Map<string, { instructions: string | null; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getOrgInstructions(orgId: string): Promise<string | null> {
  const cached = cache.get(orgId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.instructions;
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { agentInstructions: true },
  });

  const instructions = org?.agentInstructions || null;
  cache.set(orgId, { instructions, fetchedAt: Date.now() });
  return instructions;
}

// Format org instructions for injection into an AI prompt.
// Returns empty string if no instructions are set (so prompts don't change).
export function formatOrgInstructions(instructions: string | null | undefined): string {
  if (!instructions?.trim()) return "";
  return `\n\n## Organization-Specific Instructions\n${instructions.trim()}\n`;
}
