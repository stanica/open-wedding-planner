import type { LanguageModel } from "ai";

export type AIProviderType = "api-key" | "claude-max";

export interface AIProviderConfig {
  provider: AIProviderType;
  model: string;
  proxyUrl: string;
}

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: "api-key",
  model: "claude-sonnet-4-20250514",
  proxyUrl: "http://localhost:3456/v1",
};

let currentConfig: AIProviderConfig = { ...DEFAULT_CONFIG };

export function setAIConfig(config: Partial<AIProviderConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

export function getAIConfig(): AIProviderConfig {
  return { ...currentConfig };
}

/**
 * Returns a Vercel AI SDK LanguageModel based on current configuration.
 *
 * - "api-key" mode: uses @ai-sdk/anthropic with ANTHROPIC_API_KEY env var
 * - "claude-max" mode: uses @ai-sdk/openai pointed at claude-max-api-proxy
 */
export async function getModel(): Promise<LanguageModel> {
  if (currentConfig.provider === "claude-max") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({
      baseURL: currentConfig.proxyUrl,
      apiKey: "claude-max", // proxy doesn't need a real key
    });
    // Use .chat() to force /chat/completions endpoint (default uses /responses which the proxy doesn't support)
    return openai.chat(currentConfig.model);
  }

  // Default: Anthropic API key
  const { anthropic } = await import("@ai-sdk/anthropic");
  return anthropic(currentConfig.model);
}

/**
 * Check if we have a usable AI provider configured.
 */
export function hasAIProvider(isProxyRunning?: boolean): boolean {
  if (currentConfig.provider === "claude-max") {
    return isProxyRunning ?? false;
  }
  return !!process.env.ANTHROPIC_API_KEY;
}
