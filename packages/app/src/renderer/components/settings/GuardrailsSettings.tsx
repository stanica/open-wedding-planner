import { useState, useEffect } from "react";
import { ShieldCheck, Settings2 } from "lucide-react";
import { wsClient } from "../../lib/ws-client";
import { GuardrailsModal } from "./GuardrailsModal";

interface GuardrailsConfig {
  enabled: boolean;
  historySize: number;
  repeat: { enabled: boolean; warnThreshold: number; criticalThreshold: number };
  polling: { enabled: boolean; pollTools: string[]; warnThreshold: number; criticalThreshold: number };
  pingPong: { enabled: boolean; minCycles: number; stableOutcomeCycles: number };
  circuitBreaker: { enabled: boolean; maxStaleWindow: number };
}

export function GuardrailsSettings() {
  const [config, setConfig] = useState<GuardrailsConfig | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    wsClient
      .request<GuardrailsConfig>("guardrails-config.get")
      .then(setConfig)
      .catch(() => {});
  }, []);

  async function handleToggle(enabled: boolean) {
    const updated = await wsClient.request<GuardrailsConfig>("guardrails-config.update", { enabled });
    setConfig(updated);
  }

  async function handleSave(draft: GuardrailsConfig) {
    const updated = await wsClient.request<GuardrailsConfig>("guardrails-config.update", draft);
    setConfig(updated);
    setShowModal(false);
  }

  if (!config) return null;

  const activeDetectors = [
    config.repeat.enabled && "repeat",
    config.polling.enabled && "polling",
    config.pingPong.enabled && "ping-pong",
    config.circuitBreaker.enabled && "circuit breaker",
  ].filter(Boolean);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-on-surface-secondary" />
        <h2 className="text-lg font-semibold">Agent Guardrails</h2>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-4 w-4 rounded accent-indigo-500"
          />
          <div>
            <p className="text-sm font-medium text-on-surface">Enable guardrails</p>
            <p className="text-xs text-on-surface-secondary">
              {config.enabled
                ? `Active: ${activeDetectors.join(", ")}`
                : "Detect and prevent agent loops and stuck patterns"}
            </p>
          </div>
        </label>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs text-on-surface-secondary hover:bg-surface-active transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Configure
        </button>
      </div>

      {showModal && (
        <GuardrailsModal
          config={config}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
