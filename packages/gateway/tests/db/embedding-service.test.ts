import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { EmbeddingService } from "../../src/db/embeddings.js";

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

describe("EmbeddingService", () => {
  let sqlite: Database.Database;
  let service: EmbeddingService;
  let embedCallCount: number;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
    embedCallCount = 0;
    service = new EmbeddingService(sqlite, async (_text: string) => {
      embedCallCount++;
      return fakeEmbedding(embedCallCount);
    });
  });

  it("creates tables and triggers on init", () => {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("embedding_map");
    expect(names).toContain("pending_embeddings");
  });

  it("upserts an embedding and finds it via search", async () => {
    // Force same embedding for store and query
    const emb = fakeEmbedding(42);
    service = new EmbeddingService(sqlite, async () => emb);

    await service.upsert("vendors", 1, "Villa Elegante wedding venue in Tuscany");
    const results = await service.search("Villa Elegante", undefined, 5);
    expect(results.length).toBe(1);
    expect(results[0].sourceTable).toBe("vendors");
    expect(results[0].sourceId).toBe(1);
    expect(results[0].distance).toBeCloseTo(0, 1);
    expect(results[0].textPreview).toContain("Villa Elegante");
  });

  it("returns empty results when searching with no embeddings", async () => {
    const results = await service.search("anything", undefined, 10);
    expect(results).toEqual([]);
  });

  it("removes an embedding", async () => {
    const emb = fakeEmbedding(42);
    service = new EmbeddingService(sqlite, async () => emb);

    await service.upsert("vendors", 1, "Some vendor");
    service.remove("vendors", 1);
    const results = await service.search("Some vendor", undefined, 5);
    expect(results.length).toBe(0);
  });

  it("filters search by sourceType", async () => {
    const emb = fakeEmbedding(42);
    service = new EmbeddingService(sqlite, async () => emb);

    await service.upsert("vendors", 1, "Vendor text");
    await service.upsert("communications", 5, "Communication text");

    const vendorOnly = await service.search("text", "vendors", 10);
    expect(vendorOnly.length).toBe(1);
    expect(vendorOnly[0].sourceTable).toBe("vendors");

    const commOnly = await service.search("text", "communications", 10);
    expect(commOnly.length).toBe(1);
    expect(commOnly[0].sourceTable).toBe("communications");
  });

  it("updates embedding on re-upsert", async () => {
    const emb1 = fakeEmbedding(1);
    const emb2 = fakeEmbedding(2);
    let callCount = 0;
    service = new EmbeddingService(sqlite, async () => {
      callCount++;
      return callCount <= 1 ? emb1 : emb2;
    });

    await service.upsert("vendors", 1, "Original text");
    await service.upsert("vendors", 1, "Updated text");

    // Verify only one mapping exists
    const maps = sqlite
      .prepare("SELECT * FROM embedding_map WHERE source_table = 'vendors' AND source_id = 1")
      .all();
    expect(maps.length).toBe(1);
  });

  describe("flush", () => {
    it("processes pending upsert queue", async () => {
      // Manually insert a pending entry (simulating what a trigger would do)
      sqlite.prepare(
        "INSERT INTO pending_embeddings (source_table, source_id, action) VALUES (?, ?, ?)"
      ).run("vendors", 99, "upsert");

      // Provide a text builder for the flush
      await service.flush((sourceTable, sourceId) => {
        if (sourceTable === "vendors" && sourceId === 99) {
          return "Flushed vendor text";
        }
        return null;
      });

      // The pending row should be cleared
      const pending = sqlite.prepare("SELECT * FROM pending_embeddings").all();
      expect(pending.length).toBe(0);

      // An embedding should now exist
      const maps = sqlite
        .prepare("SELECT * FROM embedding_map WHERE source_table = 'vendors' AND source_id = 99")
        .all();
      expect(maps.length).toBe(1);
    });

    it("processes pending delete queue", async () => {
      const emb = fakeEmbedding(42);
      service = new EmbeddingService(sqlite, async () => emb);

      // First store something
      await service.upsert("vendors", 1, "To be deleted");

      // Add a delete pending entry
      sqlite.prepare(
        "INSERT INTO pending_embeddings (source_table, source_id, action) VALUES (?, ?, ?)"
      ).run("vendors", 1, "delete");

      await service.flush(() => null);

      const maps = sqlite
        .prepare("SELECT * FROM embedding_map WHERE source_table = 'vendors' AND source_id = 1")
        .all();
      expect(maps.length).toBe(0);
    });

    it("skips flush when no embedFn", async () => {
      const noEmbedService = new EmbeddingService(sqlite, null);
      sqlite.prepare(
        "INSERT INTO pending_embeddings (source_table, source_id, action) VALUES (?, ?, ?)"
      ).run("vendors", 1, "upsert");

      // Should not throw, should leave queue intact
      await noEmbedService.flush(() => "some text");
      const pending = sqlite.prepare("SELECT * FROM pending_embeddings").all();
      expect(pending.length).toBe(1);
    });
  });

  describe("integration: end-to-end with text builders", () => {
    it("inserts data, flushes pending queue, and searches", async () => {
      // Set up real tables
      const { pushSchema } = await import("../../src/db/migrate.js");
      const intSqlite = new Database(":memory:");
      sqliteVec.load(intSqlite);
      pushSchema(intSqlite);

      const emb = fakeEmbedding(42);
      const intService = new EmbeddingService(intSqlite, async () => emb);

      // Import text builder
      const { buildEmbeddingText } = await import("../../src/db/text-builders.js");

      // Insert test data — triggers should queue pending embeddings
      intSqlite.prepare(
        "INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES (?, ?, ?, ?)"
      ).run("Venue", 0.3, 0.5, 1);
      intSqlite.prepare(
        "INSERT INTO vendors (name, category_id, description) VALUES (?, ?, ?)"
      ).run("Villa Elegante", 1, "A stunning Tuscan villa");

      // Verify trigger fired
      const pending = intSqlite.prepare("SELECT * FROM pending_embeddings").all();
      expect(pending.length).toBeGreaterThan(0);

      // Flush
      const processed = await intService.flush((table, id) =>
        buildEmbeddingText(intSqlite, table, id),
      );
      expect(processed).toBeGreaterThan(0);

      // Search
      const results = await intService.search("Tuscan wedding venue");
      expect(results.length).toBe(1);
      expect(results[0].sourceTable).toBe("vendors");
      expect(results[0].textPreview).toContain("Villa Elegante");
    });
  });

  describe("triggers", () => {
    beforeEach(() => {
      // Create a minimal vendors table for trigger testing
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS vendors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          notes TEXT,
          location TEXT
        );
      `);
      // Re-init service to install triggers on the now-existing table
      service = new EmbeddingService(sqlite, async () => fakeEmbedding(1));
    });

    it("queues an upsert on INSERT", () => {
      sqlite.prepare("INSERT INTO vendors (name) VALUES (?)").run("Test Vendor");
      const pending = sqlite.prepare("SELECT * FROM pending_embeddings").all() as any[];
      expect(pending.length).toBe(1);
      expect(pending[0].source_table).toBe("vendors");
      expect(pending[0].source_id).toBe(1);
      expect(pending[0].action).toBe("upsert");
    });

    it("queues an upsert on UPDATE", () => {
      sqlite.prepare("INSERT INTO vendors (name) VALUES (?)").run("Test Vendor");
      // Clear the insert pending
      sqlite.prepare("DELETE FROM pending_embeddings").run();

      sqlite.prepare("UPDATE vendors SET name = ? WHERE id = ?").run("Updated", 1);
      const pending = sqlite.prepare("SELECT * FROM pending_embeddings").all() as any[];
      expect(pending.length).toBe(1);
      expect(pending[0].action).toBe("upsert");
    });

    it("queues a delete on DELETE", () => {
      sqlite.prepare("INSERT INTO vendors (name) VALUES (?)").run("Test Vendor");
      sqlite.prepare("DELETE FROM pending_embeddings").run();

      sqlite.prepare("DELETE FROM vendors WHERE id = ?").run(1);
      const pending = sqlite.prepare("SELECT * FROM pending_embeddings").all() as any[];
      expect(pending.length).toBe(1);
      expect(pending[0].action).toBe("delete");
    });

    it("queues vendor_attributes trigger using vendor_id as source_id", () => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS vendor_attributes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vendor_id INTEGER NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'text'
        );
      `);
      service = new EmbeddingService(sqlite, async () => fakeEmbedding(1));

      sqlite.prepare("INSERT INTO vendor_attributes (vendor_id, key, value, type) VALUES (?, ?, ?, ?)").run(42, "capacity", "200", "number");
      const pending = sqlite.prepare("SELECT * FROM pending_embeddings").all() as any[];
      const vaEntry = pending.find((p: any) => p.source_table === "vendor_attributes");
      expect(vaEntry).toBeDefined();
      expect(vaEntry.source_id).toBe(42); // vendor_id, not the row's own id
    });
  });
});
