import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { EmbeddingService } from "../../src/db/embeddings.js";
import { makeSemanticSearchTool } from "../../src/tools/semantic-search.js";

function fakeEmbedding(seed: number): number[] {
  const arr = new Array(1536);
  let s = seed;
  for (let i = 0; i < 1536; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    arr[i] = (s / 0x7fffffff) * 2 - 1;
  }
  const norm = Math.sqrt(arr.reduce((a, v) => a + v * v, 0));
  return arr.map((v) => v / norm);
}

describe("semanticSearch tool", () => {
  let sqlite: Database.Database;
  let service: EmbeddingService;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
    const emb = fakeEmbedding(42);
    service = new EmbeddingService(sqlite, async () => emb);
  });

  it("returns search results", async () => {
    await service.upsert("vendors", 1, "Villa Elegante wedding venue in Tuscany");
    await service.upsert("communications", 5, "Email about pricing");

    const tool = makeSemanticSearchTool(service);
    const result = await tool.execute(
      { query: "wedding venue", limit: 10 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result).toHaveProperty("results");
    expect((result as any).results.length).toBe(2);
  });

  it("filters by sourceType", async () => {
    await service.upsert("vendors", 1, "Villa Elegante");
    await service.upsert("communications", 5, "Email about pricing");

    const tool = makeSemanticSearchTool(service);
    const result = await tool.execute(
      { query: "anything", sourceType: "vendors", limit: 10 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect((result as any).results.length).toBe(1);
    expect((result as any).results[0].sourceTable).toBe("vendors");
  });

  it("returns error message when no embed function", async () => {
    const noEmbedService = new EmbeddingService(sqlite, null);
    const tool = makeSemanticSearchTool(noEmbedService);
    const result = await tool.execute(
      { query: "test", limit: 10 },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );
    expect(result).toHaveProperty("error");
    expect((result as any).error).toContain("OpenAI API key");
  });
});
