import { describe, it, expect } from "vitest";
import {
  LoopDetector,
  LoopDetectedError,
  LoopWarning,
} from "../../../src/agents/safety/loop-detection.js";
import { TurnCounter, TurnLimitError } from "../../../src/agents/safety/turn-limits.js";
import { withTimeout, TimeoutError } from "../../../src/agents/safety/timeout.js";

describe("LoopDetector", () => {
  it("returns null for non-repetitive calls", () => {
    const detector = new LoopDetector();
    for (let i = 0; i < 5; i++) {
      const result = detector.record("tool" + i, { i });
      expect(result).toBeNull();
    }
  });

  it("warns at warn threshold", () => {
    const detector = new LoopDetector({ warnThreshold: 3, blockThreshold: 5, globalBreaker: 100 });
    let warning: LoopWarning | null = null;

    for (let i = 0; i < 3; i++) {
      warning = detector.record("search", { q: "same" });
    }

    expect(warning).toBeInstanceOf(LoopWarning);
    expect(warning!.count).toBe(3);
  });

  it("throws at block threshold", () => {
    const detector = new LoopDetector({ warnThreshold: 3, blockThreshold: 5, globalBreaker: 100 });

    expect(() => {
      for (let i = 0; i < 5; i++) {
        detector.record("search", { q: "same" });
      }
    }).toThrow(LoopDetectedError);
  });

  it("respects global breaker", () => {
    const detector = new LoopDetector({ globalBreaker: 5, warnThreshold: 100, blockThreshold: 100 });

    expect(() => {
      for (let i = 0; i < 6; i++) {
        detector.record("tool" + i, {});
      }
    }).toThrow(LoopDetectedError);
  });

  it("sliding window evicts old entries", () => {
    const detector = new LoopDetector({
      windowSize: 5,
      warnThreshold: 4,
      blockThreshold: 10,
      globalBreaker: 100,
    });

    // Fill window with unique calls
    for (let i = 0; i < 5; i++) {
      detector.record("unique" + i, {});
    }

    // Now repeat same call — old entries evicted so count stays low
    const w1 = detector.record("repeat", {});
    expect(w1).toBeNull();
    const w2 = detector.record("repeat", {});
    expect(w2).toBeNull();
  });
});

describe("TurnCounter", () => {
  it("counts turns", () => {
    const counter = new TurnCounter(5);
    counter.increment();
    counter.increment();
    expect(counter.getCount()).toBe(2);
    expect(counter.remaining()).toBe(3);
  });

  it("throws at max turns", () => {
    const counter = new TurnCounter(2);
    counter.increment();
    counter.increment();
    expect(() => counter.increment()).toThrow(TurnLimitError);
  });

  it("resets count", () => {
    const counter = new TurnCounter(2);
    counter.increment();
    counter.increment();
    counter.reset();
    expect(counter.getCount()).toBe(0);
    expect(() => counter.increment()).not.toThrow();
  });
});

describe("withTimeout", () => {
  it("resolves if function completes in time", async () => {
    const result = await withTimeout(async () => 42, 1000);
    expect(result).toBe(42);
  });

  it("throws TimeoutError on timeout", async () => {
    await expect(
      withTimeout(
        async (signal) => {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 5000);
            signal.addEventListener("abort", () => clearTimeout(timer));
          });
        },
        50,
      ),
    ).rejects.toThrow(TimeoutError);
  });

  it("passes abort signal to function", async () => {
    let aborted = false;
    try {
      await withTimeout(
        async (signal) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 5000);
            signal.addEventListener("abort", () => clearTimeout(timer));
          });
        },
        50,
      );
    } catch {
      // expected
    }
    expect(aborted).toBe(true);
  });
});
