import { describe, it, expect } from "vitest";
import { pruneHistory } from "../../src/context/pruning.js";
import type { HistoryEntry } from "../../src/context/history.js";

function makeEntry(role: HistoryEntry["role"], tokens: number): HistoryEntry {
  return {
    role,
    content: "x".repeat(tokens * 4),
    timestamp: Date.now(),
    tokenEstimate: tokens,
  };
}

describe("pruneHistory", () => {
  it("does nothing below soft threshold", () => {
    const history = [makeEntry("user", 100), makeEntry("assistant", 100)];
    const result = pruneHistory(history, { contextWindowTokens: 1000 });
    expect(result.action).toBe("none");
    expect(history).toHaveLength(2);
  });

  it("soft-trims tool results between 80-95%", () => {
    const history = [
      makeEntry("tool", 200),
      makeEntry("tool", 200),
      makeEntry("user", 100),
      makeEntry("assistant", 100),
      makeEntry("user", 100),
      makeEntry("assistant", 100),
    ];
    // Total: 800 tokens, window: 1000 -> 80% utilization
    const result = pruneHistory(history, { contextWindowTokens: 1000 });
    expect(result.action).toBe("soft-trim");
    expect(result.removedEntries).toBe(2); // Two tool entries trimmed
    expect(history[0].content).toBe("[tool result trimmed]");
    expect(history[1].content).toBe("[tool result trimmed]");
  });

  it("hard-clears above 95%", () => {
    const history = [
      makeEntry("user", 300),
      makeEntry("assistant", 300),
      makeEntry("tool", 200),
      makeEntry("user", 100),
      makeEntry("assistant", 100),
    ];
    // Total: 1000 tokens, window: 1000 -> 100% utilization
    const result = pruneHistory(history, {
      contextWindowTokens: 1000,
      keepMinTurns: 2,
    });
    expect(result.action).toBe("hard-clear");
    expect(history).toHaveLength(2);
    expect(result.removedEntries).toBe(3);
  });

  it("keeps at least keepMinTurns on hard-clear", () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      makeEntry("user", 100),
    );
    // 1000 tokens, window: 1000 -> 100%
    const result = pruneHistory(history, {
      contextWindowTokens: 1000,
      keepMinTurns: 5,
    });
    expect(result.action).toBe("hard-clear");
    expect(history).toHaveLength(5);
  });
});
