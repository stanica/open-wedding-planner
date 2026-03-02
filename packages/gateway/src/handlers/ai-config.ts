import { aiConfig } from "../db/schema.js";
import {
  setAIConfig,
  getAIConfig,
  type AIProviderConfig,
  type ProviderType,
} from "../agents/model-provider.js";
import type { Router, Db } from "../infra/router.js";
import type { EmbeddingService } from "../db/embeddings.js";
import type Database from "better-sqlite3";
import { buildEmbeddingText } from "../db/text-builders.js";

export function registerAIConfigHandlers(
  router: Router,
  embeddingService?: EmbeddingService,
  sqlite?: Database.Database,
) {
  router.register("ai-config.get", async (db: Db) => {
    const [row] = await db.select().from(aiConfig);
    const memConfig = getAIConfig();
    const effectiveProvider = (row?.provider ?? memConfig.provider ?? "anthropic") as ProviderType;
    const effectiveBaseUrl = row?.baseUrl ?? memConfig.baseUrl ?? null;
    const storedKey = row?.apiKey || memConfig.apiKey;
    const hasApiKey = !!(storedKey || (effectiveProvider === "anthropic" && process.env.ANTHROPIC_API_KEY));
    const effectiveKey = storedKey || (effectiveProvider === "anthropic" ? process.env.ANTHROPIC_API_KEY : null) || null;
    const maskedApiKey = effectiveKey
      ? `${effectiveKey.slice(0, 10)}...${effectiveKey.slice(-4)}`
      : null;

    const openaiKey = row?.openaiApiKey ?? null;
    const hasOpenaiApiKey = !!openaiKey;
    const maskedOpenaiApiKey = openaiKey
      ? `...${openaiKey.slice(-4)}`
      : null;

    const config = row
      ? {
          provider: effectiveProvider,
          baseUrl: effectiveBaseUrl,
          model: row.model,
          hasApiKey,
          maskedApiKey,
          hasOpenaiApiKey,
          maskedOpenaiApiKey,
          whatsappAutoSend: !!row.whatsappAutoSend,
          vapiApiKey: row.vapiApiKey ?? "",
          vapiPhoneNumberId: row.vapiPhoneNumberId ?? "",
          vapiAssistantId: row.vapiAssistantId ?? "",
          vapiAutoCall: !!row.vapiAutoCall,
        }
      : {
          provider: effectiveProvider,
          baseUrl: effectiveBaseUrl,
          model: memConfig.model,
          hasApiKey,
          maskedApiKey,
          hasOpenaiApiKey: false,
          maskedOpenaiApiKey: null,
          whatsappAutoSend: false,
          vapiApiKey: "",
          vapiPhoneNumberId: "",
          vapiAssistantId: "",
          vapiAutoCall: false,
        };

    // Fetch available models per provider
    let availableModels: string[] = [];
    try {
      switch (effectiveProvider) {
        case "anthropic": {
          if (effectiveKey) {
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
          }
          break;
        }
        case "ollama": {
          const ollamaUrl = effectiveBaseUrl || "http://localhost:11434";
          const res = await fetch(`${ollamaUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json();
            availableModels = (data?.models ?? []).map(
              (m: { name: string }) => m.name,
            );
          }
          break;
        }
        case "google": {
          // Google models must be typed manually
          break;
        }
        case "openai":
        case "openrouter":
        case "custom": {
          if (effectiveKey) {
            const base = effectiveBaseUrl || (effectiveProvider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");
            // Try {base}/models first, then {base}/v1/models
            let res = await fetch(`${base}/models`, {
              headers: { authorization: `Bearer ${effectiveKey}` },
              signal: AbortSignal.timeout(5000),
            });
            if (!res.ok && effectiveBaseUrl) {
              res = await fetch(`${base}/v1/models`, {
                headers: { authorization: `Bearer ${effectiveKey}` },
                signal: AbortSignal.timeout(5000),
              });
            }
            if (res.ok) {
              const data = await res.json();
              availableModels = (data?.data ?? []).map(
                (m: { id: string }) => m.id,
              );
            }
          }
          break;
        }
      }
    } catch {
      // API not reachable
    }

    return {
      ...config,
      availableModels,
    };
  });

  router.register("ai-config.update", async (db: Db, params: unknown) => {
    const data = params as Partial<AIProviderConfig>;
    if (data.apiKey) data.apiKey = data.apiKey.trim();
    const [existing] = await db.select().from(aiConfig);

    if (existing) {
      const updates: Record<string, unknown> = {
        model: data.model ?? existing.model,
      };
      if (data.apiKey !== undefined) {
        updates.apiKey = data.apiKey;
      }
      if ((data as any).provider !== undefined) {
        updates.provider = (data as any).provider;
      }
      if ((data as any).baseUrl !== undefined) {
        updates.baseUrl = (data as any).baseUrl;
      }
      if ((data as any).openaiApiKey !== undefined) {
        updates.openaiApiKey = (data as any).openaiApiKey;
      }
      if ((data as any).whatsappAutoSend !== undefined) {
        updates.whatsappAutoSend = (data as any).whatsappAutoSend ? 1 : 0;
      }
      if ((data as any).vapiApiKey !== undefined) {
        updates.vapiApiKey = (data as any).vapiApiKey;
      }
      if ((data as any).vapiPhoneNumberId !== undefined) {
        updates.vapiPhoneNumberId = (data as any).vapiPhoneNumberId;
      }
      if ((data as any).vapiAssistantId !== undefined) {
        updates.vapiAssistantId = (data as any).vapiAssistantId;
      }
      if ((data as any).vapiAutoCall !== undefined) {
        updates.vapiAutoCall = (data as any).vapiAutoCall ? 1 : 0;
      }
      await db.update(aiConfig).set(updates);
    } else {
      await db.insert(aiConfig).values({
        provider: (data as any).provider ?? "anthropic",
        baseUrl: (data as any).baseUrl ?? null,
        model: data.model ?? "claude-sonnet-4-20250514",
        apiKey: data.apiKey ?? null,
        openaiApiKey: (data as any).openaiApiKey ?? null,
      });
    }

    // Update in-memory config
    const [updated] = await db.select().from(aiConfig);
    if (updated) {
      setAIConfig({
        provider: (updated.provider ?? "anthropic") as ProviderType,
        model: updated.model,
        apiKey: updated.apiKey,
        baseUrl: updated.baseUrl,
      });
    }

    // Update embedding function
    if (embeddingService && updated?.openaiApiKey) {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const { embed } = await import("ai");
      const openai = createOpenAI({ apiKey: updated.openaiApiKey });
      embeddingService.setEmbedFn(async (text: string) => {
        const result = await embed({
          model: openai.embedding("text-embedding-3-small"),
          value: text,
        });
        return result.embedding;
      });
      // Backfill embeddings for existing data in background
      if (sqlite) {
        embeddingService
          .backfill((sourceTable, sourceId) =>
            buildEmbeddingText(sqlite, sourceTable, sourceId),
          )
          .catch((err: unknown) =>
            console.error("Embedding backfill error:", err),
          );
      }
    } else if (embeddingService && updated && !updated.openaiApiKey) {
      embeddingService.setEmbedFn(null);
    }

    return { ok: true };
  });

  router.register("ai-config.validate", async (_db: Db, params: unknown) => {
    const { apiKey: rawKey, provider, baseUrl } = params as { apiKey?: string; provider?: string; baseUrl?: string };
    const apiKey = rawKey?.trim().replace(/\s+/g, "");
    const effectiveProvider = provider ?? "anthropic";

    // Ollama doesn't require an API key — just test connectivity
    if (effectiveProvider === "ollama") {
      try {
        const ollamaUrl = baseUrl || "http://localhost:11434";
        const res = await fetch(`${ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { valid: true };
        return { valid: false, error: `HTTP ${res.status}` };
      } catch (err) {
        return { valid: false, error: err instanceof Error ? err.message : "Connection failed" };
      }
    }

    if (!apiKey) return { valid: false, error: "No API key provided" };

    // Anthropic-specific validation
    if (effectiveProvider === "anthropic") {
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
    }

    // OpenAI, OpenRouter, Google, Custom — test with models endpoint
    try {
      let url: string;
      if (effectiveProvider === "openrouter") url = baseUrl || "https://openrouter.ai/api/v1";
      else if (effectiveProvider === "google") url = "https://generativelanguage.googleapis.com/v1beta";
      else if (effectiveProvider === "custom") url = baseUrl || "";
      else url = baseUrl || "https://api.openai.com/v1";

      if (!url) return { valid: false, error: "No base URL provided" };

      const endpoint = effectiveProvider === "google" ? `${url}/models?key=${apiKey}` : `${url}/models`;
      const res = await fetch(endpoint, {
        headers: effectiveProvider === "google" ? {} : { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { valid: true };
      const body = await res.json().catch(() => null);
      return { valid: false, error: body?.error?.message ?? `HTTP ${res.status}` };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  });
}
