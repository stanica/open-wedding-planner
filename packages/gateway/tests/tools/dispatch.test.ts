import { describe, it, expect, vi } from "vitest";
import { makeDispatchTool } from "../../src/tools/dispatch.js";

describe("dispatch tool", () => {
  it("calls orchestrator.dispatch with browser agent config", async () => {
    const mockOrchestrator = {
      dispatch: vi.fn().mockResolvedValue({ taskId: "task-123", sessionKey: "browser-task-123" }),
    };

    const dispatchTool = makeDispatchTool({
      orchestrator: mockOrchestrator as any,
      parentSessionKey: "research-parent-456",
    });

    const result = await dispatchTool.execute(
      {
        url: "https://venue.com",
        instructions: "Find pricing info",
        vendorId: 42,
      },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(mockOrchestrator.dispatch).toHaveBeenCalledWith(
      "browser",
      { url: "https://venue.com", instructions: "Find pricing info", vendorId: 42 },
      { lane: "subagent", vendorId: 42 },
    );
    expect(result).toEqual({ taskId: "browser-task-123" });
  });

  it("works without vendorId", async () => {
    const mockOrchestrator = {
      dispatch: vi.fn().mockResolvedValue({ taskId: "task-789", sessionKey: "browser-task-789" }),
    };

    const dispatchTool = makeDispatchTool({
      orchestrator: mockOrchestrator as any,
      parentSessionKey: "research-parent-456",
    });

    const result = await dispatchTool.execute(
      {
        url: "https://venue.com",
        instructions: "Find pricing info",
      },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result).toEqual({ taskId: "browser-task-789" });
  });
});
