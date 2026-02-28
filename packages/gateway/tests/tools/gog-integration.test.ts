import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGogTool, type GogToolContext } from "../../src/tools/gog.js";

const toolOpts = {
  toolCallId: "t1",
  messages: [] as any[],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("gog tool integration", () => {
  const mockExec = vi.fn();
  const mockRequestPermission = vi.fn();

  const ctx: GogToolContext = {
    gogManager: {
      exec: mockExec,
      ensureInstalled: vi.fn().mockResolvedValue("/fake/gog"),
      getBinPath: () => "/fake/gog",
      isInstalled: () => true,
    } as any,
    accountEmail: "test@gmail.com",
    services: "gmail,calendar",
    getAutoSend: () => false,
    permissionCallbacks: { requestPermission: mockRequestPermission },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-approves read commands without asking permission", async () => {
    mockExec.mockResolvedValue({
      stdout: JSON.stringify({ threads: [] }),
      stderr: "",
    });

    const gogTool = makeGogTool(ctx);
    const result = await gogTool.execute!(
      { subcommand: "gmail", args: ["search", "is:unread"] },
      toolOpts,
    ) as { data: unknown };

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(result.data).toEqual({ threads: [] });
    expect(mockExec).toHaveBeenCalledWith([
      "gmail", "search", "is:unread",
      "--json", "--account", "test@gmail.com",
    ]);
  });

  it("requests permission for write commands", async () => {
    mockRequestPermission.mockResolvedValue("allow");
    mockExec.mockResolvedValue({ stdout: "{}", stderr: "" });

    const gogTool = makeGogTool(ctx);
    await gogTool.execute!(
      { subcommand: "gmail", args: ["send", "--to", "vendor@example.com", "--subject", "Hi"] },
      toolOpts,
    );

    expect(mockRequestPermission).toHaveBeenCalledWith(
      "gog:gmail:write",
      expect.stringContaining("send"),
    );
  });

  it("blocks denied write commands", async () => {
    mockRequestPermission.mockResolvedValue("deny");

    const gogTool = makeGogTool(ctx);
    const result = await gogTool.execute!(
      { subcommand: "gmail", args: ["send", "--to", "vendor@example.com"] },
      toolOpts,
    ) as { error: string };

    expect(result.error).toContain("denied");
    expect(mockExec).not.toHaveBeenCalled();
  });

  it("auto-approves writes when autoSend is on", async () => {
    const autoSendCtx = { ...ctx, getAutoSend: () => true };
    mockExec.mockResolvedValue({ stdout: "{}", stderr: "" });

    const gogTool = makeGogTool(autoSendCtx);
    await gogTool.execute!(
      { subcommand: "gmail", args: ["send", "--to", "vendor@example.com"] },
      toolOpts,
    );

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockExec).toHaveBeenCalled();
  });

  it("handles non-JSON output gracefully", async () => {
    mockExec.mockResolvedValue({
      stdout: "Message sent successfully",
      stderr: "",
    });

    const autoSendCtx = { ...ctx, getAutoSend: () => true };
    const gogTool = makeGogTool(autoSendCtx);
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
