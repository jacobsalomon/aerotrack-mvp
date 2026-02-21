// Mobile API authentication helper
// Validates the API key from the request header and returns the technician
// Used by all /api/mobile/* endpoints

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export interface AuthenticatedTechnician {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  badgeNumber: string;
  role: string;
  organizationId: string;
}

// Pull the API key from the Authorization header and look up the technician
export async function authenticateRequest(
  request: Request
): Promise<{ technician: AuthenticatedTechnician } | { error: NextResponse }> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: NextResponse.json(
        { success: false, error: "Missing or invalid Authorization header" },
        { status: 401 }
      ),
    };
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer " prefix

  const technician = await prisma.technician.findUnique({
    where: { apiKey },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      badgeNumber: true,
      role: true,
      organizationId: true,
      status: true,
    },
  });

  if (!technician) {
    return {
      error: NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      ),
    };
  }

  if (technician.status !== "ACTIVE") {
    return {
      error: NextResponse.json(
        { success: false, error: "Technician account is inactive" },
        { status: 403 }
      ),
    };
  }

  return { technician };
}
