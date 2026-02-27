import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { HeartbeatScheduler } from "../../src/infra/heartbeat-scheduler.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

function createMockOrchestrator() {
  return {
    dispatch: vi.fn().mockResolvedValue({ taskId: "t1", sessionKey: "s1" }),
    registerConfig: vi.fn(),
  };
}

describe("HeartbeatScheduler", () => {
  let db: ReturnType<typeof drizzle>;
  let orchestrator: ReturnType<typeof createMockOrchestrator>;
  let broadcast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
    orchestrator = createMockOrchestrator();
    broadcast = vi.fn();
  });

  it("dispatches only health checks when heartbeat is disabled", async () => {
    const scheduler = new HeartbeatScheduler(
      orchestrator as any,
      broadcast,
      db,
    );

    scheduler.start();
    scheduler.stop();
    await new Promise((r) => setTimeout(r, 50));

    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      "heartbeat",
      {},
      { lane: "heartbeat" },
    );

    expect(orchestrator.dispatch).not.toHaveBeenCalledWith(
      "heartbeat-research",
      expect.anything(),
      expect.anything(),
    );
  });

  it("dispatches LLM research when enabled with a prompt", async () => {
    await db.insert(schema.heartbeatConfig).values({
      enabled: 1,
      prompt: "Find florists in Tuscany",
      intervalMinutes: 30,
    });

    const scheduler = new HeartbeatScheduler(
      orchestrator as any,
      broadcast,
      db,
    );

    scheduler.start();
    scheduler.stop();
    await new Promise((r) => setTimeout(r, 50));

    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      "heartbeat",
      {},
      { lane: "heartbeat" },
    );

    expect(orchestrator.registerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "heartbeat-research",
        systemPrompt: "Find florists in Tuscany",
      }),
    );

    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      "heartbeat-research",
      { messages: [{ role: "user", content: "Find florists in Tuscany" }] },
      { lane: "heartbeat" },
    );
  });

  it("does not dispatch LLM research when enabled but no prompt", async () => {
    await db.insert(schema.heartbeatConfig).values({
      enabled: 1,
      prompt: null,
      intervalMinutes: 30,
    });

    const scheduler = new HeartbeatScheduler(
      orchestrator as any,
      broadcast,
      db,
    );

    scheduler.start();
    scheduler.stop();
    await new Promise((r) => setTimeout(r, 50));

    expect(orchestrator.dispatch).toHaveBeenCalledTimes(1);
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      "heartbeat",
      {},
      { lane: "heartbeat" },
    );
  });

  it("updates last_run_at after successful LLM dispatch", async () => {
    await db.insert(schema.heartbeatConfig).values({
      enabled: 1,
      prompt: "Research DJs",
      intervalMinutes: 15,
    });

    const scheduler = new HeartbeatScheduler(
      orchestrator as any,
      broadcast,
      db,
    );

    scheduler.start();
    scheduler.stop();
    await new Promise((r) => setTimeout(r, 50));

    const [config] = await db.select().from(schema.heartbeatConfig).limit(1);
    expect(config?.lastRunAt).toBeTruthy();
  });
});
