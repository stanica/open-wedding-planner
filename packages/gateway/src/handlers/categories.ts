import { eq } from "drizzle-orm";
import { categories, vendors } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerCategoryHandlers(router: Router) {
  router.register("categories.list", async (db: Db) => {
    return db.select().from(categories).orderBy(categories.sortOrder);
  });

  router.register("categories.get", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [row] = await db.select().from(categories).where(eq(categories.id, id));
    if (!row) throw new Error(`Category ${id} not found`);
    return row;
  });

  router.register("categories.update", async (db: Db, params: unknown) => {
    const { id, ...data } = params as { id: number } & Record<string, unknown>;
    await db.update(categories).set(data).where(eq(categories.id, id));
    const [updated] = await db.select().from(categories).where(eq(categories.id, id));
    return updated;
  });

  router.register("categories.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const assigned = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.categoryId, id));
    if (assigned.length > 0) {
      throw new Error(`Cannot delete category: ${assigned.length} vendors still assigned`);
    }
    await db.delete(categories).where(eq(categories.id, id));
    return { ok: true };
  });
}
