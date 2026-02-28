import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";
import { categories, budgetEntries } from "../db/schema.js";
import type { Db } from "../infra/router.js";

// Category name mapping from CSV header to DB category name
const CATEGORY_MAP: Record<string, string> = {
  "Venue, Food, and Beverage": "Venue",
  "Ceremony": "Ceremony",
  "Photography/Videography": "Photography/Videography",
  "Decor": "Decor",
  "Stationary/Paper Goods/Invites": "Stationery",
  "Attire": "Attire",
  "Entertainment": "Entertainment",
  "Planner/Coordinator": "Planner/Coordinator",
  "Miscellaneous": "Miscellaneous",
  "Contingency": "Contingency",
};

export async function importBudgetCsv(db: Db, csvContent: string) {
  const rows = parse(csvContent, {
    relax_column_count: true,
    skip_empty_lines: false,
  }) as string[][];

  // Skip header row
  let currentCategoryId: number | null = null;
  let imported = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const colA = (row[0] ?? "").trim();
    const colB = (row[1] ?? "").trim();

    // Check if this is a category header (has percentage in col B like "42–50%")
    if (colA && /\d+[–-]\d+%/.test(colB)) {
      const dbName = CATEGORY_MAP[colA];
      if (dbName) {
        const [cat] = await db
          .select()
          .from(categories)
          .where(eq(categories.name, dbName));
        currentCategoryId = cat?.id ?? null;
      }
      continue;
    }

    // Skip TOTAL row
    if (colA === "TOTAL") continue;

    // If we have a category and a description, this is a budget entry
    const description = colA || colB;
    if (!description || !currentCategoryId) continue;

    // Skip empty rows
    if (!colA && !colB) {
      continue;
    }

    const highEstimate = parseFloat(row[2] ?? "") || null;
    const lowEstimate = parseFloat(row[3] ?? "") || null;
    const estimatedActual = parseFloat(row[4] ?? "") || null;
    const amountPaid = parseFloat(row[5] ?? "") || null;
    const balanceDue = parseFloat(row[6] ?? "") || null;
    const finalPaymentDue = (row[7] ?? "").trim() || null;
    const paidBy = (row[8] ?? "").trim() || null;
    const notes = (row[9] ?? "").trim() || null;

    // Skip if no meaningful data
    if (
      !highEstimate &&
      !lowEstimate &&
      !estimatedActual &&
      !amountPaid &&
      description === colB // sub-item with no data
    ) {
      // Still import as a budget line item for structure
    }

    await db.insert(budgetEntries).values({
      categoryId: currentCategoryId,
      description,
      highEstimate,
      lowEstimate,
      estimatedActual,
      amountPaid,
      balanceDue,
      finalPaymentDue,
      paidBy,
      notes,
    });
    imported++;
  }

  return { imported };
}
