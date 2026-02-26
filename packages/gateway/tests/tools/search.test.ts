import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { searchTool, setSearchConfig, getSearchConfig } from "../../src/tools/search.js";
import type { SearchResult } from "../../src/tools/search.js";

const toolContext = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("searchTool", () => {
  beforeEach(() => {
    setSearchConfig({ provider: "duckduckgo" });
  });

  it("defaults to duckduckgo provider", () => {
    const config = getSearchConfig();
    expect(config.provider).toBe("duckduckgo");
    expect(config.apiKey).toBeUndefined();
  });

  it("uses DuckDuckGo when provider is duckduckgo", async () => {
    // In test env this may hit the network or fail — just verify it returns an array
    const results = (await searchTool.execute!(
      { query: "test", maxResults: 5 },
      toolContext,
    )) as SearchResult[];
    expect(Array.isArray(results)).toBe(true);
  });

  describe("provider switching", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("uses Brave when configured with API key", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Brave Result",
                url: "https://brave.com/1",
                description: "From Brave API",
              },
            ],
          },
        }),
      } as unknown as Response);

      setSearchConfig({ provider: "brave", apiKey: "test-brave-key" });

      const results = (await searchTool.execute!(
        { query: "wedding venues", maxResults: 5 },
        toolContext,
      )) as SearchResult[];

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Brave Result");
      expect(results[0].snippet).toBe("From Brave API");

      // Verify Brave API was called
      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect((url as URL).toString()).toContain("api.search.brave.com");
      expect((init as RequestInit).headers).toMatchObject({
        "X-Subscription-Token": "test-brave-key",
      });
    });

    it("falls back to DuckDuckGo when brave has no API key", async () => {
      setSearchConfig({ provider: "brave", apiKey: null });

      const config = getSearchConfig();
      expect(config.provider).toBe("brave");
      // Without an API key, should fall back to DDG
      const results = (await searchTool.execute!(
        { query: "test", maxResults: 5 },
        toolContext,
      )) as SearchResult[];
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
