import type { Detector, ToolRecord, GuardrailSignal, PingPongDetectorConfig } from "../types.js";

export class PingPongDetector implements Detector {
  readonly name = "ping-pong";
  constructor(private config: PingPongDetectorConfig) {}

  check(pending: ToolRecord, history: readonly ToolRecord[]): GuardrailSignal | null {
    if (!this.config.enabled) return null;
    if (history.length < 2) return null;

    // Pending call is the next "A". Most recent history entry is candidate "B".
    const b = history[history.length - 1];

    // A and B must be different calls
    if (pending.toolName === b.toolName && pending.argsSignature === b.argsSignature) return null;

    // Walk backward in pairs counting A/B cycles
    let cycles = 0;
    let allAOutcomesSame = true;
    let allBOutcomesSame = true;
    let refAOutcome: string | null = null;
    let refBOutcome: string | null = null;

    for (let i = history.length - 1; i >= 1; i -= 2) {
      const candidateB = history[i];
      const candidateA = history[i - 1];

      const isB = candidateB.toolName === b.toolName && candidateB.argsSignature === b.argsSignature;
      const isA = candidateA.toolName === pending.toolName && candidateA.argsSignature === pending.argsSignature;

      if (!isA || !isB) break;
      cycles++;

      if (candidateA.outcomeSignature !== null) {
        if (refAOutcome === null) refAOutcome = candidateA.outcomeSignature;
        else if (candidateA.outcomeSignature !== refAOutcome) allAOutcomesSame = false;
      }
      if (candidateB.outcomeSignature !== null) {
        if (refBOutcome === null) refBOutcome = candidateB.outcomeSignature;
        else if (candidateB.outcomeSignature !== refBOutcome) allBOutcomesSame = false;
      }
    }

    if (cycles < this.config.minCycles) return null;

    const bothStable =
      allAOutcomesSame && allBOutcomesSame && refAOutcome !== null && refBOutcome !== null;

    if (bothStable && cycles >= this.config.stableOutcomeCycles) {
      return {
        severity: "critical",
        detector: this.name,
        message: `Ping-pong: ${pending.toolName} <-> ${b.toolName} alternating ${cycles} cycles with stable outcomes`,
        toolName: pending.toolName,
        count: cycles,
      };
    }

    if (cycles >= this.config.minCycles) {
      return {
        severity: "warning",
        detector: this.name,
        message: `Possible ping-pong: ${pending.toolName} <-> ${b.toolName} alternating ${cycles} cycles`,
        toolName: pending.toolName,
        count: cycles,
      };
    }

    return null;
  }
}
