import { eq } from "drizzle-orm";
import { tasks } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerTaskHandlers(router: Router) {
  router.register("tasks.list", async (db: Db) => {
    return db.select().from(tasks).orderBy(tasks.sortOrder);
  });

  router.register("tasks.get", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!row) throw new Error(`Task ${id} not found`);
    return row;
  });

  router.register("tasks.create", async (db: Db, params: unknown) => {
    const data = params as typeof tasks.$inferInsert;
    const [row] = await db.insert(tasks).values(data).returning();
    return row;
  });

  router.register("tasks.update", async (db: Db, params: unknown) => {
    const { id, ...data } = params as { id: number } & Record<string, unknown>;
    await db.update(tasks).set(data).where(eq(tasks.id, id));
    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    return updated;
  });

  router.register("tasks.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(tasks).where(eq(tasks.id, id));
    return { ok: true };
  });
}
