import { describe, it, expect } from "vitest";
import { getTaskConfig } from "../../src/agents/task-configs.js";

describe("browser task config", () => {
  it("is registered and has expected tools", () => {
    const config = getTaskConfig("browser");
    expect(config).toBeDefined();
    expect(config!.name).toBe("browser");
    expect(config!.tools).toEqual(
      expect.arrayContaining(["parsePdf", "addVendorImages", "dbQuery", "dbSchema", "createVendor"]),
    );
  });

  it("has a setup function", () => {
    const config = getTaskConfig("browser");
    expect(config!.setup).toBeTypeOf("function");
  });

  it("has maxSteps of 20", () => {
    const config = getTaskConfig("browser");
    expect(config!.maxSteps).toBe(20);
  });

  it("system prompt mentions Playwright actions", () => {
    const config = getTaskConfig("browser");
    expect(config!.systemPrompt).toContain("navigate");
    expect(config!.systemPrompt).toContain("click");
    expect(config!.systemPrompt).toContain("screenshot");
    expect(config!.systemPrompt).toContain("parsePdf");
  });
});
