// Minimal health check — no imports, no DB, no auth.
// Force edge runtime to test if the issue is Node.js function init.
export const runtime = "edge";

export async function GET() {
  return new Response(
    JSON.stringify({ ok: true, time: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
}
