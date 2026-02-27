import { createHash } from "crypto";

// ── A single recorded tool invocation ──────────────────────────
export interface ToolRecord {
  toolName: string;
  argsSignature: string;
  outcomeSignature: string | null;
  timestamp: number;
}

// ── Detector verdicts ──────────────────────────────────────────
export type GuardrailSeverity = "warning" | "critical";

export interface GuardrailSignal {
  severity: GuardrailSeverity;
  detector: string;
  message: string;
  toolName: string;
  count: number;
}

// ── Detector interface ─────────────────────────────────────────
export interface Detector {
  readonly name: string;
  check(pending: ToolRecord, history: readonly ToolRecord[]): GuardrailSignal | null;
}

// ── Per-detector config shapes ─────────────────────────────────
export interface RepeatDetectorConfig {
  enabled: boolean;
  warnThreshold: number;
  /** 0 = never escalate to critical */
  criticalThreshold: number;
}

export interface PollingDetectorConfig {
  enabled: boolean;
  pollTools: string[];
  warnThreshold: number;
  criticalThreshold: number;
}

export interface PingPongDetectorConfig {
  enabled: boolean;
  minCycles: number;
  stableOutcomeCycles: number;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  maxStaleWindow: number;
}

export interface GuardrailsConfig {
  enabled: boolean;
  historySize: number;
  repeat: RepeatDetectorConfig;
  polling: PollingDetectorConfig;
  pingPong: PingPongDetectorConfig;
  circuitBreaker: CircuitBreakerConfig;
}

// ── Hashing utility ────────────────────────────────────────────
export function deterministicSignature(data: unknown): string {
  const json = JSON.stringify(data, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = value[k];
          return acc;
        }, {});
    }
    return value;
  });
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}
