import { describe, it, expect } from "vitest";
import { getContextWindowForModel } from "../../src/agents/model-provider.js";

describe("getContextWindowForModel", () => {
  it("returns 200k for opus models", () => {
    expect(getContextWindowForModel("claude-opus-4-20250514")).toBe(200_000);
  });

  it("returns 1M for sonnet models", () => {
    expect(getContextWindowForModel("claude-sonnet-4-20250514")).toBe(1_000_000);
  });

  it("returns 200k for unknown models", () => {
    expect(getContextWindowForModel("some-other-model")).toBe(200_000);
  });

  it("returns 200k for haiku models", () => {
    expect(getContextWindowForModel("claude-haiku-4-20250514")).toBe(200_000);
  });
});
