import { describe, it, expect, vi } from "vitest";
import { createPlaywrightTools } from "../../src/tools/playwright-tools.js";

function mockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue("Test Page"),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    evaluate: vi.fn().mockResolvedValue("evaluated result"),
    locator: vi.fn().mockReturnValue({
      textContent: vi.fn().mockResolvedValue("link text"),
    }),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue("https://example.com"),
    $$eval: vi.fn().mockResolvedValue([]),
  };
}

describe("createPlaywrightTools", () => {
  it("creates all expected tools", () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "navigate", "click", "type", "screenshot",
        "extractText", "extractLinks", "extractImages",
        "scroll", "waitForSelector", "evaluate",
      ]),
    );
  });

  it("navigate calls page.goto", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    const result = await tools.navigate.execute!(
      { url: "https://example.com" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.goto).toHaveBeenCalledWith("https://example.com", expect.any(Object));
    expect(result).toHaveProperty("title");
  });

  it("click calls page.click", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    await tools.click.execute!(
      { selector: "button.submit" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.click).toHaveBeenCalledWith("button.submit", expect.any(Object));
  });

  it("type calls page.fill", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    await tools.type.execute!(
      { selector: "input.name", text: "Wedding Co" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.fill).toHaveBeenCalledWith("input.name", "Wedding Co");
  });

  it("screenshot returns base64 image", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    const result = await tools.screenshot.execute!(
      {},
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.screenshot).toHaveBeenCalled();
    expect(result).toHaveProperty("image");
  });

  it("evaluate runs JS in page context", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    const result = await tools.evaluate.execute!(
      { script: "document.title" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.evaluate).toHaveBeenCalledWith("document.title");
    expect(result).toHaveProperty("result");
  });
});
