import { describe, it, expect, beforeEach } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";

const fakeTool = tool({
  description: "A test tool",
  inputSchema: z.object({ input: z.string() }),
  execute: async ({ input }) => ({ result: input }),
});

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers and retrieves a tool", () => {
    registry.register({
      name: "test",
      description: "A test tool",
      category: "utility",
      tool: fakeTool,
    });
    const reg = registry.get("test");
    expect(reg).toBeDefined();
    expect(reg!.name).toBe("test");
    expect(reg!.category).toBe("utility");
  });

  it("returns undefined for unknown tool", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("lists all registered tools", () => {
    registry.register({ name: "a", description: "A", category: "web", tool: fakeTool });
    registry.register({ name: "b", description: "B", category: "database", tool: fakeTool });
    expect(registry.listAll()).toHaveLength(2);
  });

  it("gets tools by category", () => {
    registry.register({ name: "a", description: "A", category: "web", tool: fakeTool });
    registry.register({ name: "b", description: "B", category: "web", tool: fakeTool });
    registry.register({ name: "c", description: "C", category: "database", tool: fakeTool });
    expect(registry.getByCategory("web")).toHaveLength(2);
    expect(registry.getByCategory("database")).toHaveLength(1);
  });

  it("returns a tool set by names", () => {
    registry.register({ name: "a", description: "A", category: "web", tool: fakeTool });
    registry.register({ name: "b", description: "B", category: "web", tool: fakeTool });
    registry.register({ name: "c", description: "C", category: "database", tool: fakeTool });
    const set = registry.getToolSet(["a", "c"]);
    expect(Object.keys(set)).toEqual(["a", "c"]);
  });

  it("throws when requesting unknown tool in set", () => {
    expect(() => registry.getToolSet(["unknown"])).toThrow("Unknown tool: unknown");
  });

  it("supports factory tools with context", () => {
    registry.registerFactory("dynamic", {
      description: "Dynamic tool",
      category: "database",
      create: (ctx: unknown) =>
        tool({
          description: "Dynamic",
          inputSchema: z.object({}),
          execute: async () => ctx,
        }),
    });
    const factories = registry.listAll();
    expect(factories).toHaveLength(1);
    expect(factories[0].name).toBe("dynamic");
  });
});
