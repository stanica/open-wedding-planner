import { eq } from "drizzle-orm";
import { tasks } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";
import type { GatewayEvent } from "@wedding-planner/shared";

export function registerTaskHandlers(router: Router, broadcast?: (event: GatewayEvent) => void) {
  const notify = () => broadcast?.({ name: "data.changed", data: { entity: "tasks" } });
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
    notify();
    return row;
  });

  router.register("tasks.update", async (db: Db, params: unknown) => {
    const { id, ...data } = params as { id: number } & Record<string, unknown>;
    await db.update(tasks).set(data).where(eq(tasks.id, id));
    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    notify();
    return updated;
  });

  router.register("tasks.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(tasks).where(eq(tasks.id, id));
    notify();
    return { ok: true };
  });
}
