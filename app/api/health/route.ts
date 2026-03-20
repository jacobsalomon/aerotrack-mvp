// Health check — tests if Node.js functions work.
// No edge runtime directive = runs on Node.js.

export async function GET() {
  console.log("[health] Function started");
  return new Response(
    JSON.stringify({ ok: true, runtime: "nodejs", time: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
}
