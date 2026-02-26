import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BraveSearchProvider } from "../../src/tools/brave-search.js";

const mockResults = {
  web: {
    results: [
      {
        title: "Wedding Venue in Ischia",
        url: "https://example.com/venue1",
        description: "Beautiful seaside venue for weddings",
      },
      {
        title: "Best Ischia Venues",
        url: "https://example.com/venue2",
        description: "Top rated wedding locations",
      },
      {
        title: "Ischia Wedding Guide",
        url: "https://example.com/guide",
        description: "Complete planning guide",
      },
    ],
  },
};

describe("BraveSearchProvider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns mapped search results", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);

    const provider = new BraveSearchProvider("test-key");
    const results = await provider.search("wedding venues Ischia");

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      title: "Wedding Venue in Ischia",
      url: "https://example.com/venue1",
      snippet: "Beautiful seaside venue for weddings",
    });
  });

  it("sends correct headers with API key", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    } as Response);

    const provider = new BraveSearchProvider("my-brave-key");
    await provider.search("test");

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect((url as URL).toString()).toContain("api.search.brave.com");
    expect((init as RequestInit).headers).toMatchObject({
      "X-Subscription-Token": "my-brave-key",
    });
  });

  it("passes query and count as URL params", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    } as Response);

    const provider = new BraveSearchProvider("key");
    await provider.search("test query", 3);

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    const parsed = new URL((url as URL).toString());
    expect(parsed.searchParams.get("q")).toBe("test query");
    expect(parsed.searchParams.get("count")).toBe("3");
  });

  it("respects maxResults", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);

    const provider = new BraveSearchProvider("key");
    const results = await provider.search("test", 2);

    expect(results).toHaveLength(2);
  });

  it("throws on HTTP error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const provider = new BraveSearchProvider("bad-key");
    await expect(provider.search("test")).rejects.toThrow("HTTP 401");
  });

  it("returns empty array when no web results", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const provider = new BraveSearchProvider("key");
    const results = await provider.search("test");

    expect(results).toEqual([]);
  });
});
