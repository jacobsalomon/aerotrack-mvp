// Health check — tests if Node.js functions work after Sentry removal.
// No edge runtime directive = runs on Node.js (the broken runtime).

export async function GET() {
  return new Response(
    JSON.stringify({ ok: true, runtime: "nodejs", time: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
}
