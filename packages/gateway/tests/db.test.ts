import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../src/db/schema.js";
import { pushSchema } from "../src/db/migrate.js";
import { seedCategories } from "../src/db/seed.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

describe("database", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: InstanceType<typeof Database>;

  beforeEach(() => {
    ({ db, sqlite } = createTestDb());
  });

  it("creates all tables", () => {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("wedding_config");
    expect(tableNames).toContain("categories");
    expect(tableNames).toContain("vendors");
    expect(tableNames).toContain("vendor_attributes");
    expect(tableNames).toContain("quotes");
    expect(tableNames).toContain("quote_line_items");
    expect(tableNames).toContain("communications");
    expect(tableNames).toContain("research_notes");
    expect(tableNames).toContain("budget_entries");
    expect(tableNames).toContain("tasks");
    expect(tableNames).toContain("agent_tasks");
    expect(tableNames).toContain("sessions");
  });

  it("loads sqlite-vec extension", () => {
    const result = sqlite.prepare("SELECT vec_version() as version").get() as {
      version: string;
    };
    expect(typeof result.version).toBe("string");
    expect(result.version.length).toBeGreaterThan(0);
  });

  it("seeds default categories", async () => {
    await seedCategories(db);
    const cats = await db.select().from(schema.categories);
    expect(cats.length).toBe(11);
    expect(cats.find((c) => c.name === "Venue")).toBeDefined();
  });

  it("does not re-seed if categories exist", async () => {
    await seedCategories(db);
    await seedCategories(db);
    const cats = await db.select().from(schema.categories);
    expect(cats.length).toBe(11);
  });

  it("creates vendor_images table", () => {
    const rows = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vendor_images'",
      )
      .all();
    expect(rows).toHaveLength(1);
  });

  it("inserts and retrieves vendor images", () => {
    sqlite.exec(
      "INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES ('Test', 0.1, 0.2, 1)",
    );
    sqlite.exec(
      "INSERT INTO vendors (category_id, name, status) VALUES (1, 'Test Vendor', 'researched')",
    );

    sqlite.exec(`INSERT INTO vendor_images (vendor_id, filename, original_url, caption, sort_order)
      VALUES (1, 'abc123.jpg', 'https://example.com/photo.jpg', 'Pool area', 0)`);

    const rows = sqlite
      .prepare("SELECT * FROM vendor_images WHERE vendor_id = 1")
      .all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].filename).toBe("abc123.jpg");
    expect(rows[0].caption).toBe("Pool area");
  });

  it("cascade-deletes vendor images when vendor is deleted", () => {
    sqlite.exec(
      "INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES ('Test', 0.1, 0.2, 1)",
    );
    sqlite.exec(
      "INSERT INTO vendors (category_id, name, status) VALUES (1, 'Test Vendor', 'researched')",
    );
    sqlite.exec(
      "INSERT INTO vendor_images (vendor_id, filename, sort_order) VALUES (1, 'abc.jpg', 0)",
    );

    sqlite.exec("DELETE FROM vendors WHERE id = 1");

    const rows = sqlite.prepare("SELECT * FROM vendor_images").all();
    expect(rows).toHaveLength(0);
  });
});
