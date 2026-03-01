import { useState } from "react";
import { X } from "lucide-react";

interface DetectorConfig {
  enabled: boolean;
  [key: string]: unknown;
}

interface GuardrailsConfig {
  enabled: boolean;
  historySize: number;
  repeat: { enabled: boolean; warnThreshold: number; criticalThreshold: number };
  polling: { enabled: boolean; pollTools: string[]; warnThreshold: number; criticalThreshold: number };
  pingPong: { enabled: boolean; minCycles: number; stableOutcomeCycles: number };
  circuitBreaker: { enabled: boolean; maxStaleWindow: number };
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs text-on-surface-secondary">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm text-on-surface focus:border-accent focus:outline-none"
      />
      {hint && <p className="text-xs text-on-surface-faint">{hint}</p>}
    </div>
  );
}

function DetectorToggle({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded accent-accent"
      />
      <span className="text-sm font-medium text-on-surface">{label}</span>
    </label>
  );
}

function DetectorSection({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-subtle p-4 space-y-3">
      <DetectorToggle label={title} enabled={enabled} onChange={onToggle} />
      <p className="text-xs text-on-surface-tertiary">{description}</p>
      {enabled && <div className="grid grid-cols-2 gap-3">{children}</div>}
    </div>
  );
}

export function GuardrailsModal({
  config,
  onSave,
  onClose,
}: {
  config: GuardrailsConfig;
  onSave: (config: GuardrailsConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GuardrailsConfig>(structuredClone(config));
  const [saving, setSaving] = useState(false);

  function update<K extends keyof GuardrailsConfig>(key: K, value: GuardrailsConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateDetector<K extends keyof GuardrailsConfig>(
    key: K,
    field: string,
    value: unknown,
  ) {
    setDraft((prev) => ({
      ...prev,
      [key]: { ...(prev[key] as DetectorConfig), [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] rounded-xl border border-border bg-surface-dropdown shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-0">
          <h3 className="text-lg font-semibold text-on-surface">Guardrails Configuration</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-surface-active transition-colors"
          >
            <X className="h-4 w-4 text-on-surface-secondary" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <NumberField
            label="History size"
            value={draft.historySize}
            onChange={(v) => update("historySize", v)}
            min={5}
            hint="Number of tool calls remembered per session"
          />

          <DetectorSection
            title="Repeat Detector"
            description="Flags when the same tool is called with identical arguments too many times."
            enabled={draft.repeat.enabled}
            onToggle={(v) => updateDetector("repeat", "enabled", v)}
          >
            <NumberField
              label="Warn threshold"
              value={draft.repeat.warnThreshold}
              onChange={(v) => updateDetector("repeat", "warnThreshold", v)}
              min={1}
            />
            <NumberField
              label="Critical threshold"
              value={draft.repeat.criticalThreshold}
              onChange={(v) => updateDetector("repeat", "criticalThreshold", v)}
              min={0}
              hint="0 = never block"
            />
          </DetectorSection>

          <DetectorSection
            title="Polling Detector"
            description="Detects poll-like tools producing identical results repeatedly — no progress."
            enabled={draft.polling.enabled}
            onToggle={(v) => updateDetector("polling", "enabled", v)}
          >
            <div className="col-span-2 space-y-1">
              <label className="block text-xs text-on-surface-secondary">Poll tools</label>
              <input
                type="text"
                value={draft.polling.pollTools.join(", ")}
                onChange={(e) =>
                  updateDetector(
                    "polling",
                    "pollTools",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  )
                }
                className="w-full rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm text-on-surface focus:border-accent focus:outline-none"
                placeholder="dbQuery, dbSchema"
              />
              <p className="text-xs text-on-surface-faint">Comma-separated tool names</p>
            </div>
            <NumberField
              label="Warn threshold"
              value={draft.polling.warnThreshold}
              onChange={(v) => updateDetector("polling", "warnThreshold", v)}
              min={2}
            />
            <NumberField
              label="Critical threshold"
              value={draft.polling.criticalThreshold}
              onChange={(v) => updateDetector("polling", "criticalThreshold", v)}
              min={2}
            />
          </DetectorSection>

          <DetectorSection
            title="Ping-Pong Detector"
            description="Detects alternating A/B/A/B patterns with stable outcomes."
            enabled={draft.pingPong.enabled}
            onToggle={(v) => updateDetector("pingPong", "enabled", v)}
          >
            <NumberField
              label="Min cycles to warn"
              value={draft.pingPong.minCycles}
              onChange={(v) => updateDetector("pingPong", "minCycles", v)}
              min={2}
            />
            <NumberField
              label="Stable cycles to block"
              value={draft.pingPong.stableOutcomeCycles}
              onChange={(v) => updateDetector("pingPong", "stableOutcomeCycles", v)}
              min={2}
            />
          </DetectorSection>

          <DetectorSection
            title="Circuit Breaker"
            description="Hard stop when the last N calls show only 1-2 unique patterns — last resort."
            enabled={draft.circuitBreaker.enabled}
            onToggle={(v) => updateDetector("circuitBreaker", "enabled", v)}
          >
            <NumberField
              label="Stale window size"
              value={draft.circuitBreaker.maxStaleWindow}
              onChange={(v) => updateDetector("circuitBreaker", "maxStaleWindow", v)}
              min={5}
            />
          </DetectorSection>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 pt-0">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-on-surface-secondary hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
