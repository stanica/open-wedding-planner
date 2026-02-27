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

describe("browser subagent integration", () => {
  let db: ReturnType<typeof setupDb>["db"];

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
  });

  it("dispatch creates a task and awaitTasks retrieves its result", async () => {
    // Simulate what the orchestrator would do: create and complete a browser task
    await db.insert(schema.agentTasks).values({
      type: "browser",
      status: "completed",
      sessionId: "browser-test-1",
      input: JSON.stringify({ url: "https://venue.com", instructions: "Find pricing" }),
      output: JSON.stringify({ summary: "Found pricing: €5000 for 100 guests. Saved 3 gallery images." }),
    });

    const awaitTool = makeAwaitTasksTool({ db });
    const result = await awaitTool.execute(
      { taskIds: ["browser-test-1"] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("completed");
    expect(result.results[0].summary).toContain("€5000");
    expect(result.results[0].taskId).toBe("browser-test-1");
  });

  it("awaitTasks handles multiple tasks with mixed statuses", async () => {
    await db.insert(schema.agentTasks).values([
      {
        type: "browser",
        status: "completed",
        sessionId: "browser-multi-1",
        input: JSON.stringify({ url: "https://venue1.com" }),
        output: JSON.stringify({ summary: "Venue 1: €3000" }),
      },
      {
        type: "browser",
        status: "failed",
        sessionId: "browser-multi-2",
        input: JSON.stringify({ url: "https://venue2.com" }),
        output: JSON.stringify({ error: "Navigation timeout" }),
      },
      {
        type: "browser",
        status: "completed",
        sessionId: "browser-multi-3",
        input: JSON.stringify({ url: "https://venue3.com" }),
        output: JSON.stringify({ summary: "Venue 3: €8000, 5 images saved" }),
      },
    ]);

    const awaitTool = makeAwaitTasksTool({ db });
    const result = await awaitTool.execute(
      { taskIds: ["browser-multi-1", "browser-multi-2", "browser-multi-3"] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.results).toHaveLength(3);

    const completed = result.results.filter((r) => r.status === "completed");
    const failed = result.results.filter((r) => r.status === "failed");

    expect(completed).toHaveLength(2);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe("Navigation timeout");
  });
});
