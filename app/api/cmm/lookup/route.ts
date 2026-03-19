// GET /api/cmm/lookup?pn=881700-1089
// Look up a Component Maintenance Manual by part number.
// Returns manual metadata + reference data entries.
// Used by the glasses HUD, iOS app, and AI pipeline.

import { lookupCmmByPartNumber, lookupCmmByPartFamily } from "@/lib/cmm-lookup";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const partNumber = url.searchParams.get("pn");

  if (!partNumber) {
    return NextResponse.json(
      { success: false, error: "pn (part number) query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Try exact match first
    let result = await lookupCmmByPartNumber(partNumber);

    // Fall back to part family prefix match if no exact match
    if (!result.matched) {
      result = await lookupCmmByPartFamily(partNumber);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("CMM lookup error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to look up CMM data" },
      { status: 500 }
    );
  }
}
