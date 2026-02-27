import type { GuardrailsConfig } from "./types.js";

export const DEFAULT_GUARDRAILS_CONFIG: GuardrailsConfig = {
  enabled: false,
  historySize: 50,
  repeat: {
    enabled: true,
    warnThreshold: 5,
    criticalThreshold: 0,
  },
  polling: {
    enabled: true,
    pollTools: ["dbQuery"],
    warnThreshold: 3,
    criticalThreshold: 6,
  },
  pingPong: {
    enabled: true,
    minCycles: 3,
    stableOutcomeCycles: 3,
  },
  circuitBreaker: {
    enabled: true,
    maxStaleWindow: 15,
  },
};
