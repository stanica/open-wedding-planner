import { tool } from "ai";
import { z } from "zod";

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
    if (!searchProvider) {
      return [
        {
          title: "Search unavailable",
          url: "",
          snippet:
            "No search provider is configured. Use the browse or scrape tools to visit specific websites directly instead.",
        },
      ];
    }
    const results = await searchProvider.search(query, maxResults);
    return results;
  },
});
