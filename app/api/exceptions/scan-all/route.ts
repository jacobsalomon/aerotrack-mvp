// POST /api/exceptions/scan-all
// Runs the exception detection engine on ALL components in the database.
// Returns fleet-wide summary stats.

import { scanAllComponents } from "@/lib/exception-engine";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const result = await scanAllComponents();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
