// POST /api/auth/verify-passcode
// Validates the passcode server-side so the actual code is never
// exposed in the client-side JavaScript bundle.
// Sets a cookie on success so subsequent API calls can be authenticated.

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  createDashboardSessionToken,
  DASHBOARD_AUTH_COOKIE_NAME,
  DASHBOARD_SESSION_TTL_SECONDS,
  getConfiguredDashboardPasscode,
} from "@/lib/dashboard-auth";

export async function POST(request: Request) {
  try {
    const { passcode } = await request.json();

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

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
