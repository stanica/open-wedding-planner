import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerAIConfigHandlers } from "../../src/handlers/ai-config.js";
import { setAIConfig } from "../../src/agents/model-provider.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAIConfigHandlers(router);
  return { db, router };
}

describe("ai-config handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    ({ db, router } = setup());
    // Reset in-memory config to defaults between tests
    setAIConfig({ provider: "anthropic", model: "claude-sonnet-4-20250514", apiKey: null, baseUrl: null });
  });

  it("returns defaults when no config exists", async () => {
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("updates model", async () => {
    const result = (await router.handle(db, "ai-config.update", {
      model: "claude-opus-4-20250514",
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);

    const config = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(config.model).toBe("claude-opus-4-20250514");
  });

  it("returns available models list from ai-config.get", async () => {
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result).toHaveProperty("availableModels");
    expect(result.availableModels).toEqual([]);
  });

  it("stores and retrieves provider and baseUrl", async () => {
    await router.handle(db, "ai-config.update", {
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "meta-llama/llama-3-70b",
      apiKey: "sk-or-test-key",
    });
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result.provider).toBe("openrouter");
    expect(result.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(result.model).toBe("meta-llama/llama-3-70b");
    expect(result.hasApiKey).toBe(true);
  });

  it("defaults to anthropic provider when not specified", async () => {
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result.provider).toBe("anthropic");
  });

  it("updates provider without losing other fields", async () => {
    await router.handle(db, "ai-config.update", { model: "claude-opus-4-20250514" });
    await router.handle(db, "ai-config.update", { provider: "openai", apiKey: "sk-test" });
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result.provider).toBe("openai");
    expect(result.hasApiKey).toBe(true);
  });

  describe("provider switching flow", () => {
    it("switches from anthropic to openrouter and back", async () => {
      // Start with default
      let result = (await router.handle(db, "ai-config.get", undefined)) as any;
      expect(result.provider).toBe("anthropic");

      // Switch to openrouter
      await router.handle(db, "ai-config.update", {
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "meta-llama/llama-3-70b",
        apiKey: "sk-or-test",
      });
      result = (await router.handle(db, "ai-config.get", undefined)) as any;
      expect(result.provider).toBe("openrouter");
      expect(result.model).toBe("meta-llama/llama-3-70b");

      // Switch back to anthropic
      await router.handle(db, "ai-config.update", {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
      });
      result = (await router.handle(db, "ai-config.get", undefined)) as any;
      expect(result.provider).toBe("anthropic");
    });

    it("ollama provider does not require apiKey", async () => {
      await router.handle(db, "ai-config.update", {
        provider: "ollama",
        baseUrl: "http://localhost:11434",
        model: "llama3",
      });
      const result = (await router.handle(db, "ai-config.get", undefined)) as any;
      expect(result.provider).toBe("ollama");
      expect(result.hasApiKey).toBe(false);
    });

    it("custom provider stores base URL", async () => {
      await router.handle(db, "ai-config.update", {
        provider: "custom",
        baseUrl: "http://my-server:8080/v1",
        model: "my-model",
        apiKey: "test-key",
      });
      const result = (await router.handle(db, "ai-config.get", undefined)) as any;
      expect(result.provider).toBe("custom");
      expect(result.baseUrl).toBe("http://my-server:8080/v1");
      expect(result.model).toBe("my-model");
    });
  });
});
