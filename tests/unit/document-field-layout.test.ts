import { describe, expect, it } from "vitest";
import {
  getDocumentFieldSections,
  getValueAtPath,
  setValueAtPath,
} from "@/lib/document-field-layout";

describe("document-field-layout", () => {
  it("reads flat dotted keys directly when documents are stored in flat form", () => {
    const fields = {
      "aircraft.registration": "N123AV",
      "aircraft.serialNumber": "MSN-42",
    };

    expect(getValueAtPath(fields, "aircraft.registration")).toBe("N123AV");
    expect(getDocumentFieldSections("337", fields).flatMap((section) => section.entries)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "aircraft.registration", value: "N123AV" }),
        expect.objectContaining({ key: "aircraft.serialNumber", value: "MSN-42" }),
      ])
    );
  });

  it("preserves flat dotted key storage when editing an existing flat field", () => {
    const fields: Record<string, unknown> = {
      "approval.status": "Pending",
    };

    setValueAtPath(fields, "approval.status", "Approved");

    expect(fields["approval.status"]).toBe("Approved");
    expect(fields.approval).toBeUndefined();
  });
});
