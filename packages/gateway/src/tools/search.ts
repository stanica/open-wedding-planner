import { tool } from "ai";
import { z } from "zod";
import * as cheerio from "cheerio";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

let searchProvider: SearchProvider | null = null;

export function setSearchProvider(provider: SearchProvider) {
  searchProvider = provider;
}

/** Default search provider using DuckDuckGo HTML results (no API key needed) */
async function duckDuckGoSearch(query: string, maxResults = 5): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WeddingPlannerBot/1.0)",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $(".result").each((_i, el) => {
    if (results.length >= maxResults) return false;
    const $el = $(el);
    const title = $el.find(".result__title .result__a").text().trim();
    const href = $el.find(".result__title .result__a").attr("href") ?? "";
    const snippet = $el.find(".result__snippet").text().trim();
    if (title && href) {
      results.push({ title, url: href, snippet });
    }
  });

  return results;
}

export const searchTool = tool({
  description:
    "Search the web for wedding vendors, venues, services, or related information. Returns a list of search results with titles, URLs, and snippets.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    maxResults: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return"),
  }),
  execute: async ({ query, maxResults }) => {
    const provider = searchProvider ?? { search: duckDuckGoSearch };
    return provider.search(query, maxResults);
  },
});
