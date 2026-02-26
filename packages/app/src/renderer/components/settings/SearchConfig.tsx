import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface SearchConfigData {
  provider: "brave" | "duckduckgo";
  hasApiKey: boolean;
  maskedApiKey: string | null;
}

export function SearchConfig() {
  const [config, setConfig] = useState<SearchConfigData | null>(null);
  const [provider, setProvider] = useState<"brave" | "duckduckgo">("duckduckgo");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    wsClient
      .request<SearchConfigData>("search-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setProvider(cfg.provider);
      })
      .catch(() => {});
  }, []);

  async function handleValidate() {
    if (!apiKey) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await wsClient.request<{ valid: boolean; error?: string }>(
        "search-config.validate",
        { apiKey },
      );
      setValidationResult(result);
    } catch (err) {
      setValidationResult({
        valid: false,
        error: err instanceof Error ? err.message : "Validation failed",
      });
    } finally {
      setValidating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await wsClient.request("search-config.update", {
        provider,
        ...(apiKey ? { apiKey } : {}),
      });
      const cfg = await wsClient.request<SearchConfigData>("search-config.get");
      setConfig(cfg);
      setApiKey("");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;

  const dirty = provider !== config.provider || !!apiKey;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Web Search</h2>
      <div className="space-y-4">
        {/* Provider selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <input
              type="radio"
              name="search-provider"
              checked={provider === "duckduckgo"}
              onChange={() => {
                setProvider("duckduckgo");
                setValidationResult(null);
              }}
              className="accent-indigo-500"
            />
            <div>
              <p className="text-sm font-medium text-white">DuckDuckGo</p>
              <p className="text-xs text-gray-400">
                Free, no API key required (HTML scraping)
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <input
              type="radio"
              name="search-provider"
              checked={provider === "brave"}
              onChange={() => {
                setProvider("brave");
                setValidationResult(null);
              }}
              className="accent-indigo-500"
            />
            <div>
              <p className="text-sm font-medium text-white">Brave Search</p>
              <p className="text-xs text-gray-400">
                Structured API results (requires API key)
              </p>
            </div>
          </label>
        </div>

        {/* API key input — shown when Brave is selected */}
        {provider === "brave" && (
          <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            {/* Current key status */}
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  config.hasApiKey ? "bg-green-400" : "bg-gray-500"
                }`}
              />
              <p className="text-xs text-gray-400">
                {config.hasApiKey
                  ? `API key set (${config.maskedApiKey})`
                  : "No API key configured"}
              </p>
            </div>

            {/* Key input */}
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">
                {config.hasApiKey ? "Update API Key" : "API Key"}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setValidationResult(null);
                  }}
                  placeholder="BSA..."
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  onClick={handleValidate}
                  disabled={!apiKey || validating}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50"
                >
                  {validating ? "Testing..." : "Validate"}
                </button>
              </div>
            </div>

            {/* Validation result */}
            {validationResult && (
              <p
                className={`text-xs ${validationResult.valid ? "text-green-400" : "text-red-400"}`}
              >
                {validationResult.valid
                  ? "API key is valid"
                  : `Invalid: ${validationResult.error}`}
              </p>
            )}
          </div>
        )}

        {/* Save button */}
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving || (provider === "brave" && !config.hasApiKey && !apiKey)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
