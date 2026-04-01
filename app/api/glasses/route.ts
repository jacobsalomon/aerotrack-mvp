import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";

const BRIDGE_URL = process.env.MENTRA_BRIDGE_URL || "http://localhost:7010";
const BRIDGE_SECRET = process.env.MENTRA_BRIDGE_SECRET || "";

async function loadAuthorizedSession(sessionId: string, organizationId: string | null) {
  if (!organizationId) return null;
  return prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      sessionType: true,
      status: true,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const action = String(body.action || "").trim();
    const sessionId = String(body.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const session = await loadAuthorizedSession(sessionId, auth.user.organizationId);
    if (!session || session.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // User-level ownership: regular USERs can only control their own sessions.
    // Supervisors and admins can control any session in their org.
    if (auth.user.role === "USER" && session.userId !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action !== "start" && action !== "stop") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const bridgePath =
      action === "start"
        ? "/api/glasses/capture/start"
        : "/api/glasses/capture/stop";

    const res = await fetch(`${BRIDGE_URL}${bridgePath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mentra-bridge-secret": BRIDGE_SECRET,
      },
      body: JSON.stringify({ sessionId }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[Glasses API] Bridge proxy error:", err);
    return NextResponse.json(
      { error: "Bridge server unavailable" },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const session = await loadAuthorizedSession(sessionId, auth.user.organizationId);
    if (!session || session.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // User-level ownership: regular USERs can only view their own sessions.
    // Supervisors and admins can view any session in their org.
    if (auth.user.role === "USER" && session.userId !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const res = await fetch(
      `${BRIDGE_URL}/api/glasses/status/${encodeURIComponent(sessionId)}`,
      {
        headers: {
          "x-mentra-bridge-secret": BRIDGE_SECRET,
        },
      }
    );

    const data = await res.json();
    return NextResponse.json({
      ...data,
      sessionType: session.sessionType,
      sessionStatus: session.status,
    });
  } catch (err) {
    console.error("[Glasses API] Status poll error:", err);
    return NextResponse.json({ connected: false });
  }
}
