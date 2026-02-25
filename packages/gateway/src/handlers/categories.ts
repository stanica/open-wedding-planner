import { eq } from "drizzle-orm";
import { categories } from "../db/schema.js";
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
}
