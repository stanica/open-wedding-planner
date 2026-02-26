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
  availableModels: string[];
}

export function AIProviderSetup() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [provider, setProvider] = useState<"api-key" | "claude-max">(
    "api-key",
  );
  const [saving, setSaving] = useState(false);
  const [startingProxy, setStartingProxy] = useState(false);
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
        if (cfg.availableModels.length > 0) {
          setModels(cfg.availableModels);
        }
      })
      .catch(() => {});
  }, []);

  async function handleProviderChange(newProvider: "api-key" | "claude-max") {
    setProvider(newProvider);
    setProxyError(null);

    if (newProvider === "claude-max") {
      setStartingProxy(true);
      try {
        const result = await wsClient.request<{
          proxyStatus: ProxyStatus;
          proxyError?: string;
        }>("ai-config.ensure-proxy");
        setProxyStatus(result.proxyStatus);
        if (result.proxyError) {
          setProxyError(result.proxyError);
        }
        // Fetch models now that proxy is running
        if (result.proxyStatus.running) {
          const cfg = await wsClient.request<AIConfig>("ai-config.get");
          if (cfg.availableModels.length > 0) {
            setModels(cfg.availableModels);
            if (!model || !cfg.availableModels.includes(model)) {
              setModel(cfg.availableModels[0]);
            }
          }
        }
      } catch (err) {
        setProxyError(err instanceof Error ? err.message : "Failed to connect to gateway");
      } finally {
        setStartingProxy(false);
      }
    } else {
      // Stop proxy when switching away (don't await — fire and forget)
      wsClient.request("ai-config.stop-proxy").catch(() => {});
      setProxyStatus({ running: false, url: null, error: null });
    }
  }

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
      // Refetch config to get updated available models (proxy may have just started)
      const cfg = await wsClient.request<AIConfig>("ai-config.get");
      setConfig(cfg);
      if (cfg.availableModels.length > 0) {
        setModels(cfg.availableModels);
      }
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
              onChange={() => handleProviderChange("api-key")}
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
              onChange={() => handleProviderChange("claude-max")}
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
                    : startingProxy
                      ? "bg-yellow-400 animate-pulse"
                      : proxyError || proxyStatus.error
                        ? "bg-red-400"
                        : "bg-gray-500"
                }`}
              />
              <p className="text-xs text-gray-400">
                {proxyStatus.running
                  ? "Proxy running"
                  : startingProxy
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
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              {model && !models.includes(model) && (
                <option value={model}>{model}</option>
              )}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. claude-sonnet-4-20250514"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          )}
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
