import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { mkdirSync } from "node:fs";
import { createCmdTool, isBlacklisted, CMD_BLACKLIST } from "../../src/tools/cmd.js";

const WORKSPACE = "/tmp/wp-test-workspace";

beforeAll(() => {
  mkdirSync(WORKSPACE, { recursive: true });
});

describe("isBlacklisted", () => {
  it("detects blacklisted commands", () => {
    expect(isBlacklisted("rm")).toBe(true);
    expect(isBlacklisted("rmdir")).toBe(true);
    expect(isBlacklisted("kill")).toBe(true);
    expect(isBlacklisted("dd")).toBe(true);
  });

  it("allows safe commands", () => {
    expect(isBlacklisted("ls")).toBe(false);
    expect(isBlacklisted("echo")).toBe(false);
    expect(isBlacklisted("cat")).toBe(false);
    expect(isBlacklisted("node")).toBe(false);
  });
});

describe("cmd tool", () => {
  it("executes a simple command and returns output", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const cmdTool = createCmdTool(WORKSPACE, callbacks);
    const result = await cmdTool.execute!(
      { command: "echo", args: ["hello world"], timeout: 30000 },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ stdout: "hello world\n", stderr: "" });
  });

  it("returns error for failed commands", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const cmdTool = createCmdTool(WORKSPACE, callbacks);
    const result = await cmdTool.execute!(
      { command: "false", args: [], timeout: 30000 },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("") });
  });

  it("prompts for blacklisted commands", async () => {
    const callbacks = { requestPermission: vi.fn().mockResolvedValue("allow") };
    const cmdTool = createCmdTool(WORKSPACE, callbacks);
    await cmdTool.execute!(
      { command: "rm", args: ["-rf", "somedir"], timeout: 30000 },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(callbacks.requestPermission).toHaveBeenCalledWith(
      "cmd:rm",
      expect.stringContaining("rm -rf somedir"),
    );
  });

  it("blocks blacklisted command when denied", async () => {
    const callbacks = { requestPermission: vi.fn().mockResolvedValue("deny") };
    const cmdTool = createCmdTool(WORKSPACE, callbacks);
    const result = await cmdTool.execute!(
      { command: "rm", args: ["file.txt"], timeout: 30000 },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("denied") });
  });

  it("truncates output exceeding limit", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const cmdTool = createCmdTool(WORKSPACE, callbacks);
    const result = await cmdTool.execute!(
      { command: "node", args: ["-e", "process.stdout.write('x'.repeat(60000))"], timeout: 30000 },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const r = result as { stdout: string };
    expect(r.stdout.length).toBeLessThanOrEqual(51200 + 100);
  });
});
