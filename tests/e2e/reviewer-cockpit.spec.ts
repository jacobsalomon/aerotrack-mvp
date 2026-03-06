import { test, expect } from "@playwright/test";
import { authHeaders, bypassPasscode, url } from "./helpers";

interface SessionDetailDoc {
  id: string;
  documentType: string;
  status: string;
  lowConfidenceFields: string | null;
  verificationJson: string | null;
  provenanceJson: string | null;
  reviewNotes: string | null;
}

interface SessionDetail {
  id: string;
  documents: SessionDetailDoc[];
}

const TEST_IDS = {
  session: "e2e-review-session",
  document: "e2e-review-doc",
  secondaryDocument: "e2e-review-doc-337",
};

function sanitizeFieldAnchor(fieldKey: string): string {
  return fieldKey.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

test.describe("Reviewer cockpit", () => {
  test("persists certifier field dispositions through the browser flow", async ({ page, request }) => {
    const target = {
      sessionId: TEST_IDS.session,
      documentId: TEST_IDS.document,
      fieldKey: "block6b",
    };
    const rationale = `E2E rationale ${Date.now()}`;

    await bypassPasscode(page);
    await page.goto(url(`/sessions/${target.sessionId}`));
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Reviewer Cockpit", { exact: true })).toBeVisible();
    await expect(page.getByText("Procedure Steps (5/5)")).toBeVisible();
    await expect(page.getByText("5 of 5 steps completed")).toBeVisible();

    const documentContainer = page.locator(`#document-${target.documentId}`);
    await expect(documentContainer).toBeVisible();

    const fieldLocator = page.locator(
      `#field-${target.documentId}-${sanitizeFieldAnchor(target.fieldKey)}`
    );

    if (!(await fieldLocator.isVisible())) {
      await documentContainer.locator(":scope > div").first().click();
    }

    await expect(fieldLocator).toBeVisible();

    await fieldLocator.getByRole("button", { name: "Accept with rationale" }).click();
    await fieldLocator.getByPlaceholder("Explain why this field is acceptable despite the blocker.").fill(rationale);
    await fieldLocator.getByRole("button", { name: "Save disposition" }).click();

    await expect(fieldLocator.getByText("Accepted with rationale")).toBeVisible();
    await expect(fieldLocator.getByText(`Rationale: ${rationale}`)).toBeVisible();

    const detailAfterSaveRes = await request.get(url(`/api/sessions/${target.sessionId}`), {
      headers: authHeaders,
    });
    expect(detailAfterSaveRes.ok()).toBeTruthy();
    const savedDetail = (await detailAfterSaveRes.json()) as SessionDetail;
    const savedDoc = savedDetail.documents.find((doc) => doc.id === target.documentId);
    expect(savedDoc).toBeTruthy();

    const savedReviewState = safeParseJson<{
      fieldDispositions?: Record<string, { status?: string; rationale?: string }>;
    } | null>(savedDoc?.reviewNotes || null, null);
    expect(savedReviewState?.fieldDispositions?.[target.fieldKey]?.status).toBe("accepted_with_rationale");
    expect(savedReviewState?.fieldDispositions?.[target.fieldKey]?.rationale).toBe(rationale);

    await fieldLocator.getByRole("button", { name: "Clear" }).click();

    const detailAfterClearRes = await request.get(url(`/api/sessions/${target.sessionId}`), {
      headers: authHeaders,
    });
    expect(detailAfterClearRes.ok()).toBeTruthy();
    const clearedDetail = (await detailAfterClearRes.json()) as SessionDetail;
    const clearedDoc = clearedDetail.documents.find((doc) => doc.id === target.documentId);
    const clearedReviewState = safeParseJson<{
      fieldDispositions?: Record<string, { status?: string; rationale?: string }>;
    } | null>(clearedDoc?.reviewNotes || null, null);
    expect(clearedReviewState?.fieldDispositions?.[target.fieldKey]).toBeUndefined();

    const secondaryDocument = page.locator(`#document-${TEST_IDS.secondaryDocument}`);
    await expect(secondaryDocument).toBeVisible();
    await secondaryDocument.locator(":scope > div").first().click();
    await expect(
      page.locator(`#field-${TEST_IDS.secondaryDocument}-aircraft-registration`).getByText("N89247")
    ).toBeVisible();
  });
});
