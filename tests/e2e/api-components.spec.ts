// API Tests — Components & Parts (US-002)
// HTTP-based tests against the running dev server.

import { test, expect } from "@playwright/test";
import { url, authHeaders } from "./helpers";

const API = url("/api/components");

test.describe("GET /api/components", () => {
  test("returns all components with correct shape", async ({ request }) => {
    const res = await request.get(API, { headers: authHeaders });
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    // Check shape of first component
    const c = data[0];
    expect(c).toHaveProperty("id");
    expect(c).toHaveProperty("partNumber");
    expect(c).toHaveProperty("serialNumber");
    expect(c).toHaveProperty("status");
    expect(c).toHaveProperty("description");
    expect(c).toHaveProperty("_count");
  });

  test("searches by part number", async ({ request }) => {
    const res = await request.get(`${API}?search=881700`, { headers: authHeaders });
    const data = await res.json();

    expect(res.status()).toBe(200);
    expect(data.length).toBeGreaterThan(0);
  });

  test("filters by status", async ({ request }) => {
    const res = await request.get(`${API}?status=serviceable`, { headers: authHeaders });
    const data = await res.json();

    expect(res.status()).toBe(200);
    for (const c of data) {
      expect(c.status).toBe("serviceable");
    }
  });

  test("returns empty array for non-matching search", async ({ request }) => {
    const res = await request.get(`${API}?search=NONEXISTENT12345`, { headers: authHeaders });
    const data = await res.json();

    expect(res.status()).toBe(200);
    expect(data).toEqual([]);
  });
});

test.describe("GET /api/components/[id]", () => {
  test("returns component with full lifecycle data", async ({ request }) => {
    const res = await request.get(`${API}/demo-hpc7-overhaul`, { headers: authHeaders });
    const data = await res.json();

    expect(res.status()).toBe(200);
    expect(data.id).toBe("demo-hpc7-overhaul");
    expect(data).toHaveProperty("events");
    expect(data).toHaveProperty("alerts");
    expect(data).toHaveProperty("documents");
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThan(0);
  });

  test("events are in chronological order", async ({ request }) => {
    const res = await request.get(`${API}/demo-hpc7-overhaul`, { headers: authHeaders });
    const data = await res.json();

    for (let i = 0; i < data.events.length - 1; i++) {
      const current = new Date(data.events[i].date).getTime();
      const next = new Date(data.events[i + 1].date).getTime();
      expect(current).toBeLessThanOrEqual(next);
    }
  });

  test("events include evidence and generated docs", async ({ request }) => {
    const res = await request.get(`${API}/demo-hpc7-overhaul`, { headers: authHeaders });
    const data = await res.json();

    // At least one event should have evidence
    const withEvidence = data.events.filter(
      (e: Record<string, unknown[]>) => e.evidence && e.evidence.length > 0
    );
    expect(withEvidence.length).toBeGreaterThan(0);

    // At least one event should have generated docs
    const withDocs = data.events.filter(
      (e: Record<string, unknown[]>) => e.generatedDocs && e.generatedDocs.length > 0
    );
    expect(withDocs.length).toBeGreaterThan(0);
  });

  test("returns 404 for invalid ID", async ({ request }) => {
    const res = await request.get(`${API}/nonexistent-id`, { headers: authHeaders });
    expect(res.status()).toBe(404);
  });
});
