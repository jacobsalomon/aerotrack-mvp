// POST /api/exceptions/scan/[componentId]
// Runs the exception detection engine on a single component.
// Returns all exceptions found (existing + newly detected).

import { scanComponent } from "@/lib/exception-engine";
import { requireAuth } from "@/lib/rbac";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ componentId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { componentId } = await params;

  try {
    const result = await scanComponent(componentId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
