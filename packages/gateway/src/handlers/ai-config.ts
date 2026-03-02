import { aiConfig } from "../db/schema.js";
import {
  setAIConfig,
  getAIConfig,
  type AIProviderConfig,
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
    const storedKey = row?.apiKey || memConfig.apiKey;
    const hasApiKey = !!(storedKey || process.env.ANTHROPIC_API_KEY);
    const effectiveKey = storedKey || process.env.ANTHROPIC_API_KEY || null;
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

    // Fetch available models from Anthropic API
    let availableModels: string[] = [];
    if (effectiveKey) {
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
        model: data.model ?? "claude-sonnet-4-20250514",
        apiKey: data.apiKey ?? null,
        openaiApiKey: (data as any).openaiApiKey ?? null,
      });
    }

    // Update in-memory config
    const [updated] = await db.select().from(aiConfig);
    if (updated) {
      setAIConfig({
        model: updated.model,
        apiKey: updated.apiKey,
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
}
