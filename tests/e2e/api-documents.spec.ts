// API Tests — Documents & PDF Generation (US-004)
// HTTP-based tests for document download and PDF rendering.

import { test, expect } from "@playwright/test";
import { url, authHeaders } from "./helpers";

test.describe("POST /api/documents/render-8130-pdf", () => {
  test("renders a PDF from valid form data", async ({ request }) => {
    const res = await request.post(url("/api/documents/render-8130-pdf"), {
      headers: authHeaders,
      data: {
        data: {
          block1: "FAA",
          block2: "Authorized Release Certificate",
          block3: "TEST-TRACK-001",
          block4: "Test Facility\n123 Test Ave\nTest City, TX 78701",
          block5: "WO-TEST-001",
          block6a: "High Pressure Compressor Rotor",
          block6b: "881700-1001",
          block6c: "SN-TEST-001",
          block6d: "1",
          block6e: "Overhauled",
          block7: "Component overhauled per CMM 72-00-00.\nAll measurements within limits.",
          block8: "",
          block9: "",
          block10: "",
          block11: "RS-TEST-001",
          block12: "2024-06-15",
          block13: "Test Mechanic / A&P #123456",
          block14: "I certify this part is airworthy.",
        },
      },
    });

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");

    // Verify PDF magic bytes
    const buffer = await res.body();
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer[0]).toBe(0x25); // %
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x44); // D
    expect(buffer[3]).toBe(0x46); // F
  });

  test("returns 400 when form data is missing", async ({ request }) => {
    const res = await request.post(url("/api/documents/render-8130-pdf"), {
      headers: authHeaders,
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("handles long block7 text (multi-page PDF)", async ({ request }) => {
    const longText = Array(100)
      .fill("Test line for verifying multi-page PDF generation.")
      .join("\n");

    const res = await request.post(url("/api/documents/render-8130-pdf"), {
      headers: authHeaders,
      data: {
        data: {
          block1: "FAA",
          block2: "Test",
          block3: "OVERFLOW-TEST",
          block4: "Test",
          block5: "WO-001",
          block6a: "Test Part",
          block6b: "TEST-001",
          block6c: "SN-001",
          block6d: "1",
          block6e: "Overhauled",
          block7: longText,
          block8: "",
          block9: "",
          block10: "",
          block11: "RS-001",
          block12: "2024-01-01",
          block13: "Test",
          block14: "Test",
        },
      },
    });

    expect(res.status()).toBe(200);
    const buffer = await res.body();
    expect(buffer.length).toBeGreaterThan(5000);
  });
});

test.describe("GET /api/documents/download/[id]", () => {
  test("returns 404 for non-existent document", async ({ request }) => {
    const res = await request.get(url("/api/documents/download/nonexistent-id"), {
      headers: authHeaders,
    });
    expect(res.status()).toBe(404);
  });

  test("returns a valid PDF for a seeded document", async ({ request }) => {
    // Get the demo component which has generated documents
    const compRes = await request.get(url("/api/components/demo-hpc7-overhaul"), { headers: authHeaders });
    const comp = await compRes.json();

    // Find a generated document from the lifecycle events
    let docId: string | null = null;
    for (const event of comp.events) {
      if (event.generatedDocs && event.generatedDocs.length > 0) {
        docId = event.generatedDocs[0].id;
        break;
      }
    }

    if (!docId) return; // Skip if no docs found

    const res = await request.get(url(`/api/documents/download/${docId}`), {
      headers: authHeaders,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");

    const buffer = await res.body();
    expect(buffer[0]).toBe(0x25); // %PDF
    expect(buffer[1]).toBe(0x50);
  });
});
