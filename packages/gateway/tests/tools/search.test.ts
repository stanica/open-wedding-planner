import { describe, it, expect, beforeEach } from "vitest";
import { searchTool, setSearchProvider } from "../../src/tools/search.js";
import type { SearchProvider, SearchResult } from "../../src/tools/search.js";

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
    const results = (await searchTool.execute!(
      { query: "wedding venues Ischia", maxResults: 5 },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    )) as SearchResult[];
    expect(results).toHaveLength(2);
    expect(results[0].title).toContain("wedding venues Ischia");
    expect(results[0].url).toBe("https://example.com/1");
  });

  it("respects maxResults", async () => {
    const results = (await searchTool.execute!(
      { query: "test", maxResults: 1 },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    )) as SearchResult[];
    expect(results).toHaveLength(1);
  });

  it("uses DuckDuckGo fallback without provider", async () => {
    setSearchProvider(null as unknown as SearchProvider);
    // Without a custom provider, execute falls back to DuckDuckGo.
    // In test env this may return results or empty array — just verify it returns an array.
    const results = (await searchTool.execute!(
      { query: "test", maxResults: 5 },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    )) as SearchResult[];
    expect(Array.isArray(results)).toBe(true);
  });
});
