import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface HeartbeatConfig {
  enabled: number;
  prompt: string | null;
  intervalMinutes: number;
  lastRunAt: string | null;
}

const INTERVAL_OPTIONS = [
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
];

export function HeartbeatSettings() {
  const [config, setConfig] = useState<HeartbeatConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wsClient
      .request<HeartbeatConfig>("heartbeat-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setEnabled(!!cfg.enabled);
        setPrompt(cfg.prompt ?? "");
        setIntervalMinutes(cfg.intervalMinutes);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await wsClient.request<HeartbeatConfig>(
        "heartbeat-config.update",
        { enabled, prompt: prompt || null, intervalMinutes },
      );
      setConfig(updated);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;

  const dirty =
    enabled !== !!config.enabled ||
    (prompt || null) !== config.prompt ||
    intervalMinutes !== config.intervalMinutes;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Agent Heartbeat</h2>
      <div className="space-y-4">
        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded accent-accent"
          />
          <div>
            <p className="text-sm font-medium text-on-surface">
              Enable autonomous agent
            </p>
            <p className="text-xs text-on-surface-secondary">
              The agent will autonomously research, reach out, and follow up on your behalf
            </p>
          </div>
        </label>

        {/* Prompt */}
        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">Research prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Find florists in Tuscany under €3,000. Check for availability on our wedding date."
            rows={4}
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-accent focus:outline-none resize-y"
          />
        </div>

        {/* Interval */}
        <div className="space-y-2">
          <label className="block text-sm text-on-surface-secondary">Run frequency</label>
          <select
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface focus:border-accent focus:outline-none"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Last run info */}
        {config.lastRunAt && (
          <p className="text-xs text-on-surface-tertiary">
            Last run: {new Date(config.lastRunAt).toLocaleString()}
          </p>
        )}

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
