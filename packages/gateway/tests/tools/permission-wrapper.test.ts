import { describe, it, expect, beforeEach, vi } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { wrapToolWithPermission, PermissionManager } from "../../src/tools/permission-wrapper.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return drizzle(sqlite, { schema });
}

const testTool = tool({
  description: "Test tool",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ result: query }),
});

describe("PermissionManager", () => {
  let db: ReturnType<typeof setupDb>;
  let manager: PermissionManager;

  beforeEach(() => {
    db = setupDb();
    manager = new PermissionManager(db);
  });

  it("returns 'prompt' for unknown tools", async () => {
    const decision = await manager.getDecision("search");
    expect(decision).toBe("prompt");
  });

  it("returns stored decision", async () => {
    await manager.setDecision("search", "allow");
    const decision = await manager.getDecision("search");
    expect(decision).toBe("allow");
  });
});

describe("wrapToolWithPermission", () => {
  let db: ReturnType<typeof setupDb>;
  let manager: PermissionManager;

  beforeEach(() => {
    db = setupDb();
    manager = new PermissionManager(db);
  });

  it("executes tool when permission is allow", async () => {
    await manager.setDecision("test", "allow");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission: vi.fn(),
    });
    const result = await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toEqual({ result: "hello" });
  });

  it("returns error when permission is deny", async () => {
    await manager.setDecision("test", "deny");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission: vi.fn(),
    });
    const result = await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("not permitted") });
  });

  it("requests permission and proceeds on allow", async () => {
    const requestPermission = vi.fn().mockResolvedValue("allow");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission,
    });
    const result = await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(requestPermission).toHaveBeenCalledWith("test", '{"query":"hello"}');
    expect(result).toEqual({ result: "hello" });
  });

  it("requests permission and blocks on deny", async () => {
    const requestPermission = vi.fn().mockResolvedValue("deny");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission,
    });
    const result = await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("not permitted") });
  });

  it("persists always-allow decisions", async () => {
    const requestPermission = vi.fn().mockResolvedValue("always-allow");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission,
    });
    await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const decision = await manager.getDecision("test");
    expect(decision).toBe("allow");
  });

  it("passes serialized params as context to requestPermission callback", async () => {
    const requestPermission = vi.fn().mockResolvedValue("allow");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission,
    });
    await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(requestPermission).toHaveBeenCalledWith("test", '{"query":"hello"}');
  });
});
