import { describe, it, expect, vi } from "vitest";
import type { TaskConfig } from "../../src/agents/base-agent.js";

describe("TaskConfig setup/teardown", () => {
  it("accepts optional setup function in TaskConfig", () => {
    const config: TaskConfig = {
      name: "test",
      systemPrompt: "test",
      tools: [],
      setup: async () => ({
        extraTools: {},
        cleanup: async () => {},
      }),
    };
    expect(config.setup).toBeDefined();
  });

  it("TaskConfig works without setup (backward compat)", () => {
    const config: TaskConfig = {
      name: "test",
      systemPrompt: "test",
      tools: [],
    };
    expect(config.setup).toBeUndefined();
  });
});
