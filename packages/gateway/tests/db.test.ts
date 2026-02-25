import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../src/db/schema.js";
import { seedCategories } from "../src/db/seed.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  const db = drizzle(sqlite, { schema });

  // Push schema to in-memory DB using raw SQL from Drizzle schema
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS wedding_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wedding_date TEXT,
      guest_count INTEGER,
      budget_total REAL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      couple_names TEXT,
      couple_email TEXT,
      location TEXT,
      language_preferences TEXT NOT NULL DEFAULT '["en","it"]',
      dietary_requirements TEXT,
      alcohol_preferences TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      budget_percent_low REAL NOT NULL,
      budget_percent_high REAL NOT NULL,
      budget_fixed REAL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      location TEXT,
      website_url TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      contact_whatsapp TEXT,
      description TEXT,
      notes TEXT,
      source_url TEXT,
      status TEXT NOT NULL DEFAULT 'researched',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendor_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text'
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      total_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      valid_until TEXT,
      raw_text TEXT,
      source TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quote_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotes(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      pricing_type TEXT NOT NULL DEFAULT 'flat',
      unit_price REAL,
      quantity REAL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      direction TEXT NOT NULL,
      channel TEXT NOT NULL,
      subject TEXT,
      body_original TEXT NOT NULL,
      body_translated TEXT,
      language TEXT,
      sent_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      thread_id TEXT
    );

    CREATE TABLE IF NOT EXISTS research_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      content TEXT NOT NULL,
      source_url TEXT,
      source_type TEXT,
      extracted_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      vendor_id INTEGER REFERENCES vendors(id),
      description TEXT NOT NULL,
      high_estimate REAL,
      low_estimate REAL,
      estimated_actual REAL,
      amount_paid REAL,
      balance_due REAL,
      final_payment_due TEXT,
      paid_by TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      owner TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      deadline TEXT,
      category_id INTEGER REFERENCES categories(id),
      vendor_id INTEGER REFERENCES vendors(id),
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      session_id TEXT,
      input TEXT,
      output TEXT,
      parent_task_id INTEGER,
      vendor_id INTEGER REFERENCES vendors(id),
      category_id INTEGER REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      context TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

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
