import type { LanguageModel } from "ai";

export type AIProviderType = "api-key" | "claude-max";

export interface AIProviderConfig {
  provider: AIProviderType;
  model: string;
  proxyUrl: string;
  apiKey?: string | null;
}

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: "api-key",
  model: "claude-sonnet-4-20250514",
  proxyUrl: "http://localhost:3456/v1",
};

let currentConfig: AIProviderConfig = { ...DEFAULT_CONFIG };

export function setAIConfig(config: Partial<AIProviderConfig>): void {
  if (config.apiKey) config.apiKey = config.apiKey.trim().replace(/\s+/g, "");
  currentConfig = { ...currentConfig, ...config };
}

export function getAIConfig(): AIProviderConfig {
  return { ...currentConfig };
}

const CONTEXT_WINDOWS: Record<string, number> = {
  opus: 200_000,
  sonnet: 1_000_000,
  haiku: 200_000,
};

export function getContextWindowForModel(modelName: string): number {
  const lower = modelName.toLowerCase();
  for (const [key, tokens] of Object.entries(CONTEXT_WINDOWS)) {
    if (lower.includes(key)) return tokens;
  }
  return 200_000;
}

export async function getSummarizationModel(): Promise<LanguageModel> {
  if (currentConfig.provider === "claude-max") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({
      baseURL: currentConfig.proxyUrl,
      apiKey: "claude-max",
    });
    return openai.chat("claude-sonnet-4-20250514");
  }

  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
  return anthropic("claude-sonnet-4-20250514");
}

/** OAuth setup tokens (from `claude setup-token`) need Bearer auth + beta header */
function isOAuthToken(key: string): boolean {
  return key.startsWith("sk-ant-oat");
}

function anthropicOptions(key: string): { apiKey?: string; authToken?: string; headers?: Record<string, string> } {
  if (isOAuthToken(key)) {
    return { authToken: key, headers: { "anthropic-beta": "oauth-2025-04-20" } };
  }
  return { apiKey: key };
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

  // Default: Anthropic API key (stored key takes precedence over env var)
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
  return anthropic(currentConfig.model);
}

/**
 * Returns Anthropic's built-in server-side tools (web_search, web_fetch) when
 * using the direct API. Returns null for claude-max proxy mode (not supported).
 */
export async function getBuiltInTools(
  emit: (action: string, detail?: string) => void,
): Promise<Record<string, unknown> | null> {
  if (currentConfig.provider !== "api-key") return null;

  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
  return {
    webSearch: anthropic.tools.webSearch_20250305({
      onInputAvailable: async ({ input }: { input: { query: string } }) => {
        emit("tool-call", `webSearch: ${JSON.stringify(input).slice(0, 100)}`);
      },
    }),
    webFetch: anthropic.tools.webFetch_20250910({
      onInputAvailable: async ({ input }: { input: { url: string } }) => {
        emit("tool-call", `webFetch: ${JSON.stringify(input).slice(0, 100)}`);
      },
    }),
  };
}

/**
 * Check if we have a usable AI provider configured.
 */
export function hasAIProvider(isProxyRunning?: boolean): boolean {
  if (currentConfig.provider === "claude-max") {
    return isProxyRunning ?? false;
  }
  return !!(currentConfig.apiKey || process.env.ANTHROPIC_API_KEY);
}
