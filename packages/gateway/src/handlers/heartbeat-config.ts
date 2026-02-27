import { eq } from "drizzle-orm";
import { heartbeatConfig } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerHeartbeatConfigHandlers(router: Router) {
  router.register("heartbeat-config.get", async (db: Db) => {
    const [row] = await db.select().from(heartbeatConfig).limit(1);
    return row ?? { enabled: 0, prompt: null, intervalMinutes: 30, lastRunAt: null };
  });

  router.register("heartbeat-config.update", async (db: Db, params: unknown) => {
    const { enabled, prompt, intervalMinutes } = params as {
      enabled?: boolean;
      prompt?: string | null;
      intervalMinutes?: number;
    };

    const [existing] = await db.select().from(heartbeatConfig).limit(1);

    const values: Record<string, unknown> = {};
    if (enabled !== undefined) values.enabled = enabled ? 1 : 0;
    if (prompt !== undefined) values.prompt = prompt;
    if (intervalMinutes !== undefined) values.intervalMinutes = intervalMinutes;

    if (existing) {
      await db.update(heartbeatConfig).set(values).where(eq(heartbeatConfig.id, existing.id));
    } else {
      await db.insert(heartbeatConfig).values({
        enabled: enabled ? 1 : 0,
        prompt: prompt ?? null,
        intervalMinutes: intervalMinutes ?? 30,
      });
    }

    const [updated] = await db.select().from(heartbeatConfig).limit(1);
    return updated;
  });
}
