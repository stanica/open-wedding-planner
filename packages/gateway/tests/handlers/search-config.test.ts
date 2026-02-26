import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerSearchConfigHandlers } from "../../src/handlers/search-config.js";
import { getSearchConfig } from "../../src/tools/search.js";
import type { Db } from "../../src/infra/router.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerSearchConfigHandlers(router);
  return { db, router };
}

let db: Db;
let router: Router;

describe("search-config handlers", () => {
  beforeEach(() => {
    ({ db, router } = setup());
  });

  describe("search-config.get", () => {
    it("returns defaults when no config exists", async () => {
      const result = (await router.handle(db, "search-config.get", undefined)) as Record<string, unknown>;
      expect(result.provider).toBe("duckduckgo");
      expect(result.hasApiKey).toBe(false);
      expect(result.maskedApiKey).toBe(null);
    });

    it("returns saved config with masked key", async () => {
      await router.handle(db, "search-config.update", {
        provider: "brave",
        apiKey: "BSA-abcdef1234567890",
      });

      const result = (await router.handle(db, "search-config.get", undefined)) as Record<string, unknown>;
      expect(result.provider).toBe("brave");
      expect(result.hasApiKey).toBe(true);
      expect(result.maskedApiKey).toBe("BSA-...7890");
    });
  });

  describe("search-config.update", () => {
    it("creates config on first update", async () => {
      const result = (await router.handle(db, "search-config.update", {
        provider: "brave",
        apiKey: "test-key-123",
      })) as Record<string, unknown>;

      expect(result.ok).toBe(true);

      const config = (await router.handle(db, "search-config.get", undefined)) as Record<string, unknown>;
      expect(config.provider).toBe("brave");
      expect(config.hasApiKey).toBe(true);
    });

    it("updates existing config", async () => {
      await router.handle(db, "search-config.update", {
        provider: "brave",
        apiKey: "key-1",
      });

      await router.handle(db, "search-config.update", {
        provider: "duckduckgo",
      });

      const config = (await router.handle(db, "search-config.get", undefined)) as Record<string, unknown>;
      expect(config.provider).toBe("duckduckgo");
      // apiKey should still be there from first update
      expect(config.hasApiKey).toBe(true);
    });

    it("updates in-memory search config", async () => {
      await router.handle(db, "search-config.update", {
        provider: "brave",
        apiKey: "live-key",
      });

      const memConfig = getSearchConfig();
      expect(memConfig.provider).toBe("brave");
      expect(memConfig.apiKey).toBe("live-key");
    });
  });
});
