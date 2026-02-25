import { describe, it, expect } from "vitest";
import { compactHistory } from "../../src/context/compaction.js";
import type { HistoryEntry } from "../../src/context/history.js";

function makeEntry(role: HistoryEntry["role"], tokens: number): HistoryEntry {
  return {
    role,
    content: "x".repeat(tokens * 4),
    timestamp: Date.now(),
    tokenEstimate: tokens,
  };
}

describe("compactHistory", () => {
  it("does nothing when under threshold", async () => {
    const history = [makeEntry("user", 100), makeEntry("assistant", 100)];
    const result = await compactHistory(
      history,
      async (text) => `Summary: ${text.length} chars`,
      { contextWindowTokens: 1000 },
    );
    expect(result.compacted).toBe(false);
    expect(history).toHaveLength(2);
  });

  it("compacts when over 80% with safety margin", async () => {
    const history = Array.from({ length: 10 }, () => makeEntry("user", 100));
    // 10 * 100 * 1.2 = 1200 effective tokens, window: 1000 -> over 80%
    const summarizeFn = async () => "A summary of the conversation";

    const result = await compactHistory(history, summarizeFn, {
      contextWindowTokens: 1000,
      targetUtilization: 0.5,
      safetyMargin: 1.2,
    });

    expect(result.compacted).toBe(true);
    expect(result.removedEntries).toBeGreaterThan(0);
    expect(history[0].content).toContain("[Context summary]");
    expect(history.length).toBeLessThan(10);
  });

  it("passes concatenated history text to summarize function", async () => {
    const history = [
      makeEntry("user", 400),
      makeEntry("assistant", 400),
      makeEntry("user", 100),
    ];

    let receivedText = "";
    const summarizeFn = async (text: string) => {
      receivedText = text;
      return "summary";
    };

    await compactHistory(history, summarizeFn, {
      contextWindowTokens: 1000,
      safetyMargin: 1.2,
    });

    expect(receivedText).toContain("[user]:");
    expect(receivedText).toContain("[assistant]:");
  });
});
