import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface VapiConfig {
  vapiApiKey: string;
  vapiPhoneNumberId: string;
  vapiAssistantId: string;
  vapiAutoCall: boolean;
}

export function VapiSettings() {
  const [config, setConfig] = useState<VapiConfig | null>(null);
  const [vapiApiKey, setVapiApiKey] = useState("");
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState("");
  const [vapiAssistantId, setVapiAssistantId] = useState("");
  const [vapiAutoCall, setVapiAutoCall] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wsClient
      .request<VapiConfig>("ai-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setVapiApiKey(cfg.vapiApiKey);
        setVapiPhoneNumberId(cfg.vapiPhoneNumberId);
        setVapiAssistantId(cfg.vapiAssistantId);
        setVapiAutoCall(cfg.vapiAutoCall);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await wsClient.request("ai-config.update", {
        vapiApiKey,
        vapiPhoneNumberId,
        vapiAssistantId,
        vapiAutoCall,
      });
      const cfg = await wsClient.request<VapiConfig>("ai-config.get");
      setConfig(cfg);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;

  const dirty =
    vapiApiKey !== config.vapiApiKey ||
    vapiPhoneNumberId !== config.vapiPhoneNumberId ||
    vapiAssistantId !== config.vapiAssistantId ||
    vapiAutoCall !== config.vapiAutoCall;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">VAPI Voice Calling</h2>
      <div className="space-y-4">
        {/* VAPI API Key */}
        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">
            VAPI API Key
          </label>
          <input
            type="password"
            value={vapiApiKey}
            onChange={(e) => setVapiApiKey(e.target.value)}
            placeholder="vapi-..."
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Phone Number ID */}
        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">
            Phone Number ID
          </label>
          <input
            type="text"
            value={vapiPhoneNumberId}
            onChange={(e) => setVapiPhoneNumberId(e.target.value)}
            placeholder="e.g. abc123-def456-..."
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Assistant ID */}
        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">
            Assistant ID
          </label>
          <input
            type="text"
            value={vapiAssistantId}
            onChange={(e) => setVapiAssistantId(e.target.value)}
            placeholder="e.g. abc123-def456-..."
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Auto-Call Toggle */}
        <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border bg-surface-elevated px-4 py-3">
          <input
            type="checkbox"
            checked={vapiAutoCall}
            onChange={(e) => setVapiAutoCall(e.target.checked)}
            className="accent-indigo-500"
          />
          <div>
            <p className="text-sm font-medium text-on-surface">Auto-Call</p>
            <p className="text-xs text-on-surface-secondary">
              When enabled, the agent will place calls immediately without
              waiting for approval
            </p>
          </div>
        </label>

        {/* Save button */}
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-on-surface hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
