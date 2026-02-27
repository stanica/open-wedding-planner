import { eq } from "drizzle-orm";
import { guardrailsConfig } from "../db/schema.js";
import { DEFAULT_GUARDRAILS_CONFIG } from "../agents/safety/defaults.js";
import type { GuardrailsConfig } from "../agents/safety/types.js";
import type { Router, Db } from "../infra/router.js";

function rowToConfig(row: { enabled: number; config: string | null } | undefined): GuardrailsConfig {
  const base = { ...DEFAULT_GUARDRAILS_CONFIG, enabled: !!(row?.enabled) };
  if (row?.config) {
    try {
      const parsed = JSON.parse(row.config);
      return {
        ...base,
        ...parsed,
        enabled: base.enabled,
        repeat: { ...base.repeat, ...parsed.repeat },
        polling: { ...base.polling, ...parsed.polling },
        pingPong: { ...base.pingPong, ...parsed.pingPong },
        circuitBreaker: { ...base.circuitBreaker, ...parsed.circuitBreaker },
      };
    } catch {
      return base;
    }
  }
  return base;
}

export function registerGuardrailsConfigHandlers(router: Router) {
  router.register("guardrails-config.get", async (db: Db) => {
    const [row] = await db.select().from(guardrailsConfig).limit(1);
    return rowToConfig(row);
  });

  router.register("guardrails-config.update", async (db: Db, params: unknown) => {
    const incoming = params as Partial<GuardrailsConfig>;
    const [existing] = await db.select().from(guardrailsConfig).limit(1);

    // Separate enabled from the rest of the config
    const enabled = incoming.enabled !== undefined ? (incoming.enabled ? 1 : 0) : (existing?.enabled ?? 0);
    const { enabled: _, ...detectorConfig } = incoming;
    const existingConfig = existing?.config ? JSON.parse(existing.config) : {};
    const merged = { ...existingConfig, ...detectorConfig };

    // Deep merge detector configs
    for (const key of ["repeat", "polling", "pingPong", "circuitBreaker"] as const) {
      if (detectorConfig[key]) {
        merged[key] = { ...(existingConfig[key] ?? {}), ...detectorConfig[key] };
      }
    }

    const configJson = JSON.stringify(merged);

    if (existing) {
      await db.update(guardrailsConfig).set({ enabled, config: configJson }).where(eq(guardrailsConfig.id, existing.id));
    } else {
      await db.insert(guardrailsConfig).values({ enabled, config: configJson });
    }

    const [updated] = await db.select().from(guardrailsConfig).limit(1);
    return rowToConfig(updated);
  });
}

export async function getGuardrailsConfigFromDb(db: Db): Promise<GuardrailsConfig> {
  const [row] = await db.select().from(guardrailsConfig).limit(1);
  return rowToConfig(row);
}
