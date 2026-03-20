// Lightweight Braintrust logging via REST API
// Logs every AI call (model, prompt summary, response, latency, task type)
// to Braintrust for quality evaluation and debugging.
// No SDK dependency — uses fetch() directly.

const BRAINTRUST_API_BASE = "https://api.braintrust.dev";

// Project ID is cached after first lookup
let cachedProjectId: string | null = null;

// ── Get or create project ──────────────────────────────────────────
async function getProjectId(): Promise<string | null> {
  if (cachedProjectId) return cachedProjectId;

  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (!apiKey) return null;

  try {
    // List projects to find "AeroVision"
    const res = await fetch(`${BRAINTRUST_API_BASE}/v1/project`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[Braintrust] Failed to list projects: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const projects = data.objects || data;
    const project = Array.isArray(projects)
      ? projects.find(
          (p: { name: string }) =>
            p.name.toLowerCase() === "aerovision" ||
            p.name.toLowerCase() === "aerovision-mvp"
        )
      : null;

    if (project) {
      cachedProjectId = project.id;
      return cachedProjectId;
    }

    // Create the project if it doesn't exist
    const createRes = await fetch(`${BRAINTRUST_API_BASE}/v1/project`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "AeroVision" }),
      signal: AbortSignal.timeout(5000),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      cachedProjectId = created.id;
      console.log(`[Braintrust] Created project "AeroVision" (${cachedProjectId})`);
      return cachedProjectId;
    }

    console.warn(`[Braintrust] Failed to create project: ${createRes.status}`);
    return null;
  } catch (err) {
    console.warn(`[Braintrust] Project lookup failed: ${err}`);
    return null;
  }
}

// ── Log an AI call ─────────────────────────────────────────────────
export async function logAICall(opts: {
  taskName: string;
  model: string;
  provider: string;
  input: string | Record<string, unknown>;
  output: string | Record<string, unknown>;
  latencyMs: number;
  success: boolean;
  fallbackLevel: number;
  error?: string;
}): Promise<void> {
  const projectId = await getProjectId();
  if (!projectId) return; // Braintrust not configured — silently skip

  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (!apiKey) return;

  const now = Date.now() / 1000; // Unix timestamp in seconds

  try {
    await fetch(
      `${BRAINTRUST_API_BASE}/v1/project_logs/${projectId}/insert`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          events: [
            {
              input:
                typeof opts.input === "string"
                  ? { text: opts.input.slice(0, 2000) }
                  : opts.input,
              output:
                typeof opts.output === "string"
                  ? { text: opts.output.slice(0, 2000) }
                  : opts.output,
              metadata: {
                task: opts.taskName,
                model: opts.model,
                provider: opts.provider,
                fallbackLevel: opts.fallbackLevel,
                success: opts.success,
                environment: process.env.VERCEL_ENV || "development",
              },
              metrics: {
                start: now - opts.latencyMs / 1000,
                end: now,
              },
              span_attributes: {
                name: opts.taskName,
                type: "llm",
              },
              error: opts.error || null,
              tags: [
                opts.taskName,
                opts.provider,
                opts.success ? "success" : "failure",
                ...(opts.fallbackLevel > 0 ? ["fallback"] : []),
              ],
            },
          ],
        }),
      }
    );
  } catch {
    // Never let logging failures affect the main pipeline
  }
}
