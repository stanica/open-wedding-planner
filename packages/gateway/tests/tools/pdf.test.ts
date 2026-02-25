import { describe, it, expect, beforeEach } from "vitest";
import { pdfTool, setPdfFetchFn, setPdfParseFn } from "../../src/tools/pdf.js";

describe("pdfTool", () => {
  beforeEach(() => {
    setPdfFetchFn(async () => Buffer.from("fake-pdf-content"));
    setPdfParseFn(async () => ({
      text: "Wedding Package Pricing\n\nVenue hire: €5,000\nCatering per person: €150\n",
      numpages: 3,
      info: { Title: "Wedding Packages 2026" },
    }));
  });

  it("parses PDF and returns text content", async () => {
    const result = await pdfTool.execute(
      { url: "https://example.com/packages.pdf" },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result.url).toBe("https://example.com/packages.pdf");
    expect(result.text).toContain("Wedding Package Pricing");
    expect(result.text).toContain("€5,000");
    expect(result.pages).toBe(3);
    expect(result.info.Title).toBe("Wedding Packages 2026");
  });

  it("truncates long text", async () => {
    setPdfParseFn(async () => ({
      text: "x".repeat(25_000),
      numpages: 1,
      info: {},
    }));
    const result = await pdfTool.execute(
      { url: "https://example.com/long.pdf" },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result.text.length).toBe(20_000);
  });
});
