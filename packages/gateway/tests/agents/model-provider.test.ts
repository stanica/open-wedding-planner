import { describe, it, expect, beforeEach } from "vitest";
import {
  getContextWindowForModel,
  setAIConfig,
  getAIConfig,
} from "../../src/agents/model-provider.js";

describe("getContextWindowForModel", () => {
  it("returns 200k for opus models", () => {
    expect(getContextWindowForModel("claude-opus-4-20250514")).toBe(200_000);
  });

  it("returns 1M for sonnet models", () => {
    expect(getContextWindowForModel("claude-sonnet-4-20250514")).toBe(1_000_000);
  });

  it("returns 128k for unknown models", () => {
    expect(getContextWindowForModel("some-other-model")).toBe(128_000);
  });

  it("returns 200k for haiku models", () => {
    expect(getContextWindowForModel("claude-haiku-4-20250514")).toBe(200_000);
  });
});

describe("AIProviderConfig with provider field", () => {
  beforeEach(() => {
    setAIConfig({ provider: "anthropic", model: "claude-sonnet-4-20250514", apiKey: null, baseUrl: null });
  });

  it("setAIConfig stores provider and baseUrl", () => {
    setAIConfig({ provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3-70b", apiKey: "sk-or-test" });
    const config = getAIConfig();
    expect(config.provider).toBe("openrouter");
    expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.model).toBe("meta-llama/llama-3-70b");
  });

  it("defaults to anthropic provider", () => {
    setAIConfig({ model: "claude-sonnet-4-20250514" });
    const config = getAIConfig();
    expect(config.provider).toBe("anthropic");
  });
});

describe("getContextWindowForModel — expanded model families", () => {
  it("returns 128k for gpt-4o", () => {
    expect(getContextWindowForModel("gpt-4o-2025-01-01")).toBe(128_000);
  });

  it("returns 1M for gemini models", () => {
    expect(getContextWindowForModel("gemini-2.5-pro")).toBe(1_000_000);
  });

  it("returns 128k for unknown models", () => {
    expect(getContextWindowForModel("some-random-model")).toBe(128_000);
  });
});
