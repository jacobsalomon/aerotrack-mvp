import { describe, expect, it } from "vitest";
import { getPass2RetryDisposition } from "@/lib/ai/cmm-extraction-pass2";

describe("CMM Pass 2 retry disposition", () => {
  it("defers retries until a later invocation before the retry cap", () => {
    expect(getPass2RetryDisposition(1)).toBe("retry_later");
    expect(getPass2RetryDisposition(2)).toBe("retry_later");
  });

  it("skips the page only after the max retry count is reached", () => {
    expect(getPass2RetryDisposition(3)).toBe("skip_page");
    expect(getPass2RetryDisposition(4)).toBe("skip_page");
  });
});
