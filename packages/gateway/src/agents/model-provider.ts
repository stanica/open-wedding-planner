import type { LanguageModel } from "ai";

export type ProviderType = "anthropic" | "openai" | "google" | "openrouter" | "ollama" | "custom";

export interface AIProviderConfig {
  provider: ProviderType;
  model: string;
  apiKey?: string | null;
  baseUrl?: string | null;
}

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
};

let currentConfig: AIProviderConfig = { ...DEFAULT_CONFIG };

export function setAIConfig(config: Partial<AIProviderConfig>): void {
  if (config.apiKey) config.apiKey = config.apiKey.trim().replace(/\s+/g, "");
  currentConfig = { ...currentConfig, ...config };
  if (!currentConfig.provider) currentConfig.provider = "anthropic";
}

export function getAIConfig(): AIProviderConfig {
  return { ...currentConfig };
}

const CONTEXT_WINDOWS: Record<string, number> = {
  opus: 200_000,
  sonnet: 1_000_000,
  haiku: 200_000,
  "gpt-4o": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4.1": 1_000_000,
  "o1": 200_000,
  "o3": 200_000,
  "o4-mini": 200_000,
  gemini: 1_000_000,
};

export function getContextWindowForModel(modelName: string): number {
  const lower = modelName.toLowerCase();
  for (const [key, tokens] of Object.entries(CONTEXT_WINDOWS)) {
    if (lower.includes(key)) return tokens;
  }
  return 128_000;
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

/** Default base URLs per provider (when no custom baseUrl is configured) */
const DEFAULT_BASE_URLS: Partial<Record<ProviderType, string>> = {
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};

async function createProviderModel(config: AIProviderConfig): Promise<LanguageModel> {
  switch (config.provider) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const key = config.apiKey || process.env.ANTHROPIC_API_KEY;
      const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
      return anthropic(config.model);
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({ apiKey: config.apiKey! });
      return openai(config.model);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey! });
      return google(config.model);
    }
    case "openrouter":
    case "ollama":
    case "custom": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const baseURL = config.baseUrl || DEFAULT_BASE_URLS[config.provider];
      const openai = createOpenAI({
        apiKey: config.apiKey || "ollama",
        baseURL,
      });
      return openai(config.model);
    }
  }
}

export async function getSubagentModel(): Promise<LanguageModel> {
  if (currentConfig.provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
    const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
    return anthropic("claude-haiku-4-5-20251001");
  }
  return createProviderModel(currentConfig);
}

export async function getSummarizationModel(): Promise<LanguageModel> {
  if (currentConfig.provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
    const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
    return anthropic("claude-sonnet-4-20250514");
  }
  return createProviderModel(currentConfig);
}

export async function getModel(): Promise<LanguageModel> {
  return createProviderModel(currentConfig);
}

/**
 * Returns Anthropic's built-in server-side tools (web_search, web_fetch).
 * Returns null for non-Anthropic providers.
 */
export async function getBuiltInTools(
  emit: (action: string, detail?: string) => void,
): Promise<Record<string, unknown> | null> {
  if (currentConfig.provider !== "anthropic") return null;

  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const anthropic = createAnthropic(anthropicOptions(key));
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

export function hasAIProvider(): boolean {
  if (currentConfig.provider === "anthropic") {
    return !!(currentConfig.apiKey || process.env.ANTHROPIC_API_KEY);
  }
  if (currentConfig.provider === "ollama") {
    return true;
  }
  return !!currentConfig.apiKey;
}
