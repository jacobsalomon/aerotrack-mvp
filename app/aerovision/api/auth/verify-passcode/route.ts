// POST /api/auth/verify-passcode
// Validates the passcode server-side so the actual code is never
// exposed in the client-side JavaScript bundle.
// Sets a cookie on success so subsequent API calls can be authenticated.

import { NextResponse, after } from "next/server";
import crypto from "crypto";
import {
  createDashboardSessionToken,
  DASHBOARD_AUTH_COOKIE_NAME,
  DASHBOARD_SESSION_TTL_SECONDS,
  getConfiguredDashboardPasscode,
} from "@/lib/dashboard-auth";
import { trackGateAccess } from "@/lib/attio-client";

export async function POST(request: Request) {
  try {
    const { passcode, name, email } = await request.json();

    // Validate name and email are present
    const trimmedName = String(name || "").trim();
    const trimmedEmail = String(email || "").trim();

    if (!trimmedName || !trimmedEmail) {
      return NextResponse.json(
        { success: false, error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 }
      );
    }

    const expectedPasscode = getConfiguredDashboardPasscode();
    if (!expectedPasscode) {
      return NextResponse.json(
        { success: false, error: "Passcode is not configured on the server" },
        { status: 500 }
      );
    }

    // Use timing-safe comparison to prevent side-channel attacks
    const input = String(passcode || "");
    const isMatch =
      input.length === expectedPasscode.length &&
      crypto.timingSafeEqual(Buffer.from(input), Buffer.from(expectedPasscode));

    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: "Incorrect passcode" },
        { status: 401 }
      );
    }

    // Set a session cookie so the browser sends it with future requests
    const sessionToken = createDashboardSessionToken();
    if (!sessionToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Dashboard session secret is not configured. Set DASHBOARD_SESSION_SECRET.",
        },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(DASHBOARD_AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Secure in production, allow http in dev
      secure: process.env.NODE_ENV === "production",
      maxAge: DASHBOARD_SESSION_TTL_SECONDS,
    });

    // Push to Attio CRM and email Jake after response is sent
    // (after() keeps the function alive past the response)
    after(async () => {
      try {
        await trackGateAccess(trimmedName, trimmedEmail, "AeroVision demo");
      } catch (err) {
        console.error("[verify-passcode] CRM/notification error:", err);
      }
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
