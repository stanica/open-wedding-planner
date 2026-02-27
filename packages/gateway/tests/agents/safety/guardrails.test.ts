import { describe, it, expect } from "vitest";
import { deterministicSignature } from "../../../src/agents/safety/types.js";
import { RepeatDetector } from "../../../src/agents/safety/detectors/repeat.js";
import { PollingDetector } from "../../../src/agents/safety/detectors/polling.js";
import { PingPongDetector } from "../../../src/agents/safety/detectors/ping-pong.js";
import { CircuitBreakerDetector } from "../../../src/agents/safety/detectors/circuit-breaker.js";
import { Guardrails, StuckError } from "../../../src/agents/safety/guardrails.js";
import type { ToolRecord } from "../../../src/agents/safety/types.js";

function makeRecord(
  toolName: string,
  argsSignature: string,
  outcomeSignature: string | null = null,
): ToolRecord {
  return { toolName, argsSignature, outcomeSignature, timestamp: Date.now() };
}

// ── deterministicSignature ─────────────────────────────────────

describe("deterministicSignature", () => {
  it("produces identical hashes regardless of key order", () => {
    const a = deterministicSignature({ z: 1, a: 2 });
    const b = deterministicSignature({ a: 2, z: 1 });
    expect(a).toBe(b);
  });

  it("handles nested objects with different key order", () => {
    const a = deterministicSignature({ outer: { z: 1, a: 2 } });
    const b = deterministicSignature({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it("preserves array order", () => {
    const a = deterministicSignature([1, 2, 3]);
    const b = deterministicSignature([3, 2, 1]);
    expect(a).not.toBe(b);
  });

  it("handles primitives", () => {
    expect(deterministicSignature(42)).toBe(deterministicSignature(42));
    expect(deterministicSignature("hello")).toBe(deterministicSignature("hello"));
    expect(deterministicSignature(null)).toBe(deterministicSignature(null));
  });

  it("returns a 16-char hex string", () => {
    const sig = deterministicSignature({ foo: "bar" });
    expect(sig).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ── RepeatDetector ─────────────────────────────────────────────

describe("RepeatDetector", () => {
  it("returns null for varied calls", () => {
    const detector = new RepeatDetector({ enabled: true, warnThreshold: 3, criticalThreshold: 0 });
    const history = [
      makeRecord("search", "aaa"),
      makeRecord("scrape", "bbb"),
      makeRecord("search", "ccc"),
    ];
    const pending = makeRecord("dbQuery", "ddd");
    expect(detector.check(pending, history)).toBeNull();
  });

  it("warns at threshold", () => {
    const detector = new RepeatDetector({ enabled: true, warnThreshold: 3, criticalThreshold: 0 });
    const history = [makeRecord("search", "aaa"), makeRecord("search", "aaa")];
    const pending = makeRecord("search", "aaa");
    const signal = detector.check(pending, history);
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("warning");
    expect(signal!.count).toBe(3);
  });

  it("escalates to critical when configured", () => {
    const detector = new RepeatDetector({ enabled: true, warnThreshold: 2, criticalThreshold: 4 });
    const history = [
      makeRecord("search", "aaa"),
      makeRecord("search", "aaa"),
      makeRecord("search", "aaa"),
    ];
    const pending = makeRecord("search", "aaa");
    const signal = detector.check(pending, history);
    expect(signal!.severity).toBe("critical");
    expect(signal!.count).toBe(4);
  });

  it("returns null when disabled", () => {
    const detector = new RepeatDetector({ enabled: false, warnThreshold: 1, criticalThreshold: 0 });
    const history = [makeRecord("search", "aaa")];
    const pending = makeRecord("search", "aaa");
    expect(detector.check(pending, history)).toBeNull();
  });
});

// ── PollingDetector ────────────────────────────────────────────

describe("PollingDetector", () => {
  it("ignores tools not in pollTools", () => {
    const detector = new PollingDetector({
      enabled: true,
      pollTools: ["dbQuery"],
      warnThreshold: 2,
      criticalThreshold: 4,
    });
    const history = [makeRecord("search", "aaa", "out1"), makeRecord("search", "aaa", "out1")];
    const pending = makeRecord("search", "aaa");
    expect(detector.check(pending, history)).toBeNull();
  });

  it("returns null when outcomes differ", () => {
    const detector = new PollingDetector({
      enabled: true,
      pollTools: ["dbQuery"],
      warnThreshold: 2,
      criticalThreshold: 4,
    });
    const history = [
      makeRecord("dbQuery", "aaa", "out1"),
      makeRecord("dbQuery", "aaa", "out2"),
    ];
    const pending = makeRecord("dbQuery", "aaa");
    expect(detector.check(pending, history)).toBeNull();
  });

  it("warns when consecutive identical outcomes", () => {
    const detector = new PollingDetector({
      enabled: true,
      pollTools: ["dbQuery"],
      warnThreshold: 2,
      criticalThreshold: 5,
    });
    const history = [makeRecord("dbQuery", "aaa", "out1"), makeRecord("dbQuery", "aaa", "out1")];
    const pending = makeRecord("dbQuery", "aaa");
    const signal = detector.check(pending, history);
    expect(signal!.severity).toBe("warning");
    expect(signal!.count).toBe(2);
  });

  it("escalates to critical at higher threshold", () => {
    const detector = new PollingDetector({
      enabled: true,
      pollTools: ["dbQuery"],
      warnThreshold: 2,
      criticalThreshold: 4,
    });
    const history = [
      makeRecord("dbQuery", "aaa", "out1"),
      makeRecord("dbQuery", "aaa", "out1"),
      makeRecord("dbQuery", "aaa", "out1"),
      makeRecord("dbQuery", "aaa", "out1"),
    ];
    const pending = makeRecord("dbQuery", "aaa");
    const signal = detector.check(pending, history);
    expect(signal!.severity).toBe("critical");
    expect(signal!.count).toBe(4);
  });

  it("does not signal when args differ", () => {
    const detector = new PollingDetector({
      enabled: true,
      pollTools: ["dbQuery"],
      warnThreshold: 2,
      criticalThreshold: 4,
    });
    const history = [
      makeRecord("dbQuery", "aaa", "out1"),
      makeRecord("dbQuery", "bbb", "out1"),
    ];
    const pending = makeRecord("dbQuery", "ccc");
    expect(detector.check(pending, history)).toBeNull();
  });

  it("handles missing outcome signatures", () => {
    const detector = new PollingDetector({
      enabled: true,
      pollTools: ["dbQuery"],
      warnThreshold: 2,
      criticalThreshold: 4,
    });
    const history = [makeRecord("dbQuery", "aaa", null), makeRecord("dbQuery", "aaa", null)];
    const pending = makeRecord("dbQuery", "aaa");
    expect(detector.check(pending, history)).toBeNull();
  });
});

// ── PingPongDetector ───────────────────────────────────────────

describe("PingPongDetector", () => {
  it("does not signal for simple repetition (A,A,A)", () => {
    const detector = new PingPongDetector({ enabled: true, minCycles: 2, stableOutcomeCycles: 2 });
    const history = [
      makeRecord("search", "aaa", "o1"),
      makeRecord("search", "aaa", "o1"),
      makeRecord("search", "aaa", "o1"),
    ];
    const pending = makeRecord("search", "aaa");
    expect(detector.check(pending, history)).toBeNull();
  });

  it("detects A/B/A/B alternation", () => {
    const detector = new PingPongDetector({ enabled: true, minCycles: 2, stableOutcomeCycles: 3 });
    const history = [
      makeRecord("search", "aaa", "o1"),
      makeRecord("scrape", "bbb", "o2"),
      makeRecord("search", "aaa", "o1"),
      makeRecord("scrape", "bbb", "o2"),
    ];
    const pending = makeRecord("search", "aaa");
    const signal = detector.check(pending, history);
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("warning");
    expect(signal!.count).toBe(2);
  });

  it("escalates to critical with stable outcomes", () => {
    const detector = new PingPongDetector({ enabled: true, minCycles: 2, stableOutcomeCycles: 2 });
    const history = [
      makeRecord("search", "aaa", "o1"),
      makeRecord("scrape", "bbb", "o2"),
      makeRecord("search", "aaa", "o1"),
      makeRecord("scrape", "bbb", "o2"),
    ];
    const pending = makeRecord("search", "aaa");
    const signal = detector.check(pending, history);
    expect(signal!.severity).toBe("critical");
  });

  it("warns but does not critical when outcomes vary", () => {
    const detector = new PingPongDetector({ enabled: true, minCycles: 2, stableOutcomeCycles: 3 });
    const history = [
      makeRecord("search", "aaa", "o1"),
      makeRecord("scrape", "bbb", "o2"),
      makeRecord("search", "aaa", "o3"), // different outcome
      makeRecord("scrape", "bbb", "o2"),
    ];
    const pending = makeRecord("search", "aaa");
    const signal = detector.check(pending, history);
    expect(signal!.severity).toBe("warning");
  });

  it("requires minCycles before any signal", () => {
    const detector = new PingPongDetector({ enabled: true, minCycles: 3, stableOutcomeCycles: 3 });
    const history = [
      makeRecord("search", "aaa", "o1"),
      makeRecord("scrape", "bbb", "o2"),
    ];
    const pending = makeRecord("search", "aaa");
    expect(detector.check(pending, history)).toBeNull();
  });
});

// ── CircuitBreakerDetector ─────────────────────────────────────

describe("CircuitBreakerDetector", () => {
  it("returns null when history is shorter than maxStaleWindow", () => {
    const detector = new CircuitBreakerDetector({ enabled: true, maxStaleWindow: 10 });
    const history = Array.from({ length: 5 }, () => makeRecord("search", "aaa", "o1"));
    const pending = makeRecord("search", "aaa");
    expect(detector.check(pending, history)).toBeNull();
  });

  it("signals critical when only 1 unique triple in window", () => {
    const detector = new CircuitBreakerDetector({ enabled: true, maxStaleWindow: 5 });
    const history = Array.from({ length: 5 }, () => makeRecord("search", "aaa", "o1"));
    const pending = makeRecord("search", "aaa");
    const signal = detector.check(pending, history);
    expect(signal!.severity).toBe("critical");
    expect(signal!.detector).toBe("circuit-breaker");
  });

  it("signals critical when 2 unique triples in window", () => {
    const detector = new CircuitBreakerDetector({ enabled: true, maxStaleWindow: 6 });
    const history: ToolRecord[] = [];
    for (let i = 0; i < 6; i++) {
      history.push(makeRecord(i % 2 === 0 ? "search" : "scrape", "aaa", "o1"));
    }
    const pending = makeRecord("search", "aaa");
    const signal = detector.check(pending, history);
    expect(signal!.severity).toBe("critical");
  });

  it("returns null with 3+ unique triples", () => {
    const detector = new CircuitBreakerDetector({ enabled: true, maxStaleWindow: 6 });
    const history = [
      makeRecord("search", "aaa", "o1"),
      makeRecord("scrape", "bbb", "o2"),
      makeRecord("cmd", "ccc", "o3"),
      makeRecord("search", "aaa", "o1"),
      makeRecord("scrape", "bbb", "o2"),
      makeRecord("cmd", "ccc", "o3"),
    ];
    const pending = makeRecord("search", "aaa");
    expect(detector.check(pending, history)).toBeNull();
  });
});

// ── Guardrails integration ─────────────────────────────────────

describe("Guardrails", () => {
  it("is a complete no-op when disabled", () => {
    const g = new Guardrails({ enabled: false });
    const { record, signal } = g.preToolCheck("search", { q: "test" });
    expect(signal).toBeNull();
    expect(record.argsSignature).toBe("");

    g.recordOutcome(record, { results: [] });
    expect(g.getHistory()).toHaveLength(0);
  });

  it("records history and trims to historySize", () => {
    const g = new Guardrails({ enabled: true, historySize: 3 });

    for (let i = 0; i < 5; i++) {
      const { record } = g.preToolCheck("tool" + i, { i });
      g.recordOutcome(record, { i });
    }

    expect(g.getHistory()).toHaveLength(3);
  });

  it("returns highest severity when multiple detectors trigger", () => {
    const g = new Guardrails({
      enabled: true,
      repeat: { enabled: true, warnThreshold: 2, criticalThreshold: 0 },
      polling: { enabled: true, pollTools: ["dbQuery"], warnThreshold: 2, criticalThreshold: 3 },
    });

    // Build up identical-outcome history
    for (let i = 0; i < 3; i++) {
      const { record } = g.preToolCheck("dbQuery", { q: "SELECT 1" });
      g.recordOutcome(record, { rows: [] });
    }

    // Fourth call — repeat (warn) and polling (critical) should both trigger
    const { signal } = g.preToolCheck("dbQuery", { q: "SELECT 1" });
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("critical");
  });

  it("StuckError carries the signal payload", () => {
    const signal = {
      severity: "critical" as const,
      detector: "repeat",
      message: "test",
      toolName: "search",
      count: 5,
    };
    const err = new StuckError(signal);
    expect(err.signal).toBe(signal);
    expect(err.message).toBe("Agent stuck: test");
    expect(err.name).toBe("StuckError");
  });

  it("reset clears history", () => {
    const g = new Guardrails({ enabled: true });
    const { record } = g.preToolCheck("search", { q: "test" });
    g.recordOutcome(record, { results: [] });
    expect(g.getHistory()).toHaveLength(1);

    g.reset();
    expect(g.getHistory()).toHaveLength(0);
  });
});
