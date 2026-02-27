import type {
  ToolRecord,
  GuardrailSignal,
  GuardrailsConfig,
  GuardrailSeverity,
  Detector,
} from "./types.js";
import { deterministicSignature } from "./types.js";
import { DEFAULT_GUARDRAILS_CONFIG } from "./defaults.js";
import { RepeatDetector } from "./detectors/repeat.js";
import { PollingDetector } from "./detectors/polling.js";
import { PingPongDetector } from "./detectors/ping-pong.js";
import { CircuitBreakerDetector } from "./detectors/circuit-breaker.js";

export class StuckError extends Error {
  constructor(public readonly signal: GuardrailSignal) {
    super(`Agent stuck: ${signal.message}`);
    this.name = "StuckError";
  }
}

export class Guardrails {
  private history: ToolRecord[] = [];
  private detectors: Detector[];
  private config: GuardrailsConfig;

  constructor(config?: Partial<GuardrailsConfig>) {
    this.config = {
      ...DEFAULT_GUARDRAILS_CONFIG,
      ...config,
      repeat: { ...DEFAULT_GUARDRAILS_CONFIG.repeat, ...config?.repeat },
      polling: { ...DEFAULT_GUARDRAILS_CONFIG.polling, ...config?.polling },
      pingPong: { ...DEFAULT_GUARDRAILS_CONFIG.pingPong, ...config?.pingPong },
      circuitBreaker: { ...DEFAULT_GUARDRAILS_CONFIG.circuitBreaker, ...config?.circuitBreaker },
    };

    this.detectors = [
      new RepeatDetector(this.config.repeat),
      new PollingDetector(this.config.polling),
      new PingPongDetector(this.config.pingPong),
      new CircuitBreakerDetector(this.config.circuitBreaker),
    ];
  }

  /**
   * Run detectors against history for a pending tool call.
   * Returns the record (for later `recordOutcome`) and the highest-severity signal.
   */
  preToolCheck(
    toolName: string,
    args: unknown,
  ): { record: ToolRecord; signal: GuardrailSignal | null } {
    if (!this.config.enabled) {
      return {
        record: { toolName, argsSignature: "", outcomeSignature: null, timestamp: 0 },
        signal: null,
      };
    }

    const record: ToolRecord = {
      toolName,
      argsSignature: deterministicSignature(args),
      outcomeSignature: null,
      timestamp: Date.now(),
    };

    let worst: GuardrailSignal | null = null;

    for (const detector of this.detectors) {
      const signal = detector.check(record, this.history);
      if (signal && (!worst || severityRank(signal.severity) > severityRank(worst.severity))) {
        worst = signal;
      }
    }

    return { record, signal: worst };
  }

  /**
   * Record a completed tool call's outcome and push into history.
   */
  recordOutcome(record: ToolRecord, output: unknown): void {
    if (!this.config.enabled) return;

    record.outcomeSignature = deterministicSignature(output);
    this.history.push(record);

    if (this.history.length > this.config.historySize) {
      this.history.splice(0, this.history.length - this.config.historySize);
    }
  }

  getHistory(): readonly ToolRecord[] {
    return this.history;
  }

  reset(): void {
    this.history = [];
  }
}

function severityRank(s: GuardrailSeverity): number {
  return s === "critical" ? 2 : 1;
}
