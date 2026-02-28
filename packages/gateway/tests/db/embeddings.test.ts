import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { EmbeddingService } from "../../src/db/embeddings.js";

function randomEmbedding(seed: number): number[] {
  // Deterministic pseudo-random for testing
  const arr = new Array(1536);
  let s = seed;
  for (let i = 0; i < 1536; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    arr[i] = (s / 0x7fffffff) * 2 - 1;
  }
  // Normalize
  const norm = Math.sqrt(arr.reduce((acc: number, v: number) => acc + v * v, 0));
  return arr.map((v: number) => v / norm);
}

describe("embeddings", () => {
  let sqlite: Database.Database;
  let service: EmbeddingService;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
  });

  it("stores and retrieves embeddings", async () => {
    const emb1 = randomEmbedding(1);
    service = new EmbeddingService(sqlite, async () => emb1);

    await service.upsert("vendors", 1, "Villa Elegante wedding venue");

    // Query with same embedding should find it
    const similar = await service.search("Villa Elegante");
    expect(similar).toHaveLength(1);
    expect(similar[0].sourceId).toBe(1);
    expect(similar[0].distance).toBeCloseTo(0, 1);
  });

  it("finds similar vendors within threshold", async () => {
    const emb1 = randomEmbedding(1);
    const emb2 = randomEmbedding(2);

    let callCount = 0;
    service = new EmbeddingService(sqlite, async () => {
      callCount++;
      // First two calls store, third call queries
      if (callCount <= 1) return emb1;
      if (callCount <= 2) return emb2;
      return emb1; // Query returns same as vendor 1
    });

    await service.upsert("vendors", 1, "Villa Elegante");
    await service.upsert("vendors", 2, "Totally different place");

    // Query with emb1 — should find vendor 1 closest
    const similar = await service.search("Villa Elegante", "vendors", 1);
    expect(similar).toHaveLength(1);
    expect(similar[0].sourceId).toBe(1);
  });

  it("returns empty when no similar vendors", async () => {
    service = new EmbeddingService(sqlite, async () => randomEmbedding(99));
    const similar = await service.search("anything");
    expect(similar).toHaveLength(0);
  });
});
