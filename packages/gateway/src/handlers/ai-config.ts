import { aiConfig } from "../db/schema.js";
import { setAIConfig, getAIConfig, type AIProviderConfig } from "../agents/model-provider.js";
import type { Router, Db } from "../infra/router.js";

export function registerAIConfigHandlers(router: Router) {
  router.register("ai-config.get", async (db: Db) => {
    const [row] = await db.select().from(aiConfig);
    if (row) {
      return {
        provider: row.provider,
        model: row.model,
        proxyUrl: row.proxyUrl,
        hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      };
    }
    // Return defaults
    const defaults = getAIConfig();
    return {
      ...defaults,
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    };
  });

  router.register("ai-config.update", async (db: Db, params: unknown) => {
    const data = params as Partial<AIProviderConfig>;
    const [existing] = await db.select().from(aiConfig);

    if (existing) {
      await db
        .update(aiConfig)
        .set({
          provider: data.provider ?? existing.provider,
          model: data.model ?? existing.model,
          proxyUrl: data.proxyUrl ?? existing.proxyUrl,
        });
    } else {
      await db.insert(aiConfig).values({
        provider: data.provider ?? "api-key",
        model: data.model ?? "claude-sonnet-4-20250514",
        proxyUrl: data.proxyUrl ?? "http://localhost:3456/v1",
      });
    }

    // Update in-memory config
    const [updated] = await db.select().from(aiConfig);
    if (updated) {
      setAIConfig({
        provider: updated.provider as AIProviderConfig["provider"],
        model: updated.model,
        proxyUrl: updated.proxyUrl,
      });
    }

    return { ok: true };
  });

  router.register("ai-config.check", async (_db: Db, params: unknown) => {
    const { proxyUrl } = (params as { proxyUrl?: string }) ?? {};
    const url = proxyUrl ?? getAIConfig().proxyUrl;

    try {
      const res = await fetch(`${url}/models`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        return { connected: true, models: data };
      }
      return { connected: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  });
}
