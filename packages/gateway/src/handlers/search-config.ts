import { searchConfig } from "../db/schema.js";
import {
  setSearchConfig,
  getSearchConfig,
  type SearchConfig,
  type SearchProviderType,
} from "../tools/search.js";
import type { Router, Db } from "../infra/router.js";

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function registerSearchConfigHandlers(router: Router) {
  router.register("search-config.get", async (db: Db) => {
    const [row] = await db.select().from(searchConfig);
    const config = row
      ? {
          provider: row.provider as SearchProviderType,
          hasApiKey: !!row.apiKey,
          maskedApiKey: row.apiKey ? maskApiKey(row.apiKey) : null,
        }
      : {
          provider: getSearchConfig().provider,
          hasApiKey: false,
          maskedApiKey: null,
        };

    return config;
  });

  router.register("search-config.update", async (db: Db, params: unknown) => {
    const data = params as Partial<SearchConfig>;
    const [existing] = await db.select().from(searchConfig);

    const now = new Date().toISOString();

    if (existing) {
      await db.update(searchConfig).set({
        provider: data.provider ?? existing.provider,
        apiKey: data.apiKey !== undefined ? data.apiKey : existing.apiKey,
        updatedAt: now,
      });
    } else {
      await db.insert(searchConfig).values({
        provider: data.provider ?? "duckduckgo",
        apiKey: data.apiKey ?? null,
        updatedAt: now,
      });
    }

    // Update in-memory config
    const [updated] = await db.select().from(searchConfig);
    if (updated) {
      setSearchConfig({
        provider: updated.provider as SearchProviderType,
        apiKey: updated.apiKey,
      });
    }

    return { ok: true };
  });

  router.register("search-config.validate", async (_db: Db, params: unknown) => {
    const { apiKey } = params as { apiKey: string };
    if (!apiKey) {
      return { valid: false, error: "No API key provided" };
    }

    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", "test");
      url.searchParams.set("count", "1");

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        return { valid: true };
      }
      return { valid: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Validation failed",
      };
    }
  });
}
