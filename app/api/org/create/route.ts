// POST /api/org/create — Create a new organization and assign the current user to it.
// Also generates an invite code the user can share with their team.

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Generate a random invite code like "ABCD-1234"
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Already in an org? Don't create another one.
  if (session.user.organizationId) {
    return NextResponse.json(
      { error: "You're already in an organization" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Generate a unique invite code (retry if collision)
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.inviteCode.findUnique({
        where: { code: inviteCode },
      });
      if (!existing) break;
      inviteCode = generateInviteCode();
      attempts++;
    }

    // Create the org, assign the user, and generate the invite code in one transaction
    const [org] = await prisma.$transaction([
      prisma.organization.create({
        data: { name: trimmedName },
      }),
    ]);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { organizationId: org.id },
      }),
      prisma.inviteCode.create({
        data: {
          organizationId: org.id,
          code: inviteCode,
          createdBy: session.user.id,
          status: "active",
        },
      }),
      prisma.auditLogEntry.create({
        data: {
          organizationId: org.id,
          userId: session.user.id,
          action: "organization_created",
          entityType: "Organization",
          entityId: org.id,
          metadata: JSON.stringify({ name: trimmedName }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      organization: trimmedName,
      inviteCode,
    });
  } catch (error) {
    console.error("[Create Org] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
