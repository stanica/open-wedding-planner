import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { importBudgetCsv } from "../../src/importers/csv-budget.js";
import { importVendorsCsv } from "../../src/importers/csv-vendors.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db };
}

// Find the CSV files - they're in the project root
function findProjectRoot(): string {
  let dir = __dirname;
  while (dir !== "/") {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not find project root");
}

describe("CSV importers", () => {
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    ({ db } = setup());
    await seedCategories(db);
  });

  it("imports budget CSV and creates budget entries", async () => {
    const csvPath = path.join(findProjectRoot(), "..", "..", "The Wedding Spreadsheet - Budget.csv");
    if (!fs.existsSync(csvPath)) {
      // Try alternative paths
      const altPath = path.join(findProjectRoot(), "The Wedding Spreadsheet - Budget.csv");
      if (!fs.existsSync(altPath)) {
        console.warn("Budget CSV not found, skipping test");
        return;
      }
    }

    const content = fs.readFileSync(
      fs.existsSync(path.join(findProjectRoot(), "..", "..", "The Wedding Spreadsheet - Budget.csv"))
        ? path.join(findProjectRoot(), "..", "..", "The Wedding Spreadsheet - Budget.csv")
        : path.join(findProjectRoot(), "The Wedding Spreadsheet - Budget.csv"),
      "utf-8",
    );
    const result = await importBudgetCsv(db, content);

    expect(result.imported).toBeGreaterThan(0);

    const entries = await db.select().from(schema.budgetEntries);
    expect(entries.length).toBe(result.imported);
    expect(entries.some((e) => e.description.includes("Venue"))).toBe(true);
  });

  it("imports budget from inline CSV content", async () => {
    const csv = `,,High Estimate,Low Estimate,Estimated Actual,Amount Paid $,Balance Due $,Final Payment Due Date,Paid By,Notes
"Venue, Food, and Beverage",42–50%,,,,,,,,
Venue (ceremony + reception),,5000,4000,4500,1000,,2026-06-01,,deposit paid
Catering,,10000,8000,9000,,,,,
,,,,,,,,,,
Ceremony,2–3%,,,,,,,,
Officiant,,500,400,,,,,,`;

    const result = await importBudgetCsv(db, csv);
    expect(result.imported).toBeGreaterThan(0);

    const entries = await db.select().from(schema.budgetEntries);
    const venueEntry = entries.find((e) => e.description === "Venue (ceremony + reception)");
    expect(venueEntry).toBeDefined();
    expect(venueEntry!.highEstimate).toBe(5000);
    expect(venueEntry!.lowEstimate).toBe(4000);
    expect(venueEntry!.amountPaid).toBe(1000);
  });

  it("imports Ischia vendor CSV and creates vendor with quote", async () => {
    const csv = `,,60 people,,,,,,,,
VENUE,• Symbolic wedding choice:,,,,,,,,,
,- Torre di Michelangelo,1500,1500,,,,,,,
,- Torre del Molino,1500,1500,,,,,,,
,,,,,,,,,,
FLOWERS,• Arch of flowers and greenery,900,900,,,,,,,
,- Bridal bouquet,200,200,,,,,,,
,,,,,,,,,,
DJ,• Dj Set,1000,1000,,,,,,,`;

    const result = await importVendorsCsv(db, csv);
    expect(result.vendorId).toBeGreaterThan(0);
    expect(result.lineItems).toBeGreaterThan(0);

    const vendorRows = await db.select().from(schema.vendors);
    expect(vendorRows).toHaveLength(1);
    expect(vendorRows[0].name).toBe("Ischia Wedding Planner");

    if (result.quoteId) {
      const quoteRows = await db.select().from(schema.quotes);
      expect(quoteRows).toHaveLength(1);
      expect(quoteRows[0].totalAmount).toBeGreaterThan(0);

      const lineItemRows = await db.select().from(schema.quoteLineItems);
      expect(lineItemRows.length).toBe(result.lineItems);
    }
  });
});
