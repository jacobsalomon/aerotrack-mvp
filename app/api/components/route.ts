import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/components — list all components with optional search
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { partNumber: { contains: search } },
        { serialNumber: { contains: search } },
        { description: { contains: search } },
        { currentOperator: { contains: search } },
        { currentAircraft: { contains: search } },
      ];
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const components = await prisma.component.findMany({
      where,
      include: {
        _count: {
          select: {
            events: true,
            alerts: true,
          },
        },
        alerts: {
          where: { status: "open" },
          select: { severity: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(components);
  } catch (error) {
    console.error("API /components error:", error);
    return NextResponse.json(
      { error: String(error), env: { hasTursoUrl: !!process.env.TURSO_DATABASE_URL, hasTursoToken: !!process.env.TURSO_AUTH_TOKEN } },
      { status: 500 }
    );
  }
}
