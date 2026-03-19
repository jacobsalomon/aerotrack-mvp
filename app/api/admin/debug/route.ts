// GET /api/admin/debug — Query database for debugging
// Protected by the same dashboard passcode (cookie-based)
// Usage: /api/admin/debug?table=CaptureEvidence&sessionId=xxx
//        /api/admin/debug?table=CaptureSession&limit=10
//        /api/admin/debug?table=CaptureSession&id=xxx

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");
  const sessionId = searchParams.get("sessionId");
  const id = searchParams.get("id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  if (!table) {
    return NextResponse.json({
      error: "Missing ?table= parameter",
      availableTables: [
        "CaptureSession",
        "CaptureEvidence",
        "DocumentGeneration2",
        "SessionAnalysis",
        "VideoAnnotation",
        "AuditLogEntry",
        "User (Technicians)",
        "Organization",
      ],
      usage: "?table=CaptureEvidence&sessionId=xxx",
    });
  }

  try {
    let data: unknown;

    switch (table) {
      case "CaptureSession": {
        const where: Record<string, unknown> = {};
        if (id) where.id = id;
        data = await prisma.captureSession.findMany({
          where,
          orderBy: { startedAt: "desc" },
          take: limit,
          include: {
            user: { select: { firstName: true, lastName: true, badgeNumber: true } },
            _count: { select: { evidence: true, documents: true } },
          },
        });
        break;
      }

      case "CaptureEvidence": {
        const where: Record<string, unknown> = {};
        if (sessionId) where.sessionId = sessionId;
        if (id) where.id = id;
        data = await prisma.captureEvidence.findMany({
          where,
          orderBy: { capturedAt: "asc" },
          take: limit,
          select: {
            id: true,
            sessionId: true,
            type: true,
            fileUrl: true,
            fileSize: true,
            mimeType: true,
            durationSeconds: true,
            transcription: true,
            capturedAt: true,
            createdAt: true,
          },
        });
        break;
      }

      case "DocumentGeneration2": {
        const where: Record<string, unknown> = {};
        if (sessionId) where.sessionId = sessionId;
        if (id) where.id = id;
        data = await prisma.documentGeneration2.findMany({
          where,
          orderBy: { generatedAt: "desc" },
          take: limit,
        });
        break;
      }

      case "SessionAnalysis": {
        const where: Record<string, unknown> = {};
        if (sessionId) where.sessionId = sessionId;
        data = await prisma.sessionAnalysis.findMany({
          where,
          take: limit,
        });
        break;
      }

      case "VideoAnnotation": {
        const where: Record<string, unknown> = {};
        if (id) where.id = id;
        // VideoAnnotation links to evidence, filter by session via evidence
        if (sessionId) {
          const evidenceIds = await prisma.captureEvidence.findMany({
            where: { sessionId },
            select: { id: true },
          });
          where.evidenceId = { in: evidenceIds.map((e) => e.id) };
        }
        data = await prisma.videoAnnotation.findMany({
          where,
          orderBy: { timestamp: "asc" },
          take: limit,
        });
        break;
      }

      case "AuditLogEntry": {
        const where: Record<string, unknown> = {};
        if (sessionId) where.entityId = sessionId;
        data = await prisma.auditLogEntry.findMany({
          where,
          orderBy: { timestamp: "desc" },
          take: limit,
        });
        break;
      }

      case "User (Technicians)": {
        data = await prisma.user.findMany({
          take: limit,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            badgeNumber: true,
            role: true,
            organizationId: true,
          },
        });
        break;
      }

      case "Organization": {
        data = await prisma.organization.findMany({ take: limit });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
    }

    return NextResponse.json({ table, count: Array.isArray(data) ? data.length : 1, data });
  } catch (error) {
    console.error("Debug query error:", error);
    return NextResponse.json(
      { error: "Query failed", details: String(error) },
      { status: 500 }
    );
  }
}
