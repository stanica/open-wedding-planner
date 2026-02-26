import { eq, sql } from "drizzle-orm";
import { toolPermissions } from "../db/schema.js";
import type { Router } from "../infra/router.js";

export function registerToolPermissionHandlers(router: Router) {
  router.register("tools.permissions.list", async (db) => {
    return db.select().from(toolPermissions).all();
  });

  router.register("tools.permissions.get", async (db, params) => {
    const { toolName } = params as { toolName: string };
    const [row] = await db
      .select()
      .from(toolPermissions)
      .where(eq(toolPermissions.toolName, toolName));
    return row ?? null;
  });

  router.register("tools.permissions.update", async (db, params) => {
    const { toolName, decision } = params as {
      toolName: string;
      decision: "allow" | "deny" | "prompt";
    };
    await db
      .insert(toolPermissions)
      .values({ toolName, decision, updatedAt: sql`datetime('now')` })
      .onConflictDoUpdate({
        target: toolPermissions.toolName,
        set: { decision, updatedAt: sql`datetime('now')` },
      });
    const [row] = await db
      .select()
      .from(toolPermissions)
      .where(eq(toolPermissions.toolName, toolName));
    return row;
  });
}
