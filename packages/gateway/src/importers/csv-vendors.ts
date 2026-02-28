import { parse } from "csv-parse/sync";
import { vendors, quotes, quoteLineItems } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { categories } from "../db/schema.js";
import type { Db } from "../infra/router.js";

// Map Ischia CSV section headers to database category names
const SECTION_CATEGORY_MAP: Record<string, string> = {
  VENUE: "Venue/Food/Beverage",
  FLOWERS: "Decor",
  "CHAIRS, TABLES": "Venue/Food/Beverage",
  MUSIC: "Entertainment",
  DINNER: "Venue/Food/Beverage",
  "WEDDING CAKE": "Venue/Food/Beverage",
  "MAKEUP, HAIR": "Attire",
  DJ: "Entertainment",
  PHOTOGRAPHER: "Photography/Videography",
  VIDEOMAKER: "Photography/Videography",
  "WEDDING FAVOURS": "Miscellaneous",
  TRANSPORTATION: "Miscellaneous",
};

export async function importVendorsCsv(db: Db, csvContent: string) {
  const rows = parse(csvContent, {
    relax_column_count: true,
    skip_empty_lines: false,
  }) as string[][];

  // Create the planner as a vendor
  const plannerCat = await db
    .select()
    .from(categories)
    .where(eq(categories.name, "Planner/Coordinator"));
  const plannerCategoryId = plannerCat[0]?.id ?? 8;

  const [planner] = await db
    .insert(vendors)
    .values({
      categoryId: plannerCategoryId,
      name: "Ischia Open Wedding Planner",
      location: "Ischia, Italy",
      status: "quoted",
      description: "Full-service Open Wedding Planner for Ischia destination weddings",
    })
    .returning();

  // Parse all line items from the CSV
  const lineItems: Array<{
    description: string;
    amount: number;
    pricingType: string;
    unitPrice: number | null;
    quantity: number | null;
    notes: string | null;
  }> = [];

  let totalHigh = 0;
  let totalLow = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const colA = (row[0] ?? "").trim();
    const colB = (row[1] ?? "").trim();
    const colC = (row[2] ?? "").trim();
    const colD = (row[3] ?? "").trim();
    const colE = (row[4] ?? "").trim();

    // Skip section headers, empty rows, totals
    if (SECTION_CATEGORY_MAP[colA]) continue;
    if (colB === "TOTAL (EUROS)" || colB === "TOTAL (CAD)") continue;
    if (!colB && !colC && !colD) continue;

    const description = colB || colA;
    if (!description) continue;

    // Parse amounts
    const highAmount = parseFloat(colC) || 0;
    const lowAmount = parseFloat(colD) || 0;
    const amount = highAmount || lowAmount;

    if (amount <= 0) continue;

    // Detect pricing type
    let pricingType = "flat";
    let unitPrice: number | null = null;
    let quantity: number | null = null;
    let notes: string | null = null;

    if (colE) {
      const perPersonMatch = colE.match(/(\d+)/);
      if (perPersonMatch && description.toLowerCase().includes("per person")) {
        pricingType = "per_person";
        unitPrice = parseInt(perPersonMatch[1], 10);
        quantity = 60; // guest count from header
      } else if (perPersonMatch) {
        unitPrice = parseFloat(colE) || null;
        quantity = parseFloat(row[5] ?? "") || null;
      }
    }

    // Check for "per person" in description even without colE
    if (description.toLowerCase().includes("per person") && pricingType === "flat") {
      pricingType = "per_person";
    }

    if (highAmount > 0) totalHigh += highAmount;
    if (lowAmount > 0) totalLow += lowAmount;

    lineItems.push({
      description,
      amount,
      pricingType,
      unitPrice,
      quantity,
      notes,
    });
  }

  // Create the quote
  const quoteTotal = totalHigh || totalLow;
  if (quoteTotal > 0 && lineItems.length > 0) {
    const [quote] = await db
      .insert(quotes)
      .values({
        vendorId: planner.id,
        totalAmount: quoteTotal,
        currency: "EUR",
        source: "email",
      })
      .returning();

    await db.insert(quoteLineItems).values(
      lineItems.map((li) => ({
        quoteId: quote.id,
        ...li,
      })),
    );

    return {
      vendorId: planner.id,
      quoteId: quote.id,
      lineItems: lineItems.length,
    };
  }

  return { vendorId: planner.id, quoteId: null, lineItems: 0 };
}
