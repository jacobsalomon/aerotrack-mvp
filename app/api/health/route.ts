// Health check — tests if Node.js functions work.

export async function GET() {
  return Response.json({ ok: true, runtime: "nodejs", time: new Date().toISOString() });
}
