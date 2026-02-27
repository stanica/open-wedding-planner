import { describe, it, expect, beforeEach, vi } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { PermissionManager } from "../../src/tools/permission-wrapper.js";
import type { AgentContext } from "../../src/agents/base-agent.js";
import type { ToolFactoryContext } from "../../src/agents/runner.js";

vi.mock("../../src/agents/model-provider.js", () => ({
  getModel: vi.fn().mockResolvedValue({
    specificationVersion: "v2",
    provider: "test",
    modelId: "test-model",
    supportedUrls: {},
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Test response" }],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
      warnings: [],
    }),
  }),
  getBuiltInTools: vi.fn().mockResolvedValue(null),
}));

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

const echoTool = tool({
  description: "Echoes back the input",
  inputSchema: z.object({ message: z.string() }),
  execute: async ({ message }) => ({ echo: message }),
});

describe("AgentRunner", () => {
  let db: ReturnType<typeof setupDb>["db"];
  let sqlite: Database.Database;
  let registry: ToolRegistry;
  let permissionManager: PermissionManager;

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
    sqlite = setup.sqlite as unknown as Database.Database;
    registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "Echoes back",
      category: "test",
      tool: echoTool,
    });
    permissionManager = new PermissionManager(db);
  });

  it("returns an AgentResult with a summary", async () => {
    // Import after mock is set up
    const { AgentRunner } = await import("../../src/agents/runner.js");

    const emitSpy = vi.fn();
    const ctx: AgentContext = {
      db,
      sessionKey: "test-session",
      emit: emitSpy,
      signal: new AbortController().signal,
      toolRegistry: registry,
      permissionManager,
      permissionCallbacks: {
        requestPermission: vi.fn().mockResolvedValue("allow"),
      },
    };

    const toolCtx: ToolFactoryContext = {
      db,
      emit: emitSpy,
      sqlite,
      workspaceDir: "/tmp/test",
      permissionCallbacks: {
        requestPermission: vi.fn().mockResolvedValue("allow"),
      },
    };

    const runner = new AgentRunner();
    const result = await runner.run(
      {
        name: "test-agent",
        systemPrompt: "You are a test agent.",
        tools: [],
        maxSteps: 3,
      },
      ctx,
      [{ role: "user", content: "Hello" }],
      toolCtx,
    );

    expect(result).toBeDefined();
    expect(typeof result.summary).toBe("string");
    expect(result.summary).toBe("Test response");
    expect(emitSpy).toHaveBeenCalledWith("starting", "Running test-agent...");
    expect(emitSpy).toHaveBeenCalledWith("complete", "test-agent finished");
  });

  it("builds tools from the registry when config includes tool names", async () => {
    const { AgentRunner } = await import("../../src/agents/runner.js");

    // Pre-allow the echo tool so the permission wrapper doesn't prompt
    await permissionManager.setDecision("echo", "allow");

    const emitSpy = vi.fn();
    const ctx: AgentContext = {
      db,
      sessionKey: "test-session",
      emit: emitSpy,
      signal: new AbortController().signal,
      toolRegistry: registry,
      permissionManager,
      permissionCallbacks: {
        requestPermission: vi.fn().mockResolvedValue("allow"),
      },
    };

    const toolCtx: ToolFactoryContext = {
      db,
      emit: emitSpy,
      sqlite,
      workspaceDir: "/tmp/test",
      permissionCallbacks: {
        requestPermission: vi.fn().mockResolvedValue("allow"),
      },
    };

    const runner = new AgentRunner();
    const result = await runner.run(
      {
        name: "tool-agent",
        systemPrompt: "You are a tool agent.",
        tools: ["echo"],
        maxSteps: 5,
      },
      ctx,
      [{ role: "user", content: "Echo something" }],
      toolCtx,
    );

    expect(result).toBeDefined();
    expect(typeof result.summary).toBe("string");
    expect(result.data).toHaveProperty("toolCalls");
  });

  it("uses fallback summary when model returns no text", async () => {
    const { getModel } = await import("../../src/agents/model-provider.js");
    (getModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      specificationVersion: "v2",
      provider: "test",
      modelId: "test-model",
      supportedUrls: {},
      doGenerate: vi.fn().mockResolvedValue({
        content: [],
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 0 },
        warnings: [],
      }),
    });

    const { AgentRunner } = await import("../../src/agents/runner.js");

    const ctx: AgentContext = {
      db,
      sessionKey: "test-session",
      emit: vi.fn(),
      signal: new AbortController().signal,
      toolRegistry: registry,
      permissionManager,
      permissionCallbacks: {
        requestPermission: vi.fn().mockResolvedValue("allow"),
      },
    };

    const toolCtx: ToolFactoryContext = {
      db,
      emit: vi.fn(),
      sqlite,
      workspaceDir: "/tmp/test",
      permissionCallbacks: {
        requestPermission: vi.fn().mockResolvedValue("allow"),
      },
    };

    const runner = new AgentRunner();
    const result = await runner.run(
      {
        name: "empty-agent",
        systemPrompt: "You are an agent.",
        tools: [],
      },
      ctx,
      [{ role: "user", content: "Hello" }],
      toolCtx,
    );

    expect(result.summary).toBe("empty-agent completed");
  });
});
