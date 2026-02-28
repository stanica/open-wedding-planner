import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { buildEmbeddingText } from "../../src/db/text-builders.js";
import { pushSchema } from "../../src/db/migrate.js";

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
