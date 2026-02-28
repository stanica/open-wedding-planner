# Semantic Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full semantic search across all DB data via OpenAI embeddings and a `semanticSearch` agent tool.

**Architecture:** Unified sqlite-vec index with a mapping table tracking source table/id. SQLite triggers queue embedding updates on every write. An `EmbeddingService` class manages embed/search/flush. OpenAI `text-embedding-3-small` (1536 dims) via Vercel AI SDK.

**Tech Stack:** sqlite-vec, `@ai-sdk/openai` (already installed), `ai` SDK `embed()`, Zod, vitest

**Design doc:** `docs/plans/2026-02-28-semantic-search-design.md`

---

### Task 1: Rewrite embeddings module — schema + EmbeddingService

This replaces `packages/gateway/src/db/embeddings.ts` completely. The old vendor-only code is unused and gets replaced with a unified system.

**Files:**
- Rewrite: `packages/gateway/src/db/embeddings.ts`
- Create: `packages/gateway/tests/db/embedding-service.test.ts`
- Delete test: `packages/gateway/tests/db/embeddings.test.ts` (replaced by new test)

**Step 1: Write the failing tests**

Create `packages/gateway/tests/db/embedding-service.test.ts`:

```ts
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
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/db/embedding-service.test.ts`
Expected: FAIL — `EmbeddingService` doesn't exist yet

**Step 3: Implement EmbeddingService**

Rewrite `packages/gateway/src/db/embeddings.ts` with this content:

```ts
import type Database from "better-sqlite3";

const DIMENSIONS = 1536;
const PREVIEW_LENGTH = 200;

export type EmbedFn = (text: string) => Promise<number[]>;

/** Callback that builds the text to embed for a given source row. Returns null if row not found. */
export type TextBuilder = (sourceTable: string, sourceId: number) => string | null;

export class EmbeddingService {
  constructor(
    private sqlite: Database.Database,
    private embedFn: EmbedFn | null,
  ) {
    this.initSchema();
  }

  private initSchema() {
    this.sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
        embedding float[${DIMENSIONS}]
      );
    `);
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS embedding_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vec_rowid INTEGER NOT NULL,
        source_table TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        text_preview TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(source_table, source_id)
      );
    `);
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS pending_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_table TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        action TEXT NOT NULL DEFAULT 'upsert',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Drop old vendor-only tables if they exist (never had data)
    this.sqlite.exec("DROP TABLE IF EXISTS vendor_embedding_map");
    // vendor_embeddings is a virtual table — use DROP TABLE
    this.sqlite.exec("DROP TABLE IF EXISTS vendor_embeddings");
  }

  setEmbedFn(fn: EmbedFn | null) {
    this.embedFn = fn;
  }

  async upsert(sourceTable: string, sourceId: number, text: string): Promise<void> {
    if (!this.embedFn) return;
    const embedding = await this.embedFn(text);
    const buf = Buffer.from(new Float32Array(embedding).buffer);
    const preview = text.slice(0, PREVIEW_LENGTH);

    const existing = this.sqlite
      .prepare("SELECT vec_rowid FROM embedding_map WHERE source_table = ? AND source_id = ?")
      .get(sourceTable, sourceId) as { vec_rowid: number } | undefined;

    if (existing) {
      this.sqlite
        .prepare("UPDATE embeddings SET embedding = ? WHERE rowid = ?")
        .run(buf, existing.vec_rowid);
      this.sqlite
        .prepare("UPDATE embedding_map SET text_preview = ?, updated_at = datetime('now') WHERE source_table = ? AND source_id = ?")
        .run(preview, sourceTable, sourceId);
    } else {
      const result = this.sqlite
        .prepare("INSERT INTO embeddings(embedding) VALUES (?)")
        .run(buf);
      this.sqlite
        .prepare("INSERT INTO embedding_map(vec_rowid, source_table, source_id, text_preview) VALUES (?, ?, ?, ?)")
        .run(result.lastInsertRowid, sourceTable, sourceId, preview);
    }
  }

  remove(sourceTable: string, sourceId: number): void {
    const existing = this.sqlite
      .prepare("SELECT vec_rowid FROM embedding_map WHERE source_table = ? AND source_id = ?")
      .get(sourceTable, sourceId) as { vec_rowid: number } | undefined;

    if (existing) {
      this.sqlite
        .prepare("DELETE FROM embeddings WHERE rowid = ?")
        .run(existing.vec_rowid);
      this.sqlite
        .prepare("DELETE FROM embedding_map WHERE source_table = ? AND source_id = ?")
        .run(sourceTable, sourceId);
    }
  }

  async search(
    query: string,
    sourceType?: string,
    limit = 10,
  ): Promise<Array<{ sourceTable: string; sourceId: number; distance: number; textPreview: string | null }>> {
    if (!this.embedFn) return [];
    const embedding = await this.embedFn(query);
    const buf = Buffer.from(new Float32Array(embedding).buffer);

    // KNN search — fetch more than needed if we're going to filter by type
    const k = sourceType ? limit * 3 : limit;

    const rows = this.sqlite
      .prepare(
        `SELECT e.rowid, e.distance, em.source_table, em.source_id, em.text_preview
         FROM embeddings e
         JOIN embedding_map em ON em.vec_rowid = e.rowid
         WHERE e.embedding MATCH ?
           AND e.k = ?`,
      )
      .all(buf, k) as Array<{
      rowid: number;
      distance: number;
      source_table: string;
      source_id: number;
      text_preview: string | null;
    }>;

    let filtered = rows;
    if (sourceType) {
      filtered = rows.filter((r) => r.source_table === sourceType);
    }

    return filtered.slice(0, limit).map((r) => ({
      sourceTable: r.source_table,
      sourceId: r.source_id,
      distance: r.distance,
      textPreview: r.text_preview,
    }));
  }

  async flush(textBuilder: TextBuilder): Promise<number> {
    if (!this.embedFn) return 0;

    const pending = this.sqlite
      .prepare("SELECT id, source_table, source_id, action FROM pending_embeddings ORDER BY id")
      .all() as Array<{ id: number; source_table: string; source_id: number; action: string }>;

    if (pending.length === 0) return 0;

    let processed = 0;
    for (const row of pending) {
      try {
        if (row.action === "delete") {
          this.remove(row.source_table, row.source_id);
        } else {
          const text = textBuilder(row.source_table, row.source_id);
          if (text) {
            await this.upsert(row.source_table, row.source_id, text);
          }
        }
        this.sqlite
          .prepare("DELETE FROM pending_embeddings WHERE id = ?")
          .run(row.id);
        processed++;
      } catch (err) {
        // Leave failed rows in queue for retry
        console.error(`Embedding flush error for ${row.source_table}/${row.source_id}:`, err);
      }
    }
    return processed;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/db/embedding-service.test.ts`
Expected: All 7 tests PASS

**Step 5: Delete old test file**

Delete: `packages/gateway/tests/db/embeddings.test.ts`

**Step 6: Commit**

```bash
git add packages/gateway/src/db/embeddings.ts packages/gateway/tests/db/embedding-service.test.ts
git rm packages/gateway/tests/db/embeddings.test.ts
git commit -m "feat: rewrite embeddings module with unified EmbeddingService"
```

---

### Task 2: Add SQLite triggers for automatic embedding queue

This creates the triggers that fire on INSERT/UPDATE/DELETE for each embeddable table, populating the `pending_embeddings` queue.

**Files:**
- Modify: `packages/gateway/src/db/embeddings.ts` (add trigger creation to `initSchema`)
- Modify: `packages/gateway/tests/db/embedding-service.test.ts` (add trigger tests)

**Step 1: Write the failing tests**

Add to `packages/gateway/tests/db/embedding-service.test.ts`, inside the top `describe` block, a new `describe("triggers")` section. These tests need real tables to attach triggers to, so they create minimal test tables:

```ts
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
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/db/embedding-service.test.ts`
Expected: FAIL — no triggers exist yet

**Step 3: Add trigger creation to EmbeddingService.initSchema**

Add this method and call it from `initSchema()` in `packages/gateway/src/db/embeddings.ts`:

```ts
// Tables that should have embedding triggers
private static readonly EMBEDDABLE_TABLES = [
  "vendors",
  "vendor_attributes",
  "research_notes",
  "communications",
  "quotes",
  "tasks",
  "budget_entries",
  "research_messages",
];

private installTriggers() {
  for (const table of EmbeddingService.EMBEDDABLE_TABLES) {
    // Check if table exists before creating triggers
    const exists = this.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!exists) continue;

    const idCol = table === "vendor_attributes" ? "vendor_id" : "id";

    this.sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS embed_after_insert_${table}
      AFTER INSERT ON ${table}
      BEGIN
        INSERT INTO pending_embeddings (source_table, source_id, action)
        VALUES ('${table}', NEW.${idCol}, 'upsert');
      END;
    `);

    this.sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS embed_after_update_${table}
      AFTER UPDATE ON ${table}
      BEGIN
        INSERT INTO pending_embeddings (source_table, source_id, action)
        VALUES ('${table}', NEW.${idCol}, 'upsert');
      END;
    `);

    this.sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS embed_after_delete_${table}
      AFTER DELETE ON ${table}
      BEGIN
        INSERT INTO pending_embeddings (source_table, source_id, action)
        VALUES ('${table}', OLD.${idCol}, 'delete');
      END;
    `);
  }
}
```

Call `this.installTriggers()` at the end of `initSchema()`.

Note: `vendor_attributes` uses `vendor_id` as the id column because attributes are grouped by vendor for embedding (all attributes for a vendor become one embedding entry with `source_table='vendor_attributes', source_id=vendor_id`).

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/db/embedding-service.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/db/embeddings.ts packages/gateway/tests/db/embedding-service.test.ts
git commit -m "feat: add SQLite triggers for automatic embedding queue"
```

---

### Task 3: Add text builders for all embeddable tables

The `flush()` method needs a `TextBuilder` callback that knows how to construct the text to embed for each source table/id. This is a standalone function that queries the DB for the source row and builds the text.

**Files:**
- Create: `packages/gateway/src/db/text-builders.ts`
- Create: `packages/gateway/tests/db/text-builders.test.ts`

**Step 1: Write the failing tests**

Create `packages/gateway/tests/db/text-builders.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { buildEmbeddingText } from "../../src/db/text-builders.js";
import { pushSchema } from "../../src/db/push-schema.js";

describe("buildEmbeddingText", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
    pushSchema(sqlite);
  });

  it("builds text for vendors", () => {
    sqlite.prepare(
      "INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES (?, ?, ?, ?)"
    ).run("Venue", 0.3, 0.5, 1);
    sqlite.prepare(
      "INSERT INTO vendors (name, category_id, description, location, notes) VALUES (?, ?, ?, ?, ?)"
    ).run("Villa Elegante", 1, "A stunning villa", "Tuscany", "Great reviews");

    const text = buildEmbeddingText(sqlite, "vendors", 1);
    expect(text).toContain("Villa Elegante");
    expect(text).toContain("Venue");
    expect(text).toContain("A stunning villa");
    expect(text).toContain("Tuscany");
    expect(text).toContain("Great reviews");
  });

  it("builds text for communications", () => {
    sqlite.prepare(
      "INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES (?, ?, ?, ?)"
    ).run("Venue", 0.3, 0.5, 1);
    sqlite.prepare(
      "INSERT INTO vendors (name, category_id) VALUES (?, ?)"
    ).run("Villa", 1);
    sqlite.prepare(
      `INSERT INTO communications (vendor_id, direction, channel, subject, body_original, body_translated, status, sent_at)
       VALUES (?, 'in', 'email', ?, ?, ?, 'received', datetime('now'))`
    ).run(1, "Pricing inquiry", "Original body text", "Translated body text");

    const text = buildEmbeddingText(sqlite, "communications", 1);
    expect(text).toContain("Pricing inquiry");
    expect(text).toContain("Translated body text");
  });

  it("builds text for research_notes", () => {
    sqlite.prepare(
      "INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES (?, ?, ?, ?)"
    ).run("Venue", 0.3, 0.5, 1);
    sqlite.prepare("INSERT INTO vendors (name, category_id) VALUES (?, ?)").run("Villa", 1);
    sqlite.prepare(
      "INSERT INTO research_notes (vendor_id, content, source_type) VALUES (?, ?, ?)"
    ).run(1, "Detailed research about this venue", "web");

    const text = buildEmbeddingText(sqlite, "research_notes", 1);
    expect(text).toContain("Detailed research about this venue");
  });

  it("builds text for tasks", () => {
    sqlite.prepare(
      "INSERT INTO tasks (title, notes) VALUES (?, ?)"
    ).run("Book photographer", "Need to finalize by March");

    const text = buildEmbeddingText(sqlite, "tasks", 1);
    expect(text).toContain("Book photographer");
    expect(text).toContain("Need to finalize by March");
  });

  it("builds text for vendor_attributes (grouped by vendor_id)", () => {
    sqlite.prepare(
      "INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES (?, ?, ?, ?)"
    ).run("Venue", 0.3, 0.5, 1);
    sqlite.prepare("INSERT INTO vendors (name, category_id) VALUES (?, ?)").run("Villa", 1);
    sqlite.prepare(
      "INSERT INTO vendor_attributes (vendor_id, key, value, type) VALUES (?, ?, ?, ?)"
    ).run(1, "capacity", "200", "number");
    sqlite.prepare(
      "INSERT INTO vendor_attributes (vendor_id, key, value, type) VALUES (?, ?, ?, ?)"
    ).run(1, "style", "rustic", "text");

    const text = buildEmbeddingText(sqlite, "vendor_attributes", 1);
    expect(text).toContain("capacity: 200");
    expect(text).toContain("style: rustic");
  });

  it("returns null for unknown table", () => {
    const text = buildEmbeddingText(sqlite, "nonexistent", 1);
    expect(text).toBeNull();
  });

  it("returns null for missing row", () => {
    const text = buildEmbeddingText(sqlite, "vendors", 999);
    expect(text).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/db/text-builders.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement text builders**

Create `packages/gateway/src/db/text-builders.ts`:

```ts
import type Database from "better-sqlite3";

/**
 * Build the text to embed for a given source table and row ID.
 * Returns null if the row doesn't exist or the table isn't embeddable.
 */
export function buildEmbeddingText(
  sqlite: Database.Database,
  sourceTable: string,
  sourceId: number,
): string | null {
  switch (sourceTable) {
    case "vendors":
      return buildVendorText(sqlite, sourceId);
    case "vendor_attributes":
      return buildVendorAttributesText(sqlite, sourceId);
    case "research_notes":
      return buildResearchNoteText(sqlite, sourceId);
    case "communications":
      return buildCommunicationText(sqlite, sourceId);
    case "quotes":
      return buildQuoteText(sqlite, sourceId);
    case "tasks":
      return buildTaskText(sqlite, sourceId);
    case "budget_entries":
      return buildBudgetEntryText(sqlite, sourceId);
    case "research_messages":
      return buildResearchMessageText(sqlite, sourceId);
    default:
      return null;
  }
}

function buildVendorText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare(
      `SELECT v.name, v.description, v.location, v.notes, c.name as category
       FROM vendors v
       LEFT JOIN categories c ON c.id = v.category_id
       WHERE v.id = ?`,
    )
    .get(id) as { name: string; description: string | null; location: string | null; notes: string | null; category: string | null } | undefined;
  if (!row) return null;

  const parts = [row.name];
  if (row.category) parts.push(row.category);
  if (row.description) parts.push(row.description);
  if (row.location) parts.push(row.location);
  if (row.notes) parts.push(row.notes);
  return parts.join(". ");
}

function buildVendorAttributesText(sqlite: Database.Database, vendorId: number): string | null {
  const rows = sqlite
    .prepare("SELECT key, value FROM vendor_attributes WHERE vendor_id = ? ORDER BY key")
    .all(vendorId) as Array<{ key: string; value: string }>;
  if (rows.length === 0) return null;
  return rows.map((r) => `${r.key}: ${r.value}`).join(". ");
}

function buildResearchNoteText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare("SELECT content FROM research_notes WHERE id = ?")
    .get(id) as { content: string } | undefined;
  return row?.content ?? null;
}

function buildCommunicationText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare("SELECT subject, body_original, body_translated FROM communications WHERE id = ?")
    .get(id) as { subject: string | null; body_original: string | null; body_translated: string | null } | undefined;
  if (!row) return null;

  const parts: string[] = [];
  if (row.subject) parts.push(row.subject);
  parts.push(row.body_translated ?? row.body_original ?? "");
  return parts.join(". ") || null;
}

function buildQuoteText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare(
      `SELECT q.raw_text, v.name as vendor_name
       FROM quotes q
       LEFT JOIN vendors v ON v.id = q.vendor_id
       WHERE q.id = ?`,
    )
    .get(id) as { raw_text: string | null; vendor_name: string | null } | undefined;
  if (!row) return null;

  const parts: string[] = [];
  if (row.vendor_name) parts.push(`${row.vendor_name} quote`);
  if (row.raw_text) parts.push(row.raw_text);

  const lineItems = sqlite
    .prepare("SELECT description FROM quote_line_items WHERE quote_id = ?")
    .all(id) as Array<{ description: string }>;
  if (lineItems.length > 0) {
    parts.push("Line items: " + lineItems.map((li) => li.description).join(", "));
  }

  return parts.join(". ") || null;
}

function buildTaskText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare("SELECT title, notes FROM tasks WHERE id = ?")
    .get(id) as { title: string; notes: string | null } | undefined;
  if (!row) return null;

  const parts = [row.title];
  if (row.notes) parts.push(row.notes);
  return parts.join(". ");
}

function buildBudgetEntryText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare(
      `SELECT be.description, be.notes, c.name as category
       FROM budget_entries be
       LEFT JOIN categories c ON c.id = be.category_id
       WHERE be.id = ?`,
    )
    .get(id) as { description: string | null; notes: string | null; category: string | null } | undefined;
  if (!row) return null;

  const parts: string[] = [];
  if (row.category) parts.push(row.category);
  if (row.description) parts.push(row.description);
  if (row.notes) parts.push(row.notes);
  return parts.join(": ") || null;
}

function buildResearchMessageText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare("SELECT role, content FROM research_messages WHERE id = ?")
    .get(id) as { role: string; content: string } | undefined;
  if (!row || row.role === "system") return null;
  return row.content;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/db/text-builders.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/db/text-builders.ts packages/gateway/tests/db/text-builders.test.ts
git commit -m "feat: add text builders for embedding all table types"
```

---

### Task 4: Create semanticSearch tool

Register a new `semanticSearch` factory tool that agents can use to perform vector similarity search.

**Files:**
- Create: `packages/gateway/src/tools/semantic-search.ts`
- Create: `packages/gateway/tests/tools/semantic-search.test.ts`
- Modify: `packages/gateway/src/tools/index.ts` (register the tool)
- Modify: `packages/gateway/src/agents/task-configs.ts` (add to agent tool lists)
- Modify: `packages/gateway/src/agents/runner.ts` (add `embeddingService` to `ToolFactoryContext`)

**Step 1: Write the failing tests**

Create `packages/gateway/tests/tools/semantic-search.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { generateText } from "ai";
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
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/tools/semantic-search.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Create semantic search tool**

Create `packages/gateway/src/tools/semantic-search.ts`:

```ts
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
```

Also add the `hasEmbedFn()` method to `EmbeddingService` in `packages/gateway/src/db/embeddings.ts`:

```ts
hasEmbedFn(): boolean {
  return this.embedFn !== null;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/tools/semantic-search.test.ts`
Expected: All 3 tests PASS

**Step 5: Register the tool and add to agent configs**

In `packages/gateway/src/tools/index.ts`, add import and registration:

```ts
// Add import at top
import { makeSemanticSearchTool } from "./semantic-search.js";

// Add registration before the `return registry;` line
registry.registerFactory("semanticSearch", {
  description: "Search all data using natural language semantic similarity",
  category: "database",
  create: (ctx: unknown) => {
    const { embeddingService } = ctx as any;
    return makeSemanticSearchTool(embeddingService);
  },
});
```

In `packages/gateway/src/agents/task-configs.ts`, add `"semanticSearch"` to each agent's tools array (except `translation` which only has `"cmd"`):

- `research` tools: add `"semanticSearch"` to the array
- `outreach` tools: add `"semanticSearch"` to the array
- `parse` tools: add `"semanticSearch"` to the array
- `action` tools: add `"semanticSearch"` to the array
- `browser` tools: add `"semanticSearch"` to the array

In `packages/gateway/src/agents/runner.ts`, add `embeddingService` to `ToolFactoryContext`:

```ts
export interface ToolFactoryContext {
  db: unknown;
  emit: (action: string, detail?: string) => void;
  sqlite: unknown;
  workspaceDir: string;
  permissionCallbacks: unknown;
  deliveryQueue?: unknown;
  getAutoSend?: () => boolean;
  orchestrator?: unknown;
  parentSessionKey?: string;
  threadId?: number;
  broadcast?: (event: any) => void;
  embeddingService?: unknown;  // add this
}
```

**Step 6: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add packages/gateway/src/tools/semantic-search.ts packages/gateway/tests/tools/semantic-search.test.ts packages/gateway/src/tools/index.ts packages/gateway/src/agents/task-configs.ts packages/gateway/src/agents/runner.ts packages/gateway/src/db/embeddings.ts
git commit -m "feat: add semanticSearch agent tool"
```

---

### Task 5: Add OpenAI API key to ai_config and wire embedding at startup

This connects everything: the OpenAI key is stored in the DB, the `EmbeddingService` is instantiated at startup, and the embed function is wired to OpenAI.

**Files:**
- Modify: `packages/gateway/src/db/schema.ts:197-205` (add `openaiApiKey` column)
- Modify: `packages/gateway/src/index.ts` (instantiate `EmbeddingService`, wire `embedFn`, pass to orchestrator)
- Modify: `packages/gateway/src/handlers/ai-config.ts` (handle OpenAI key updates, trigger backfill)

**Step 1: Add `openaiApiKey` to schema**

In `packages/gateway/src/db/schema.ts`, add the column to the `aiConfig` table definition (after line 204):

```ts
export const aiConfig = sqliteTable("ai_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().default("api-key"),
  model: text("model").notNull().default("claude-sonnet-4-20250514"),
  proxyUrl: text("proxy_url").notNull().default("http://localhost:3456/v1"),
  apiKey: text("api_key"),
  openaiApiKey: text("openai_api_key"),  // add this line
  whatsappAutoSend: integer("whatsapp_auto_send").notNull().default(0),
  whatsappActiveThreadId: integer("whatsapp_active_thread_id"),
});
```

**Step 2: Wire EmbeddingService at startup**

In `packages/gateway/src/index.ts`:

Add imports near the top:
```ts
import { EmbeddingService } from "./db/embeddings.js";
import { buildEmbeddingText } from "./db/text-builders.js";
import { embed } from "ai";
```

Remove the old `createEmbeddingsTable` import and its call at line 53.

After the `const db = drizzle(sqlite, { schema });` line (~line 56), instantiate the service:

```ts
// 3b. Create embedding service
const embeddingService = new EmbeddingService(sqlite, null);
```

After loading `savedAiConfig` (~line 118), wire the embed function:

```ts
// 8c. Wire embedding function if OpenAI key is configured
if (savedAiConfig?.openaiApiKey) {
  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey: savedAiConfig.openaiApiKey });
  embeddingService.setEmbedFn(async (text: string) => {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: text,
    });
    return embedding;
  });
}
```

Pass `embeddingService` to the orchestrator extras (~line 170):

```ts
const orchestrator = new Orchestrator(db, (event) => {
  wsServer.broadcast(event);
}, toolRegistry, undefined, sqlite, {
  deliveryQueue,
  getAutoSend: autoSendGetter,
  gogManager,
  getGoogleAutoSend: googleAutoSendGetter,
  getGoogleConfig,
  imagesDir,
  embeddingService,  // add this
});
```

Check where the orchestrator passes extras into `ToolFactoryContext` — the `embeddingService` field needs to flow through to the runner's `toolCtx`. Read the orchestrator file to confirm the pass-through pattern.

**Step 3: Handle OpenAI key in ai-config handler**

In `packages/gateway/src/handlers/ai-config.ts`, in the `"ai-config.update"` handler:

Add handling for the OpenAI key in the update object (after line 104):

```ts
if ((data as any).openaiApiKey !== undefined) {
  updates.openaiApiKey = (data as any).openaiApiKey;
}
```

After the `setAIConfig` call (~line 125), add embed function wiring:

```ts
// Update embedding function
if (updated?.openaiApiKey) {
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { embed } = await import("ai");
  const openai = createOpenAI({ apiKey: updated.openaiApiKey });
  embeddingService.setEmbedFn(async (text: string) => {
    const result = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: text,
    });
    return result.embedding;
  });
  // Backfill embeddings for existing data
  embeddingService.backfill((sourceTable, sourceId) =>
    buildEmbeddingText(sqlite, sourceTable, sourceId),
  );
} else if (updated && !updated.openaiApiKey) {
  embeddingService.setEmbedFn(null);
}
```

The `embeddingService` and `sqlite` references need to be available in the handler — check how other handlers receive dependencies (likely via closure from the `registerAIConfigHandlers` function) and follow the same pattern.

In the `"ai-config.get"` handler, include `openaiApiKey` in the response (masked like `apiKey`).

**Step 4: Add `backfill` method to EmbeddingService**

In `packages/gateway/src/db/embeddings.ts`, add the `backfill` method:

```ts
async backfill(textBuilder: TextBuilder): Promise<number> {
  if (!this.embedFn) return 0;

  let total = 0;
  for (const table of EmbeddingService.EMBEDDABLE_TABLES) {
    // Check if table exists
    const exists = this.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!exists) continue;

    const idCol = table === "vendor_attributes" ? "vendor_id" : "id";

    // Find rows missing from embedding_map
    const missingRows = this.sqlite
      .prepare(
        `SELECT DISTINCT ${idCol} as id FROM ${table}
         WHERE ${idCol} NOT IN (
           SELECT source_id FROM embedding_map WHERE source_table = ?
         )`,
      )
      .all(table) as Array<{ id: number }>;

    for (const row of missingRows) {
      const text = textBuilder(table, row.id);
      if (text) {
        await this.upsert(table, row.id, text);
        total++;
      }
    }
  }
  return total;
}
```

**Step 5: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/db/schema.ts packages/gateway/src/db/embeddings.ts packages/gateway/src/index.ts packages/gateway/src/handlers/ai-config.ts
git commit -m "feat: wire OpenAI embeddings at startup and config update"
```

---

### Task 6: Add flush to agent runner step loop

After each agent step, flush the pending embeddings queue so any data the agent wrote gets embedded.

**Files:**
- Modify: `packages/gateway/src/agents/runner.ts:112-161` (add flush call in `onStepFinish`)

**Step 1: Add flush call**

In `packages/gateway/src/agents/runner.ts`, import the text builder:

```ts
import { buildEmbeddingText } from "../db/text-builders.js";
```

In the `onStepFinish` callback (after the token usage broadcast block, ~line 160), add:

```ts
// Flush pending embeddings
if (toolCtx.embeddingService && toolCtx.sqlite) {
  const svc = toolCtx.embeddingService as import("../db/embeddings.js").EmbeddingService;
  const sq = toolCtx.sqlite as import("better-sqlite3").Database;
  svc.flush((sourceTable, sourceId) => buildEmbeddingText(sq, sourceTable, sourceId)).catch((err) => {
    console.error("Embedding flush error:", err);
  });
}
```

**Step 2: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/gateway/src/agents/runner.ts
git commit -m "feat: flush pending embeddings after each agent step"
```

---

### Task 7: Verify orchestrator passes embeddingService through to toolCtx

The `EmbeddingService` is passed to the orchestrator as an extra, but we need to confirm it flows through to the `ToolFactoryContext` that the runner receives.

**Files:**
- Possibly modify: `packages/gateway/src/agents/orchestrator.ts` (if extras aren't passed through automatically)

**Step 1: Read the orchestrator to understand how extras flow to toolCtx**

Read `packages/gateway/src/agents/orchestrator.ts` and trace how the `extras` parameter from the constructor gets passed to `AgentRunner.run()` as `toolCtx`.

**Step 2: If needed, ensure `embeddingService` is included in toolCtx**

The orchestrator likely spreads the extras into the `toolCtx` object. Confirm that `embeddingService` will be included. If not, add it explicitly.

**Step 3: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 4: Commit (if changes were needed)**

```bash
git add packages/gateway/src/agents/orchestrator.ts
git commit -m "feat: pass embeddingService through orchestrator to agent runner"
```

---

### Task 8: Integration test — end-to-end semantic search

Write an integration test that creates data, triggers flush, and searches.

**Files:**
- Modify: `packages/gateway/tests/db/embedding-service.test.ts` (add integration test)

**Step 1: Write the integration test**

Add to `packages/gateway/tests/db/embedding-service.test.ts`:

```ts
describe("integration: end-to-end with text builders", () => {
  it("inserts data, flushes pending queue, and searches", async () => {
    // Set up real tables
    const { pushSchema } = await import("../../src/db/push-schema.js");
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
```

**Step 2: Run the integration test**

Run: `cd packages/gateway && npx vitest run tests/db/embedding-service.test.ts`
Expected: All tests PASS

**Step 3: Run the full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/gateway/tests/db/embedding-service.test.ts
git commit -m "test: add end-to-end integration test for semantic search"
```

---

### Summary of all files

**New files (4):**
- `packages/gateway/src/db/text-builders.ts`
- `packages/gateway/src/tools/semantic-search.ts`
- `packages/gateway/tests/db/embedding-service.test.ts`
- `packages/gateway/tests/tools/semantic-search.test.ts`

**Modified files (7):**
- `packages/gateway/src/db/embeddings.ts` (full rewrite)
- `packages/gateway/src/db/schema.ts` (add `openaiApiKey` column)
- `packages/gateway/src/tools/index.ts` (register `semanticSearch`)
- `packages/gateway/src/agents/task-configs.ts` (add `semanticSearch` to tool lists)
- `packages/gateway/src/agents/runner.ts` (add `embeddingService` to context, flush in step loop)
- `packages/gateway/src/index.ts` (instantiate service, wire embedFn)
- `packages/gateway/src/handlers/ai-config.ts` (handle OpenAI key, trigger backfill)

**Deleted files (1):**
- `packages/gateway/tests/db/embeddings.test.ts` (replaced)
