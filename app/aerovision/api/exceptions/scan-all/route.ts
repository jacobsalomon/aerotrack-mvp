// POST /api/exceptions/scan-all
// Runs the exception detection engine on ALL components in the database.
// Returns fleet-wide summary stats.

import { scanAllComponents } from "@/lib/exception-engine";
import { requireAuth } from "@/lib/rbac";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const result = await scanAllComponents();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
