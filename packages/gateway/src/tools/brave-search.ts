import type { SearchProvider, SearchResult } from "./search.js";

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: { results: BraveWebResult[] };
}

export class BraveSearchProvider implements SearchProvider {
  constructor(private apiKey: string) {}

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(maxResults));

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.apiKey,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Brave Search failed: HTTP ${res.status}`);
    }

    const data: BraveSearchResponse = await res.json();
    const results = data.web?.results ?? [];

    return results.slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  }
}
