import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../src/db/schema.js";
import { pushSchema } from "../src/db/migrate.js";
import { seedCategories } from "../src/db/seed.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
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
    expect(cats.length).toBe(10);
    expect(cats.find((c) => c.name === "Venue/Food/Beverage")).toBeDefined();
  });

  it("does not re-seed if categories exist", async () => {
    await seedCategories(db);
    await seedCategories(db);
    const cats = await db.select().from(schema.categories);
    expect(cats.length).toBe(10);
  });
});
