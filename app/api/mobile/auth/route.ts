// POST /api/mobile/auth — Authenticate a technician
// Mobile app sends badge number + API key, gets back technician info
// This is the "login" endpoint for the iPhone app

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { badgeNumber, apiKey } = body;

    if (!badgeNumber || !apiKey) {
      return NextResponse.json(
        { success: false, error: "Badge number and API key are required" },
        { status: 400 }
      );
    }

    // Find technician by badge number and verify API key matches
    const technician = await prisma.technician.findUnique({
      where: { badgeNumber },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            faaRepairStationCert: true,
          },
        },
      },
    });

    if (!technician || technician.apiKey !== apiKey) {
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
        technician: {
          id: technician.id,
          firstName: technician.firstName,
          lastName: technician.lastName,
          email: technician.email,
          badgeNumber: technician.badgeNumber,
          role: technician.role,
          organizationId: technician.organizationId,
        },
        organization: technician.organization,
        // Return the API key as the token for subsequent requests
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
