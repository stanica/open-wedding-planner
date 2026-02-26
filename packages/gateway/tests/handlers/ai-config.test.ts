import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerAIConfigHandlers } from "../../src/handlers/ai-config.js";
import { ProxyManager } from "../../src/infra/proxy-manager.js";

// Mock ProxyManager so tests don't spawn real processes
vi.mock("../../src/infra/proxy-manager.js", () => {
  const MockProxyManager = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.start = vi.fn().mockResolvedValue("http://localhost:3456/v1");
    this.stop = vi.fn().mockResolvedValue(undefined);
    this.isRunning = vi.fn().mockReturnValue(false);
    this.getStatus = vi.fn().mockReturnValue({
      running: false,
      url: null,
      error: null,
    });
  });
  return { ProxyManager: MockProxyManager };
});

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  const proxyManager = new ProxyManager();
  registerAIConfigHandlers(router, proxyManager);
  return { db, router, proxyManager };
}

describe("ai-config handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;
  let proxyManager: ProxyManager;

  beforeEach(() => {
    ({ db, router, proxyManager } = setup());
    vi.clearAllMocks();
  });

  it("returns defaults when no config exists", async () => {
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result.provider).toBe("api-key");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("starts proxy when switching to claude-max", async () => {
    const result = (await router.handle(db, "ai-config.update", {
      provider: "claude-max",
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(proxyManager.start).toHaveBeenCalled();
  });

  it("stops proxy when switching away from claude-max", async () => {
    // First switch to claude-max
    await router.handle(db, "ai-config.update", { provider: "claude-max" });
    vi.clearAllMocks();

    // Then switch back to api-key
    const result = (await router.handle(db, "ai-config.update", {
      provider: "api-key",
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(proxyManager.stop).toHaveBeenCalled();
  });

  it("includes proxy status in update response", async () => {
    const result = (await router.handle(db, "ai-config.update", {
      provider: "claude-max",
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("proxyStatus");
  });

  it("returns proxy status and available models from ai-config.get", async () => {
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result).toHaveProperty("proxyStatus");
    expect(result).toHaveProperty("availableModels");
    expect(result.availableModels).toEqual([]);
  });

  it("captures proxy start error without failing the update", async () => {
    (proxyManager.start as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Claude CLI not found"));

    const result = (await router.handle(db, "ai-config.update", {
      provider: "claude-max",
    })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.proxyError).toBe("Claude CLI not found");
  });
});
