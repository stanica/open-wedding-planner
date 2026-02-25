import { describe, it, expect } from "vitest";
import { HistoryManager, estimateTokens } from "../../src/context/history.js";

describe("HistoryManager", () => {
  it("appends and retrieves entries", () => {
    const mgr = new HistoryManager();
    mgr.append("s1", { role: "user", content: "hello", timestamp: 1 });
    mgr.append("s1", { role: "assistant", content: "hi", timestamp: 2 });

    const history = mgr.get("s1");
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe("hello");
    expect(history[1].content).toBe("hi");
  });

  it("enforces sliding window", () => {
    const mgr = new HistoryManager({ maxTurns: 3 });
    for (let i = 0; i < 5; i++) {
      mgr.append("s1", { role: "user", content: `msg-${i}`, timestamp: i });
    }

    const history = mgr.get("s1");
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe("msg-2");
    expect(history[2].content).toBe("msg-4");
  });

  it("isolates sessions", () => {
    const mgr = new HistoryManager();
    mgr.append("a", { role: "user", content: "a-msg", timestamp: 1 });
    mgr.append("b", { role: "user", content: "b-msg", timestamp: 2 });

    expect(mgr.get("a")).toHaveLength(1);
    expect(mgr.get("b")).toHaveLength(1);
    expect(mgr.get("c")).toHaveLength(0);
  });

  it("clears session history", () => {
    const mgr = new HistoryManager();
    mgr.append("s1", { role: "user", content: "hello", timestamp: 1 });
    mgr.clear("s1");
    expect(mgr.get("s1")).toHaveLength(0);
  });

  it("estimates tokens", () => {
    const mgr = new HistoryManager();
    mgr.append("s1", {
      role: "user",
      content: "a".repeat(400),
      timestamp: 1,
    });
    expect(mgr.getTokenEstimate("s1")).toBe(100);
  });
});

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("hello world")).toBe(3); // 11 chars -> ceil(11/4) = 3
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });
});
