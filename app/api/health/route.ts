// Minimal health check — no imports, no DB, no auth.
// If this hangs, the issue is Vercel platform-level, not code.

export async function GET() {
  return new Response(
    JSON.stringify({ ok: true, time: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
}
