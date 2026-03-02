import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface AIConfig {
  model: string;
  hasApiKey: boolean;
  maskedApiKey: string | null;
  hasOpenaiApiKey: boolean;
  maskedOpenaiApiKey: string | null;
  availableModels: string[];
}

export function AIProviderSetup() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    wsClient
      .request<AIConfig>("ai-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setModel(cfg.model);
        if (cfg.availableModels.length > 0) {
          setModels(cfg.availableModels);
        }
      })
      .catch(() => {});
  }, []);

  async function handleValidate() {
    if (!apiKey) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await wsClient.request<{ valid: boolean; error?: string }>(
        "ai-config.validate",
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
      await wsClient.request<{ ok: boolean }>("ai-config.update", {
        model,
        ...(apiKey ? { apiKey } : {}),
        ...(openaiApiKey ? { openaiApiKey } : {}),
      });

      // Refetch config to get updated state
      const cfg = await wsClient.request<AIConfig>("ai-config.get");
      setConfig(cfg);
      setApiKey("");
      setOpenaiApiKey("");
      if (cfg.availableModels.length > 0) {
        setModels(cfg.availableModels);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;

  const dirty = model !== config.model || !!apiKey || !!openaiApiKey;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">AI Provider</h2>
      <div className="space-y-4">
        {/* API key input */}
        <div className="space-y-3 rounded-lg border border-border bg-surface-elevated px-4 py-3">
          {/* Current key status */}
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                config.hasApiKey ? "bg-success" : "bg-on-surface-faint"
              }`}
            />
            <p className="text-xs text-on-surface-secondary">
              {config.hasApiKey
                ? `Key set (${config.maskedApiKey})`
                : "No API key configured"}
            </p>
          </div>

          {/* Key input */}
          <div className="space-y-2">
            <label className="block text-sm text-on-surface-secondary">
              {config.hasApiKey ? "Update Key" : "API Key or Setup Token"}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setValidationResult(null);
                }}
                placeholder="sk-ant-..."
                className="flex-1 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleValidate}
                disabled={!apiKey || validating}
                className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface-secondary hover:bg-surface-active disabled:opacity-50"
              >
                {validating ? "Testing..." : "Validate"}
              </button>
            </div>
          </div>

          {/* Validation result */}
          {validationResult && (
            <p
              className={`text-xs ${validationResult.valid ? "text-success" : "text-error"}`}
            >
              {validationResult.valid
                ? "Key is valid"
                : `Invalid: ${validationResult.error}`}
            </p>
          )}

          {/* Instructions */}
          {!config.hasApiKey && (
            <div className="border-t border-border-subtle pt-2 mt-2">
              <p className="text-xs text-on-surface-tertiary">
                Use an API key (<code className="rounded bg-surface-active px-1">sk-ant-api03-...</code>)
                or run{" "}
                <code className="rounded bg-surface-active px-1">claude setup-token</code>{" "}
                to generate a token from your Max/Pro subscription.
              </p>
            </div>
          )}
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">Model</label>
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface focus:border-accent focus:outline-none"
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
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-accent focus:outline-none"
            />
          )}
        </div>

        {/* OpenAI API Key — for semantic search embeddings */}
        <div className="space-y-2 rounded-lg border border-border bg-surface-elevated px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-on-surface">
                OpenAI API Key
              </p>
              <p className="text-xs text-on-surface-secondary">
                Required for semantic search across your data
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  config.hasOpenaiApiKey ? "bg-success" : "bg-on-surface-faint"
                }`}
              />
              <p className="text-xs text-on-surface-secondary">
                {config.hasOpenaiApiKey
                  ? `Set (${config.maskedOpenaiApiKey})`
                  : "Not configured"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="sk-..."
              className="flex-1 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-accent focus:outline-none"
            />
          </div>
          {!config.hasOpenaiApiKey && (
            <p className="text-xs text-on-surface-tertiary">
              Uses <code className="rounded bg-surface-active px-1">text-embedding-3-small</code> for vector embeddings.
              Get a key at{" "}
              <code className="rounded bg-surface-active px-1">platform.openai.com/api-keys</code>
            </p>
          )}
        </div>

        {/* Save button */}
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
