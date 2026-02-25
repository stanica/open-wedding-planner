import { eq, and, sql } from "drizzle-orm";
import { vendors } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerVendorHandlers(router: Router) {
  router.register("vendors.list", async (db: Db, params: unknown) => {
    const filters = (params as { categoryId?: number; status?: string } | undefined) ?? {};
    const conditions = [];

    if (filters.categoryId) {
      conditions.push(eq(vendors.categoryId, filters.categoryId));
    }
    if (filters.status) {
      conditions.push(eq(vendors.status, filters.status));
    }

    if (conditions.length > 0) {
      return db.select().from(vendors).where(and(...conditions)).orderBy(vendors.name);
    }
    return db.select().from(vendors).orderBy(vendors.name);
  });

  router.register("vendors.get", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [row] = await db.select().from(vendors).where(eq(vendors.id, id));
    if (!row) throw new Error(`Vendor ${id} not found`);
    return row;
  });

  router.register("vendors.create", async (db: Db, params: unknown) => {
    const data = params as typeof vendors.$inferInsert;
    const result = await db.insert(vendors).values(data).returning();
    return result[0];
  });

  router.register("vendors.update", async (db: Db, params: unknown) => {
    const { id, ...data } = params as { id: number } & Record<string, unknown>;
    data.updatedAt = sql`datetime('now')`;
    await db.update(vendors).set(data).where(eq(vendors.id, id));
    const [updated] = await db.select().from(vendors).where(eq(vendors.id, id));
    return updated;
  });

  router.register("vendors.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(vendors).where(eq(vendors.id, id));
    return { ok: true };
  });
}
