import type Database from "better-sqlite3";

const DIMENSIONS = 1536;
const PREVIEW_LENGTH = 200;

export type EmbedFn = (text: string) => Promise<number[]>;

/** Callback that builds the text to embed for a given source row. Returns null if row not found. */
export type TextBuilder = (sourceTable: string, sourceId: number) => string | null;

export class EmbeddingService {
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
    this.sqlite.exec("DROP TABLE IF EXISTS vendor_embeddings");

    this.installTriggers();
  }

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

  setEmbedFn(fn: EmbedFn | null) {
    this.embedFn = fn;
  }

  hasEmbedFn(): boolean {
    return this.embedFn !== null;
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
        .prepare(
          "UPDATE embedding_map SET text_preview = ?, updated_at = datetime('now') WHERE source_table = ? AND source_id = ?",
        )
        .run(preview, sourceTable, sourceId);
    } else {
      const result = this.sqlite
        .prepare("INSERT INTO embeddings(embedding) VALUES (?)")
        .run(buf);
      this.sqlite
        .prepare(
          "INSERT INTO embedding_map(vec_rowid, source_table, source_id, text_preview) VALUES (?, ?, ?, ?)",
        )
        .run(result.lastInsertRowid, sourceTable, sourceId, preview);
    }
  }

  remove(sourceTable: string, sourceId: number): void {
    const existing = this.sqlite
      .prepare("SELECT vec_rowid FROM embedding_map WHERE source_table = ? AND source_id = ?")
      .get(sourceTable, sourceId) as { vec_rowid: number } | undefined;

    if (existing) {
      this.sqlite.prepare("DELETE FROM embeddings WHERE rowid = ?").run(existing.vec_rowid);
      this.sqlite
        .prepare("DELETE FROM embedding_map WHERE source_table = ? AND source_id = ?")
        .run(sourceTable, sourceId);
    }
  }

  async search(
    query: string,
    sourceType?: string,
    limit = 10,
  ): Promise<
    Array<{ sourceTable: string; sourceId: number; distance: number; textPreview: string | null }>
  > {
    if (!this.embedFn) return [];
    const embedding = await this.embedFn(query);
    const buf = Buffer.from(new Float32Array(embedding).buffer);

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

  async backfill(textBuilder: TextBuilder): Promise<number> {
    if (!this.embedFn) return 0;

    let total = 0;
    for (const table of EmbeddingService.EMBEDDABLE_TABLES) {
      const exists = this.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      if (!exists) continue;

      const idCol = table === "vendor_attributes" ? "vendor_id" : "id";

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

  async flush(textBuilder: TextBuilder): Promise<number> {
    if (!this.embedFn) return 0;

    const pending = this.sqlite
      .prepare("SELECT id, source_table, source_id, action FROM pending_embeddings ORDER BY id")
      .all() as Array<{ id: number; source_table: string; source_id: number; action: string }>;

    if (pending.length === 0) return 0;

    // Deduplicate: keep only the latest action per (source_table, source_id)
    const deduped = new Map<string, typeof pending[0]>();
    for (const row of pending) {
      deduped.set(`${row.source_table}:${row.source_id}`, row);
    }

    // Collect all pending IDs for bulk delete after processing
    const allPendingIds = pending.map((r) => r.id);

    let processed = 0;
    for (const row of deduped.values()) {
      try {
        if (row.action === "delete") {
          this.remove(row.source_table, row.source_id);
        } else {
          const text = textBuilder(row.source_table, row.source_id);
          if (text) {
            await this.upsert(row.source_table, row.source_id, text);
          }
        }
        processed++;
      } catch (err) {
        console.error(`Embedding flush error for ${row.source_table}/${row.source_id}:`, err);
      }
    }

    // Clear all processed pending rows
    if (allPendingIds.length > 0) {
      this.sqlite
        .prepare(`DELETE FROM pending_embeddings WHERE id IN (${allPendingIds.join(",")})`)
        .run();
    }

    return processed;
  }
}
