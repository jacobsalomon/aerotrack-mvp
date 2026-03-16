// POST /api/mobile/auth — Authenticate a technician
// Mobile app sends an API key, gets back technician info + token
// Supports two flows:
//   1. API key only — looks up technician by key (primary flow)
//   2. Badge number + API key — legacy flow

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { badgeNumber, apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API key is required" },
        { status: 400 }
      );
    }

    let technician;

    if (badgeNumber) {
      // Legacy flow: look up by badge, verify key matches
      technician = await prisma.technician.findUnique({
        where: { badgeNumber },
        include: {
          organization: {
            select: { id: true, name: true, faaRepairStationCert: true },
          },
        },
      });

      const storedKey = technician?.apiKey || "";
      const keysMatch =
        apiKey.length === storedKey.length &&
        crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(storedKey));

      if (!keysMatch) technician = null;
    } else {
      // Primary flow: look up technician directly by API key
      technician = await prisma.technician.findUnique({
        where: { apiKey },
        include: {
          organization: {
            select: { id: true, name: true, faaRepairStationCert: true },
          },
        },
      });
    }

    if (!technician) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    if (technician.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Account is inactive" },
        { status: 403 }
      );
    }

    // Log the authentication event
    await prisma.auditLogEntry.create({
      data: {
        organizationId: technician.organizationId,
        technicianId: technician.id,
        action: "technician_authenticated",
        entityType: "Technician",
        entityId: technician.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        // "user" field matches the iOS app's AuthResponse model
        user: {
          id: technician.id,
          name: `${technician.firstName} ${technician.lastName}`,
          badgeNumber: technician.badgeNumber,
          email: technician.email,
          role: technician.role,
          organizationId: technician.organizationId,
        },
        organization: technician.organization,
        token: apiKey,
      },
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { success: false, error: "Authentication failed" },
      { status: 500 }
    );
  }
}
