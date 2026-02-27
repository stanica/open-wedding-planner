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
      <h2 className="text-lg font-semibold mb-4">Scheduled Research</h2>
      <div className="space-y-4">
        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded accent-indigo-500"
          />
          <div>
            <p className="text-sm font-medium text-white">
              Enable scheduled research
            </p>
            <p className="text-xs text-gray-400">
              An AI agent will automatically run on a timer to research vendors
            </p>
          </div>
        </label>

        {/* Prompt */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-400">Research prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Find florists in Tuscany under €3,000. Check for availability on our wedding date."
            rows={4}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-y"
          />
        </div>

        {/* Interval */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-400">Run frequency</label>
          <select
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
          <p className="text-xs text-gray-500">
            Last run: {new Date(config.lastRunAt).toLocaleString()}
          </p>
        )}

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
