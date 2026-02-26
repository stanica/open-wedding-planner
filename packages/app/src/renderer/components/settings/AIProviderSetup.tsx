import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface ProxyStatus {
  running: boolean;
  url: string | null;
  error: string | null;
}

interface AIConfig {
  provider: "api-key" | "claude-max";
  model: string;
  proxyUrl: string;
  hasApiKey: boolean;
  proxyStatus: ProxyStatus;
}

const MODELS = [
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-20250514",
];

export function AIProviderSetup() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [provider, setProvider] = useState<"api-key" | "claude-max">(
    "api-key",
  );
  const [saving, setSaving] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>({
    running: false,
    url: null,
    error: null,
  });
  const [proxyError, setProxyError] = useState<string | null>(null);

  useEffect(() => {
    wsClient
      .request<AIConfig>("ai-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setProvider(cfg.provider);
        setModel(cfg.model);
        setProxyStatus(cfg.proxyStatus);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setProxyError(null);
    try {
      const result = await wsClient.request<{
        ok: boolean;
        proxyStatus: ProxyStatus;
        proxyError?: string;
      }>("ai-config.update", { provider, model });

      setProxyStatus(result.proxyStatus);
      if (result.proxyError) {
        setProxyError(result.proxyError);
      }
      setConfig((prev) =>
        prev
          ? { ...prev, provider, model, proxyStatus: result.proxyStatus }
          : prev,
      );
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;

  const dirty = provider !== config.provider || model !== config.model;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">AI Provider</h2>
      <div className="space-y-4">
        {/* Provider selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <input
              type="radio"
              name="ai-provider"
              checked={provider === "api-key"}
              onChange={() => setProvider("api-key")}
              className="accent-indigo-500"
            />
            <div>
              <p className="text-sm font-medium text-white">
                Anthropic API Key
              </p>
              <p className="text-xs text-gray-400">
                Uses ANTHROPIC_API_KEY environment variable
              </p>
              {provider === "api-key" && (
                <p
                  className={`text-xs mt-1 ${config.hasApiKey ? "text-green-400" : "text-yellow-400"}`}
                >
                  {config.hasApiKey
                    ? "API key detected"
                    : "No API key found — set ANTHROPIC_API_KEY"}
                </p>
              )}
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <input
              type="radio"
              name="ai-provider"
              checked={provider === "claude-max"}
              onChange={() => setProvider("claude-max")}
              className="accent-indigo-500"
            />
            <div>
              <p className="text-sm font-medium text-white">
                Claude Max Subscription
              </p>
              <p className="text-xs text-gray-400">
                Uses your Claude subscription (no API costs)
              </p>
            </div>
          </label>
        </div>

        {/* Claude Max status and instructions */}
        {provider === "claude-max" && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            {/* Proxy status */}
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  proxyStatus.running
                    ? "bg-green-400"
                    : proxyError || proxyStatus.error
                      ? "bg-red-400"
                      : "bg-gray-500"
                }`}
              />
              <p className="text-xs text-gray-400">
                {proxyStatus.running
                  ? "Proxy running"
                  : saving
                    ? "Starting proxy..."
                    : "Proxy not running"}
              </p>
            </div>

            {/* Error message */}
            {(proxyError || proxyStatus.error) && (
              <p className="text-xs text-red-400">
                {proxyError ?? proxyStatus.error}
              </p>
            )}

            {/* Prerequisites */}
            <div className="border-t border-white/5 pt-2 mt-2">
              <p className="text-xs font-medium text-gray-300 mb-1">
                Requires Claude Code CLI
              </p>
              <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                <li>
                  Install:{" "}
                  <code className="rounded bg-white/10 px-1">
                    npm install -g @anthropic-ai/claude-code
                  </code>
                </li>
                <li>
                  Authenticate:{" "}
                  <code className="rounded bg-white/10 px-1">
                    claude auth login
                  </code>
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Model selector */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-400">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Save button */}
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
