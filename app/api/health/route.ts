// Health check — tests Node.js runtime and database connectivity.
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return Response.json({ ok: true, db: true, runtime: "nodejs", time: new Date().toISOString() });
  } catch (e) {
    return Response.json(
      { ok: false, db: false, runtime: "nodejs", error: String(e), time: new Date().toISOString() },
      { status: 503 }
    );
  }
}
