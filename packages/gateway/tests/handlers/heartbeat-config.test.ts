import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerHeartbeatConfigHandlers } from "../../src/handlers/heartbeat-config.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe("heartbeat-config handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
    router = new Router();
    registerHeartbeatConfigHandlers(router);
  });

  it("returns defaults when no config exists", async () => {
    const result = await router.handle(db, "heartbeat-config.get", {});
    expect(result).toEqual({
      enabled: 0,
      prompt: null,
      intervalMinutes: 30,
      lastRunAt: null,
    });
  });

  it("creates config on first update", async () => {
    await router.handle(db, "heartbeat-config.update", {
      enabled: true,
      prompt: "Find caterers",
      intervalMinutes: 60,
    });

    const result = await router.handle(db, "heartbeat-config.get", {});
    expect(result).toMatchObject({
      enabled: 1,
      prompt: "Find caterers",
      intervalMinutes: 60,
    });
  });

  it("updates existing config", async () => {
    await router.handle(db, "heartbeat-config.update", {
      enabled: true,
      prompt: "Find florists",
    });

    await router.handle(db, "heartbeat-config.update", {
      prompt: "Find DJs instead",
    });

    const result = await router.handle(db, "heartbeat-config.get", {});
    expect(result).toMatchObject({
      enabled: 1,
      prompt: "Find DJs instead",
    });
  });

  it("can disable the heartbeat", async () => {
    await router.handle(db, "heartbeat-config.update", {
      enabled: true,
      prompt: "Research",
    });

    await router.handle(db, "heartbeat-config.update", {
      enabled: false,
    });

    const result = await router.handle(db, "heartbeat-config.get", {});
    expect(result).toMatchObject({ enabled: 0 });
  });
});
