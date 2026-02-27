import type { Detector, ToolRecord, GuardrailSignal, PollingDetectorConfig } from "../types.js";

export class PollingDetector implements Detector {
  readonly name = "polling";
  constructor(private config: PollingDetectorConfig) {}

  check(pending: ToolRecord, history: readonly ToolRecord[]): GuardrailSignal | null {
    if (!this.config.enabled) return null;
    if (!this.config.pollTools.includes(pending.toolName)) return null;

    // Walk backward: count consecutive calls with same tool+args and identical outcomes
    let consecutiveCount = 0;
    let referenceOutcome: string | null = null;

    for (let i = history.length - 1; i >= 0; i--) {
      const r = history[i];
      if (r.toolName !== pending.toolName || r.argsSignature !== pending.argsSignature) break;
      if (r.outcomeSignature === null) break;

      if (referenceOutcome === null) {
        referenceOutcome = r.outcomeSignature;
        consecutiveCount = 1;
      } else if (r.outcomeSignature === referenceOutcome) {
        consecutiveCount++;
      } else {
        break; // outcome changed — progress was made
      }
    }

    if (referenceOutcome === null || consecutiveCount < 2) return null;

    const total = consecutiveCount;

    if (total >= this.config.criticalThreshold) {
      return {
        severity: "critical",
        detector: this.name,
        message: `${pending.toolName} polled ${total} times with identical results — no progress`,
        toolName: pending.toolName,
        count: total,
      };
    }

    if (total >= this.config.warnThreshold) {
      return {
        severity: "warning",
        detector: this.name,
        message: `${pending.toolName} polled ${total} times with no change in results`,
        toolName: pending.toolName,
        count: total,
      };
    }

    return null;
  }
}
