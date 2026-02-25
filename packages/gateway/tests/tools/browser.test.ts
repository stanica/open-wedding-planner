import { describe, it, expect, beforeEach } from "vitest";
import { browserTool, setBrowseFn } from "../../src/tools/browser.js";

describe("browserTool", () => {
  beforeEach(() => {
    setBrowseFn(async (url, options) => ({
      url,
      title: "Mocked Page",
      textContent: "Wedding venue in Ischia with beautiful sea views and garden ceremony area.",
      selectedContent: options?.selector ? "Selected content for " + options.selector : undefined,
    }));
  });

  it("returns browsed page content", async () => {
    const result = await browserTool.execute(
      { url: "https://example.com" },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result.title).toBe("Mocked Page");
    expect(result.textContent).toContain("Wedding venue");
  });

  it("returns selected content when selector provided", async () => {
    const result = await browserTool.execute(
      { url: "https://example.com", selector: ".pricing" },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result.selectedContent).toContain(".pricing");
  });
});
