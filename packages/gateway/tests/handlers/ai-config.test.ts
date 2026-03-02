import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerAIConfigHandlers } from "../../src/handlers/ai-config.js";

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
});
