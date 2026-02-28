import { tool } from "ai";
import { z } from "zod";
import type { EmbeddingService } from "../db/embeddings.js";

export function makeSemanticSearchTool(embeddingService: EmbeddingService) {
  return tool({
    description:
      "Search all data in the database using natural language semantic similarity. " +
      "Searches across vendors, research notes, communications, quotes, tasks, budget entries, and chat history. " +
      "Use sourceType to narrow results to a specific data type.",
    inputSchema: z.object({
      query: z.string().describe("Natural language search query"),
      sourceType: z
        .enum([
          "vendors",
          "vendor_attributes",
          "research_notes",
          "communications",
          "quotes",
          "tasks",
          "budget_entries",
          "research_messages",
        ])
        .optional()
        .describe("Optional: filter results to a specific data type"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .default(10)
        .describe("Maximum number of results to return (default 10)"),
    }),
    execute: async ({ query, sourceType, limit }) => {
      try {
        const results = await embeddingService.search(query, sourceType, limit);
        if (results.length === 0 && !embeddingService.hasEmbedFn()) {
          return {
            error:
              "Semantic search requires an OpenAI API key to be configured. " +
              "Ask the user to add their OpenAI API key in Settings > AI.",
          };
        }
        return { results };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Search failed" };
      }
    },
  });
}
