// POST /api/auth/verify-passcode
// Validates the passcode server-side so the actual code is never
// exposed in the client-side JavaScript bundle.
// Sets a cookie on success so subsequent API calls can be authenticated.

import { NextResponse } from "next/server";

const PASSCODE = process.env.PASSCODE || "2206";
const COOKIE_NAME = "av-session";
// Simple token — in production this would be a signed JWT
const SESSION_TOKEN = "authenticated";

export async function POST(request: Request) {
  try {
    const { passcode } = await request.json();

    if (passcode !== PASSCODE) {
      return NextResponse.json(
        { success: false, error: "Incorrect passcode" },
        { status: 401 }
      );
    }

    // Set a session cookie so the browser sends it with future requests
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, SESSION_TOKEN, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Secure in production, allow http in dev
      secure: process.env.NODE_ENV === "production",
      // Session cookie — expires when browser closes
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
