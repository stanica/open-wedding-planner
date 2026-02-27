import type { Detector, ToolRecord, GuardrailSignal, RepeatDetectorConfig } from "../types.js";

export class RepeatDetector implements Detector {
  readonly name = "repeat";
  constructor(private config: RepeatDetectorConfig) {}

  check(pending: ToolRecord, history: readonly ToolRecord[]): GuardrailSignal | null {
    if (!this.config.enabled) return null;

    let count = 0;
    for (const r of history) {
      if (r.toolName === pending.toolName && r.argsSignature === pending.argsSignature) {
        count++;
      }
    }

    const total = count + 1; // +1 for the pending call

    if (this.config.criticalThreshold > 0 && total >= this.config.criticalThreshold) {
      return {
        severity: "critical",
        detector: this.name,
        message: `${pending.toolName} called with identical args ${total} times`,
        toolName: pending.toolName,
        count: total,
      };
    }

    if (total >= this.config.warnThreshold) {
      return {
        severity: "warning",
        detector: this.name,
        message: `${pending.toolName} called with identical args ${total} times`,
        toolName: pending.toolName,
        count: total,
      };
    }

    return null;
  }
}
