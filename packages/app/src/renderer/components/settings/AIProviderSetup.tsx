import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface AIConfig {
  provider: "api-key" | "claude-max";
  model: string;
  proxyUrl: string;
  hasApiKey: boolean;
}

const MODELS = [
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-20250514",
];

export function AIProviderSetup() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [proxyUrl, setProxyUrl] = useState("http://localhost:3456/v1");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [provider, setProvider] = useState<"api-key" | "claude-max">("api-key");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wsClient
      .request<AIConfig>("ai-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setProvider(cfg.provider);
        setModel(cfg.model);
        setProxyUrl(cfg.proxyUrl);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await wsClient.request<AIConfig>("ai-config.update", {
        provider,
        model,
        proxyUrl,
      });
      setConfig(updated);
      setCheckResult(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleCheck() {
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await wsClient.request<{ ok: boolean; error?: string }>(
        "ai-config.check",
        { proxyUrl },
      );
      setCheckResult(result);
    } catch (err) {
      setCheckResult({ ok: false, error: String(err) });
    } finally {
      setChecking(false);
    }
  }

  if (!config) return null;

  const dirty =
    provider !== config.provider ||
    model !== config.model ||
    proxyUrl !== config.proxyUrl;

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
                Uses claude-max-api-proxy (no API costs)
              </p>
            </div>
          </label>
        </div>

        {/* Proxy URL (only for claude-max) */}
        {provider === "claude-max" && (
          <div className="space-y-2">
            <label className="block text-sm text-gray-400">Proxy URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                placeholder="http://localhost:3456/v1"
              />
              <button
                onClick={handleCheck}
                disabled={checking}
                className="rounded-md bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
              >
                {checking ? "Checking..." : "Test"}
              </button>
            </div>
            {checkResult && (
              <p
                className={`text-xs ${checkResult.ok ? "text-green-400" : "text-red-400"}`}
              >
                {checkResult.ok
                  ? "Proxy is reachable"
                  : `Connection failed: ${checkResult.error ?? "unknown error"}`}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Run{" "}
              <code className="rounded bg-white/10 px-1">
                npx claude-max-api-proxy
              </code>{" "}
              to start the proxy
            </p>
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
