import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import {
  createEmbeddingsTable,
  storeVendorEmbedding,
  findSimilarVendors,
  setEmbedFn,
} from "../../src/db/embeddings.js";

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

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
    createEmbeddingsTable(sqlite);
  });

  it("stores and retrieves embeddings", async () => {
    const emb1 = randomEmbedding(1);
    setEmbedFn(async () => emb1);

    await storeVendorEmbedding(sqlite, 1, "Villa Elegante wedding venue");

    // Query with same embedding should find it
    const similar = await findSimilarVendors(sqlite, "Villa Elegante", 1.0);
    expect(similar).toHaveLength(1);
    expect(similar[0].vendorId).toBe(1);
    expect(similar[0].distance).toBeCloseTo(0, 1);
  });

  it("finds similar vendors within threshold", async () => {
    const emb1 = randomEmbedding(1);
    const emb2 = randomEmbedding(2);

    let callCount = 0;
    setEmbedFn(async () => {
      callCount++;
      // First two calls store, third call queries
      if (callCount <= 1) return emb1;
      if (callCount <= 2) return emb2;
      return emb1; // Query returns same as vendor 1
    });

    await storeVendorEmbedding(sqlite, 1, "Villa Elegante");
    await storeVendorEmbedding(sqlite, 2, "Totally different place");

    // Query with emb1 — should find vendor 1 close, vendor 2 far
    const similar = await findSimilarVendors(sqlite, "Villa Elegante", 0.1);
    expect(similar).toHaveLength(1);
    expect(similar[0].vendorId).toBe(1);
  });

  it("returns empty when no similar vendors", async () => {
    setEmbedFn(async () => randomEmbedding(99));
    const similar = await findSimilarVendors(sqlite, "anything", 0.5);
    expect(similar).toHaveLength(0);
  });
});
