import { aiConfig } from "../db/schema.js";
import {
  setAIConfig,
  getAIConfig,
  type AIProviderConfig,
} from "../agents/model-provider.js";
import type { Router, Db } from "../infra/router.js";
import type { ProxyManager } from "../infra/proxy-manager.js";

export function registerAIConfigHandlers(
  router: Router,
  proxyManager: ProxyManager,
) {
  router.register("ai-config.get", async (db: Db) => {
    const [row] = await db.select().from(aiConfig);
    const memConfig = getAIConfig();
    const storedKey = row?.apiKey || memConfig.apiKey;
    const hasApiKey = !!(storedKey || process.env.ANTHROPIC_API_KEY);
    const effectiveKey = storedKey || process.env.ANTHROPIC_API_KEY || null;
    const maskedApiKey = effectiveKey
      ? `${effectiveKey.slice(0, 10)}...${effectiveKey.slice(-4)}`
      : null;

    const config = row
      ? {
          provider: row.provider,
          model: row.model,
          proxyUrl: row.proxyUrl,
          hasApiKey,
          maskedApiKey,
          whatsappAutoSend: !!row.whatsappAutoSend,
        }
      : {
          ...memConfig,
          hasApiKey,
          maskedApiKey,
          whatsappAutoSend: false,
        };

    // Fetch available models
    let availableModels: string[] = [];
    const status = proxyManager.getStatus();
    if (status.running && status.url) {
      // Claude Max proxy mode
      try {
        const res = await fetch(`${status.url}/models`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          availableModels = (data?.data ?? []).map(
            (m: { id: string }) => m.id,
          );
        }
      } catch {
        // Proxy not responding, return empty list
      }
    } else if (effectiveKey) {
      // Direct API mode — fetch from Anthropic
      try {
        const isOAuth = effectiveKey.startsWith("sk-ant-oat");
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "anthropic-version": "2023-06-01",
            ...(isOAuth
              ? { authorization: `Bearer ${effectiveKey}`, "anthropic-beta": "oauth-2025-04-20" }
              : { "x-api-key": effectiveKey }),
          },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          availableModels = (data?.data ?? []).map(
            (m: { id: string }) => m.id,
          );
        }
      } catch {
        // API not reachable
      }
    }

    return {
      ...config,
      proxyStatus: status,
      availableModels,
    };
  });

  router.register("ai-config.update", async (db: Db, params: unknown) => {
    const data = params as Partial<AIProviderConfig>;
    if (data.apiKey) data.apiKey = data.apiKey.trim();
    const [existing] = await db.select().from(aiConfig);

    if (existing) {
      const updates: Record<string, unknown> = {
        provider: data.provider ?? existing.provider,
        model: data.model ?? existing.model,
        proxyUrl: data.proxyUrl ?? existing.proxyUrl,
      };
      if (data.apiKey !== undefined) {
        updates.apiKey = data.apiKey;
      }
      if ((data as any).whatsappAutoSend !== undefined) {
        updates.whatsappAutoSend = (data as any).whatsappAutoSend ? 1 : 0;
      }
      await db.update(aiConfig).set(updates);
    } else {
      await db.insert(aiConfig).values({
        provider: data.provider ?? "api-key",
        model: data.model ?? "claude-sonnet-4-20250514",
        proxyUrl: data.proxyUrl ?? "http://localhost:3456/v1",
        apiKey: data.apiKey ?? null,
      });
    }

    // Update in-memory config
    const [updated] = await db.select().from(aiConfig);
    if (updated) {
      setAIConfig({
        provider: updated.provider as AIProviderConfig["provider"],
        model: updated.model,
        proxyUrl: updated.proxyUrl,
        apiKey: updated.apiKey,
      });
    }

    // Manage proxy lifecycle based on provider change
    const newProvider = updated?.provider ?? data.provider;
    let proxyError: string | null = null;

    if (newProvider === "claude-max") {
      try {
        await proxyManager.start();
      } catch (err) {
        proxyError =
          err instanceof Error ? err.message : "Failed to start proxy";
      }
    } else {
      try {
        await proxyManager.stop();
      } catch (err) {
        proxyError = err instanceof Error ? err.message : "Failed to stop proxy";
      }
    }

    return {
      ok: true,
      proxyStatus: proxyManager.getStatus(),
      proxyError,
    };
  });

  router.register("ai-config.ensure-proxy", async () => {
    if (proxyManager.isRunning()) {
      return { proxyStatus: proxyManager.getStatus() };
    }
    let proxyError: string | null = null;
    try {
      await proxyManager.start();
    } catch (err) {
      proxyError = err instanceof Error ? err.message : "Failed to start proxy";
    }
    return { proxyStatus: proxyManager.getStatus(), proxyError };
  });

  router.register("ai-config.stop-proxy", async () => {
    await proxyManager.stop();
    return { proxyStatus: proxyManager.getStatus() };
  });

  router.register("ai-config.validate", async (_db: Db, params: unknown) => {
    const { apiKey: rawKey } = params as { apiKey: string };
    const apiKey = rawKey?.trim().replace(/\s+/g, "");
    if (!apiKey) return { valid: false, error: "No API key provided" };

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          ...(apiKey.startsWith("sk-ant-oat")
            ? { authorization: `Bearer ${apiKey}`, "anthropic-beta": "oauth-2025-04-20" }
            : { "x-api-key": apiKey }),
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok || res.status === 200) {
        return { valid: true };
      }

      const body = await res.json().catch(() => null);
      const errMsg = body?.error?.message ?? `HTTP ${res.status}`;
      // 400 with "max_tokens" would mean auth succeeded (key is valid)
      if (res.status === 400) return { valid: true };
      return { valid: false, error: errMsg };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
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
