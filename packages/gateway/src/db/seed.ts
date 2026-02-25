import { eq, count } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { categories } from "./schema.js";
import { DEFAULT_CATEGORIES } from "@wedding-planner/shared";
import type * as schema from "./schema.js";

export async function seedCategories(db: BetterSQLite3Database<typeof schema>) {
  const [result] = await db.select({ count: count() }).from(categories);
  if (result.count > 0) return;

  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((cat) => ({
      name: cat.name,
      budgetPercentLow: cat.budgetPercentLow,
      budgetPercentHigh: cat.budgetPercentHigh,
      budgetFixed: null,
      sortOrder: cat.sortOrder,
    })),
  );
}
