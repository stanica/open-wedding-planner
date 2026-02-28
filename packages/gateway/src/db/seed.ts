import { eq, count } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { categories } from "./schema.js";
import { DEFAULT_CATEGORIES } from "@wedding-planner/shared";
import type * as schema from "./schema.js";

export async function seedCategories(db: BetterSQLite3Database<typeof schema>) {
  const [result] = await db.select({ count: count() }).from(categories);

  if (result.count > 0) {
    // Migrate: split "Venue/Food/Beverage" into "Venue" + "Food/Beverage"
    const [old] = await db.select().from(categories).where(eq(categories.name, "Venue/Food/Beverage"));
    if (old) {
      await db.update(categories).set({ name: "Venue", budgetPercentLow: 25, budgetPercentHigh: 30 }).where(eq(categories.id, old.id));
      await db.insert(categories).values({ name: "Food/Beverage", budgetPercentLow: 17, budgetPercentHigh: 20, budgetFixed: null, sortOrder: old.sortOrder + 1 });
      // Bump sort orders for categories after the old one
      const all = await db.select().from(categories);
      for (const cat of all) {
        if (cat.id !== old.id && cat.name !== "Food/Beverage" && cat.sortOrder >= old.sortOrder + 1) {
          await db.update(categories).set({ sortOrder: cat.sortOrder + 1 }).where(eq(categories.id, cat.id));
        }
      }
    }
    return;
  }

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
