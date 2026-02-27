import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { makeAwaitTasksTool } from "../../src/tools/await-tasks.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe("awaitTasks tool", () => {
  let db: ReturnType<typeof setupDb>["db"];

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
  });

  it("returns results for completed tasks", async () => {
    await db.insert(schema.agentTasks).values({
      type: "browser",
      status: "completed",
      sessionId: "browser-task-1",
      input: JSON.stringify({ url: "https://venue.com" }),
      output: JSON.stringify({ summary: "Found pricing: €5000" }),
    });

    const awaitTool = makeAwaitTasksTool({ db });
    const result = await awaitTool.execute(
      { taskIds: ["browser-task-1"] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("completed");
    expect(result.results[0].summary).toBe("Found pricing: €5000");
    expect(result.results[0].taskId).toBe("browser-task-1");
  });

  it("returns error info for failed tasks", async () => {
    await db.insert(schema.agentTasks).values({
      type: "browser",
      status: "failed",
      sessionId: "browser-task-2",
      output: JSON.stringify({ error: "Timeout" }),
    });

    const awaitTool = makeAwaitTasksTool({ db });
    const result = await awaitTool.execute(
      { taskIds: ["browser-task-2"] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.results[0].status).toBe("failed");
    expect(result.results[0].error).toBe("Timeout");
  });
});
