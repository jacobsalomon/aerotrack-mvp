// POST /api/org/join — Validate an invite code and assign the user to that organization.
// Called from the /join-org page when a user enters an invite code.

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Get the logged-in user's session
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Already in an org? No-op success.
  if (session.user.organizationId) {
    return NextResponse.json({ success: true, message: "Already in an organization" });
  }

  try {
    const body = await request.json();
    const { inviteCode } = body;

    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const code = await prisma.inviteCode.findUnique({
      where: { code: inviteCode.toUpperCase().trim() },
      include: { organization: { select: { name: true } } },
    });

    if (!code || code.status !== "active") {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 400 });
    }

    if (code.expiresAt && code.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invite code has expired" }, { status: 400 });
    }

    if (code.maxUses && code.useCount >= code.maxUses) {
      return NextResponse.json({ error: "This invite code has reached its usage limit" }, { status: 400 });
    }

    // Assign the user to the organization and increment the code's use count
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { organizationId: code.organizationId },
      }),
      prisma.inviteCode.update({
        where: { id: code.id },
        data: { useCount: { increment: 1 } },
      }),
      prisma.auditLogEntry.create({
        data: {
          organizationId: code.organizationId,
          userId: session.user.id,
          action: "user_joined_org",
          entityType: "Organization",
          entityId: code.organizationId,
          metadata: JSON.stringify({ inviteCode: code.code }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      organization: code.organization.name,
    });
  } catch (error) {
    console.error("[Join Org] Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
