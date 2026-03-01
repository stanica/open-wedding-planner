import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerDbHandlers } from "../../src/handlers/db.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerDbHandlers(router, sqlite);
  return { db, router, sqlite };
}

describe("db handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;
  let sqlite: Database.Database;

  beforeEach(() => {
    ({ db, router, sqlite } = setup());
  });

  describe("db.tables", () => {
    it("returns table names", async () => {
      const tables = (await router.handle(db, "db.tables", {})) as string[];
      expect(tables).toContain("vendors");
      expect(tables).toContain("categories");
      // Should not include sqlite internals
      expect(tables.every((t) => !t.startsWith("sqlite_"))).toBe(true);
    });
  });

  describe("db.query", () => {
    it("returns columns, rows, and total for a table", async () => {
      const result = (await router.handle(db, "db.query", {
        table: "categories",
      })) as { columns: string[]; rows: Record<string, unknown>[]; total: number };

      expect(result.columns).toContain("id");
      expect(result.columns).toContain("name");
      expect(result.total).toBe(result.rows.length);
    });

    it("respects limit and offset", async () => {
      // Insert some data first
      db.insert(schema.categories)
        .values([
          { name: "Cat A", budgetPercentLow: 0, budgetPercentHigh: 0, sortOrder: 1 },
          { name: "Cat B", budgetPercentLow: 0, budgetPercentHigh: 0, sortOrder: 2 },
          { name: "Cat C", budgetPercentLow: 0, budgetPercentHigh: 0, sortOrder: 3 },
        ])
        .run();

      const page1 = (await router.handle(db, "db.query", {
        table: "categories",
        limit: 1,
        offset: 0,
      })) as { rows: Record<string, unknown>[]; total: number };

      expect(page1.rows).toHaveLength(1);
      // total should reflect all rows, not just this page
      expect(page1.total).toBe(3);
    });

    it("rejects invalid table names", async () => {
      await expect(
        router.handle(db, "db.query", { table: "Robert'; DROP TABLE students;--" }),
      ).rejects.toThrow(/invalid table/i);
    });
  });

  describe("db.update", () => {
    it("updates a cell value", async () => {
      // Seed a category
      sqlite.prepare(
        "INSERT INTO categories (id, name, budget_percent_low, budget_percent_high, sort_order) VALUES (99, 'Test', 0, 0, 99)",
      ).run();

      const result = (await router.handle(db, "db.update", {
        table: "categories",
        id: 99,
        column: "name",
        value: "Updated",
      })) as Record<string, unknown>;

      expect(result.name).toBe("Updated");
    });

    it("rejects invalid table names", async () => {
      await expect(
        router.handle(db, "db.update", {
          table: "nonexistent",
          id: 1,
          column: "name",
          value: "x",
        }),
      ).rejects.toThrow(/invalid table/i);
    });

    it("rejects invalid column names", async () => {
      await expect(
        router.handle(db, "db.update", {
          table: "categories",
          id: 1,
          column: "nonexistent_col",
          value: "x",
        }),
      ).rejects.toThrow(/invalid column/i);
    });
  });
});
