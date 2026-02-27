import type { Detector, ToolRecord, GuardrailSignal, CircuitBreakerConfig } from "../types.js";

export class CircuitBreakerDetector implements Detector {
  readonly name = "circuit-breaker";
  constructor(private config: CircuitBreakerConfig) {}

  check(_pending: ToolRecord, history: readonly ToolRecord[]): GuardrailSignal | null {
    if (!this.config.enabled) return null;
    if (history.length < this.config.maxStaleWindow) return null;

    const window = history.slice(-this.config.maxStaleWindow);
    const uniques = new Set<string>();

    for (const r of window) {
      const outcome = r.outcomeSignature ?? "?";
      uniques.add(`${r.toolName}:${r.argsSignature}:${outcome}`);
    }

    if (uniques.size <= 2) {
      return {
        severity: "critical",
        detector: this.name,
        message: `Circuit breaker: only ${uniques.size} unique tool call pattern(s) in the last ${this.config.maxStaleWindow} calls`,
        toolName: "multiple",
        count: this.config.maxStaleWindow,
      };
    }

    return null;
  }
}
