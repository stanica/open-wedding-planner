import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema.js";
import { createDbQueryTool, isBlacklistedSql } from "../../src/tools/db-query.js";

describe("isBlacklistedSql", () => {
  it("detects DROP statements", () => {
    expect(isBlacklistedSql("DROP TABLE vendors")).toBe(true);
    expect(isBlacklistedSql("  drop table vendors")).toBe(true);
  });

  it("detects ALTER statements", () => {
    expect(isBlacklistedSql("ALTER TABLE vendors ADD COLUMN foo TEXT")).toBe(true);
  });

  it("detects PRAGMA statements", () => {
    expect(isBlacklistedSql("PRAGMA table_info(vendors)")).toBe(true);
  });

  it("detects ATTACH statements", () => {
    expect(isBlacklistedSql("ATTACH DATABASE ':memory:' AS db2")).toBe(true);
  });

  it("detects blacklisted SQL hidden behind comments", () => {
    expect(isBlacklistedSql("-- innocent comment\nDROP TABLE vendors")).toBe(true);
    expect(isBlacklistedSql("/* comment */ DROP TABLE vendors")).toBe(true);
    expect(isBlacklistedSql("  -- comment\n  /* another */ ALTER TABLE vendors ADD COLUMN foo TEXT")).toBe(true);
  });

  it("allows SELECT statements", () => {
    expect(isBlacklistedSql("SELECT * FROM vendors")).toBe(false);
  });

  it("allows INSERT statements", () => {
    expect(isBlacklistedSql("INSERT INTO vendors (name) VALUES ('test')")).toBe(false);
  });

  it("allows UPDATE statements", () => {
    expect(isBlacklistedSql("UPDATE vendors SET name = 'test' WHERE id = 1")).toBe(false);
  });

  it("allows DELETE statements", () => {
    expect(isBlacklistedSql("DELETE FROM vendors WHERE id = 1")).toBe(false);
  });
});

describe("dbQuery tool", () => {
  let sqlite: InstanceType<typeof Database>;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
    pushSchema(sqlite);
    db = drizzle(sqlite, { schema });
    await seedCategories(db);
  });

  it("executes a SELECT query", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    const result = await queryTool.execute!(
      { sql: "SELECT name FROM categories LIMIT 3" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const r = result as { rows: unknown[]; rowCount: number };
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rowCount).toBeGreaterThan(0);
  });

  it("executes an INSERT and returns changes", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    const result = await queryTool.execute!(
      { sql: "INSERT INTO vendors (category_id, name, status) VALUES (1, 'Test Vendor', 'researched')" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const r = result as { changes: number };
    expect(r.changes).toBe(1);
  });

  it("truncates results to 100 rows", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    for (let i = 0; i < 150; i++) {
      sqlite.prepare("INSERT INTO vendors (category_id, name, status) VALUES (1, ?, 'researched')").run(`Vendor ${i}`);
    }
    const result = await queryTool.execute!(
      { sql: "SELECT * FROM vendors" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const r = result as { rows: unknown[]; truncated: boolean };
    expect(r.rows).toHaveLength(100);
    expect(r.truncated).toBe(true);
  });

  it("prompts for blacklisted SQL", async () => {
    const callbacks = { requestPermission: vi.fn().mockResolvedValue("deny") };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    const result = await queryTool.execute!(
      { sql: "DROP TABLE vendors" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(callbacks.requestPermission).toHaveBeenCalledWith(
      "dbQuery:DROP",
      expect.stringContaining("DROP TABLE vendors"),
    );
    expect(result).toMatchObject({ error: expect.stringContaining("denied") });
  });

  it("returns error for invalid SQL", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    const result = await queryTool.execute!(
      { sql: "SELECTT * FROM nonexistent" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.any(String) });
  });
});
