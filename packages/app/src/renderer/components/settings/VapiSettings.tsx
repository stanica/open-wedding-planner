import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface VapiConfig {
  vapiApiKey: string;
  vapiPhoneNumberId: string;
  vapiAssistantId: string;
}

export function VapiSettings() {
  const [config, setConfig] = useState<VapiConfig | null>(null);
  const [vapiApiKey, setVapiApiKey] = useState("");
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState("");
  const [vapiAssistantId, setVapiAssistantId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wsClient
      .request<VapiConfig>("ai-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setVapiApiKey(cfg.vapiApiKey);
        setVapiPhoneNumberId(cfg.vapiPhoneNumberId);
        setVapiAssistantId(cfg.vapiAssistantId);
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
    vapiAssistantId !== config.vapiAssistantId;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">VAPI Voice Calling</h2>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">
            VAPI API Key
          </label>
          <input
            type="password"
            value={vapiApiKey}
            onChange={(e) => setVapiApiKey(e.target.value)}
            placeholder="vapi-..."
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-accent focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">
            Phone Number ID
          </label>
          <input
            type="text"
            value={vapiPhoneNumberId}
            onChange={(e) => setVapiPhoneNumberId(e.target.value)}
            placeholder="e.g. abc123-def456-..."
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-accent focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">
            Assistant ID
          </label>
          <input
            type="text"
            value={vapiAssistantId}
            onChange={(e) => setVapiAssistantId(e.target.value)}
            placeholder="e.g. abc123-def456-..."
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-accent focus:outline-none"
          />
        </div>

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
