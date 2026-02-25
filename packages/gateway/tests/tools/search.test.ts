import { describe, it, expect, beforeEach } from "vitest";
import { searchTool, setSearchProvider } from "../../src/tools/search.js";
import type { SearchProvider } from "../../src/tools/search.js";

const mockProvider: SearchProvider = {
  async search(query: string, maxResults = 5) {
    return [
      {
        title: `Result for: ${query}`,
        url: "https://example.com/1",
        snippet: "A great wedding venue",
      },
      {
        title: "Another venue",
        url: "https://example.com/2",
        snippet: "Beautiful gardens",
      },
    ].slice(0, maxResults);
  },
};

describe("searchTool", () => {
  beforeEach(() => {
    setSearchProvider(mockProvider);
  });

  it("returns search results", async () => {
    const results = await searchTool.execute(
      { query: "wedding venues Ischia", maxResults: 5 },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(results).toHaveLength(2);
    expect(results[0].title).toContain("wedding venues Ischia");
    expect(results[0].url).toBe("https://example.com/1");
  });

  it("respects maxResults", async () => {
    const results = await searchTool.execute(
      { query: "test", maxResults: 1 },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(results).toHaveLength(1);
  });

  it("throws without provider", async () => {
    setSearchProvider(null as unknown as SearchProvider);
    await expect(
      searchTool.execute(
        { query: "test", maxResults: 5 },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
      ),
    ).rejects.toThrow("No search provider configured");
  });
});
