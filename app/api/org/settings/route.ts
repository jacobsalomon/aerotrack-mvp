// GET  /api/org/settings — Read org settings (agent instructions)
// PUT  /api/org/settings — Update org agent instructions

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { agentInstructions: true },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({ agentInstructions: org.agentInstructions ?? "" });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const instructions = typeof body.agentInstructions === "string"
      ? body.agentInstructions
      : "";

    const org = await prisma.organization.update({
      where: { id: session.user.organizationId },
      data: { agentInstructions: instructions || null },
      select: { id: true, agentInstructions: true },
    });

    return NextResponse.json({ success: true, agentInstructions: org.agentInstructions ?? "" });
  } catch (error) {
    console.error("[Org Settings] Update error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
