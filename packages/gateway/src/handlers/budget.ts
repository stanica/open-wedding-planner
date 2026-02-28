import { eq } from "drizzle-orm";
import { budgetEntries } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";
import type { GatewayEvent } from "@wedding-planner/shared";

export function registerBudgetHandlers(router: Router, broadcast?: (event: GatewayEvent) => void) {
  const notify = () => broadcast?.({ name: "data.changed", data: { entity: "budget" } });
  router.register("budget.list", async (db: Db, params: unknown) => {
    const filters = (params as { categoryId?: number } | undefined) ?? {};
    if (filters.categoryId) {
      return db
        .select()
        .from(budgetEntries)
        .where(eq(budgetEntries.categoryId, filters.categoryId));
    }
    return db.select().from(budgetEntries);
  });

  router.register("budget.get", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [row] = await db.select().from(budgetEntries).where(eq(budgetEntries.id, id));
    if (!row) throw new Error(`Budget entry ${id} not found`);
    return row;
  });

  router.register("budget.create", async (db: Db, params: unknown) => {
    const data = params as typeof budgetEntries.$inferInsert;
    const [row] = await db.insert(budgetEntries).values(data).returning();
    notify();
    return row;
  });

  router.register("budget.update", async (db: Db, params: unknown) => {
    const { id, ...data } = params as { id: number } & Record<string, unknown>;
    await db.update(budgetEntries).set(data).where(eq(budgetEntries.id, id));
    const [updated] = await db.select().from(budgetEntries).where(eq(budgetEntries.id, id));
    notify();
    return updated;
  });

  router.register("budget.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(budgetEntries).where(eq(budgetEntries.id, id));
    notify();
    return { ok: true };
  });
}
