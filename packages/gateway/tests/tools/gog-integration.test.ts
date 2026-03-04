import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGogTool, type GogToolContext } from "../../src/tools/gog.js";

const toolOpts = {
  toolCallId: "t1",
  messages: [] as any[],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("gog tool integration", () => {
  const mockExec = vi.fn();

  const ctx: GogToolContext = {
    gogManager: {
      exec: mockExec,
      ensureInstalled: vi.fn().mockResolvedValue("/fake/gog"),
      getBinPath: () => "/fake/gog",
      isInstalled: () => true,
    } as any,
    accountEmail: "test@gmail.com",
    services: "gmail,calendar",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes read commands", async () => {
    mockExec.mockResolvedValue({
      stdout: JSON.stringify({ threads: [] }),
      stderr: "",
    });

    const gogTool = makeGogTool(ctx);
    const result = await gogTool.execute!(
      { subcommand: "gmail", args: ["search", "is:unread"] },
      toolOpts,
    ) as { data: unknown };

    expect(result.data).toEqual({ threads: [] });
    expect(mockExec).toHaveBeenCalledWith([
      "gmail", "search", "is:unread",
      "--json", "--account", "test@gmail.com",
    ]);
  });

  it("executes write commands", async () => {
    mockExec.mockResolvedValue({ stdout: "{}", stderr: "" });

    const gogTool = makeGogTool(ctx);
    await gogTool.execute!(
      { subcommand: "gmail", args: ["send", "--to", "vendor@example.com", "--subject", "Hi"] },
      toolOpts,
    );

    expect(mockExec).toHaveBeenCalledWith([
      "gmail", "send", "--to", "vendor@example.com", "--subject", "Hi",
      "--json", "--account", "test@gmail.com",
    ]);
  });

  it("handles non-JSON output gracefully", async () => {
    mockExec.mockResolvedValue({
      stdout: "Message sent successfully",
      stderr: "",
    });

    const gogTool = makeGogTool(ctx);
    const result = await gogTool.execute!(
      { subcommand: "gmail", args: ["send", "--to", "a@b.com"] },
      toolOpts,
    ) as { output: string };

    expect(result.output).toBe("Message sent successfully");
  });

  it("handles exec errors gracefully", async () => {
    mockExec.mockRejectedValue(new Error("gog not found"));

    const gogTool = makeGogTool(ctx);
    const result = await gogTool.execute!(
      { subcommand: "gmail", args: ["search", "test"] },
      toolOpts,
    ) as { error: string };

    expect(result.error).toContain("gog not found");
  });

  it("includes correct account and json flags", async () => {
    mockExec.mockResolvedValue({ stdout: "[]", stderr: "" });

    const gogTool = makeGogTool(ctx);
    await gogTool.execute!(
      { subcommand: "cal", args: ["events", "list"] },
      toolOpts,
    );

    expect(mockExec).toHaveBeenCalledWith([
      "cal", "events", "list",
      "--json", "--account", "test@gmail.com",
    ]);
  });

  it("includes connected services in tool description", () => {
    const gogTool = makeGogTool(ctx);
    const desc = gogTool.description;
    expect(desc).toContain("gmail, calendar");
    expect(desc).toContain("test@gmail.com");
  });
});
