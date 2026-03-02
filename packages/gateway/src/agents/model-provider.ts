import type { LanguageModel } from "ai";

export interface AIProviderConfig {
  model: string;
  apiKey?: string | null;
}

const DEFAULT_CONFIG: AIProviderConfig = {
  model: "claude-sonnet-4-20250514",
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

export async function getSubagentModel(): Promise<LanguageModel> {
  const modelId = "claude-haiku-4-5-20251001";
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
  return anthropic(modelId);
}

export async function getSummarizationModel(): Promise<LanguageModel> {
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
  return anthropic("claude-sonnet-4-20250514");
}

/**
 * Returns a Vercel AI SDK LanguageModel using @ai-sdk/anthropic.
 */
export async function getModel(): Promise<LanguageModel> {
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
  return anthropic(currentConfig.model);
}

/**
 * Returns Anthropic's built-in server-side tools (web_search, web_fetch).
 */
export async function getBuiltInTools(
  emit: (action: string, detail?: string) => void,
): Promise<Record<string, unknown>> {
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
export function hasAIProvider(): boolean {
  return !!(currentConfig.apiKey || process.env.ANTHROPIC_API_KEY);
}
