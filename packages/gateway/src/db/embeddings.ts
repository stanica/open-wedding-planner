import type Database from "better-sqlite3";

const DIMENSIONS = 1536;

export function createEmbeddingsTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vendor_embeddings USING vec0(
      embedding float[${DIMENSIONS}]
    );
  `);
  // Separate mapping table for vendor_id -> rowid
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS vendor_embedding_map (
      vendor_id INTEGER PRIMARY KEY,
      vec_rowid INTEGER NOT NULL
    );
  `);
}

export type EmbedFn = (text: string) => Promise<number[]>;

let embedFn: EmbedFn | null = null;

export function setEmbedFn(fn: EmbedFn) {
  embedFn = fn;
}

export async function storeVendorEmbedding(
  sqlite: Database.Database,
  vendorId: number,
  text: string,
): Promise<void> {
  if (!embedFn) throw new Error("No embed function configured");
  const embedding = await embedFn(text);
  const buf = Buffer.from(new Float32Array(embedding).buffer);

  // Check if mapping exists
  const existing = sqlite
    .prepare("SELECT vec_rowid FROM vendor_embedding_map WHERE vendor_id = ?")
    .get(vendorId) as { vec_rowid: number } | undefined;

  if (existing) {
    sqlite
      .prepare("UPDATE vendor_embeddings SET embedding = ? WHERE rowid = ?")
      .run(buf, existing.vec_rowid);
  } else {
    const result = sqlite
      .prepare("INSERT INTO vendor_embeddings(embedding) VALUES (?)")
      .run(buf);
    sqlite
      .prepare("INSERT INTO vendor_embedding_map(vendor_id, vec_rowid) VALUES (?, ?)")
      .run(vendorId, result.lastInsertRowid);
  }
}

export interface SimilarVendor {
  vendorId: number;
  distance: number;
}

export async function findSimilarVendors(
  sqlite: Database.Database,
  text: string,
  threshold = 0.3,
  limit = 5,
): Promise<SimilarVendor[]> {
  if (!embedFn) throw new Error("No embed function configured");
  const embedding = await embedFn(text);
  const buf = Buffer.from(new Float32Array(embedding).buffer);

  const rows = sqlite
    .prepare(
      `SELECT ve.rowid, ve.distance, vem.vendor_id
       FROM vendor_embeddings ve
       JOIN vendor_embedding_map vem ON vem.vec_rowid = ve.rowid
       WHERE ve.embedding MATCH ?
         AND ve.k = ?`,
    )
    .all(buf, limit) as Array<{
    rowid: number;
    distance: number;
    vendor_id: number;
  }>;

  return rows
    .filter((r) => r.distance <= threshold)
    .map((r) => ({ vendorId: r.vendor_id, distance: r.distance }));
}
