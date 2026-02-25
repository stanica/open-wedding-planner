import { describe, it, expect } from "vitest";
import { CommandQueue, Lane } from "../../src/infra/command-queue.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("Lane", () => {
  it("enforces maxConcurrent limit", async () => {
    const lane = new Lane("test", { maxConcurrent: 2 });
    const d1 = deferred();
    const d2 = deferred();
    const d3 = deferred();

    lane.enqueue("t1", () => d1.promise);
    lane.enqueue("t2", () => d2.promise);
    lane.enqueue("t3", () => d3.promise);

    expect(lane.getActiveCount()).toBe(2);
    expect(lane.getQueueLength()).toBe(1);

    d1.resolve();
    await d1.promise;
    // Allow microtask to drain
    await new Promise((r) => setTimeout(r, 10));

    expect(lane.getActiveCount()).toBe(2);
    expect(lane.getQueueLength()).toBe(0);
    expect(lane.isActive("t3")).toBe(true);

    d2.resolve();
    d3.resolve();
  });

  it("rejects stale generation completions", () => {
    const lane = new Lane("test", { maxConcurrent: 2 });
    const gen = lane.getGeneration();

    lane.cancel("nonexistent");
    // Generation doesn't change for nonexistent cancel

    // Force a generation bump via reset
    lane.reset();
    const staleResult = lane.complete("any-task", gen);
    expect(staleResult).toBe(false);
  });

  it("drains queue correctly as tasks complete", async () => {
    const lane = new Lane("test", { maxConcurrent: 1 });
    const order: string[] = [];

    const d1 = deferred();
    const d2 = deferred();

    lane.enqueue("t1", async () => {
      await d1.promise;
      order.push("t1");
    });
    lane.enqueue("t2", async () => {
      await d2.promise;
      order.push("t2");
    });

    expect(lane.getActiveCount()).toBe(1);
    expect(lane.isActive("t1")).toBe(true);

    d1.resolve();
    await new Promise((r) => setTimeout(r, 10));

    expect(lane.isActive("t2")).toBe(true);
    expect(order).toEqual(["t1"]);

    d2.resolve();
    await new Promise((r) => setTimeout(r, 10));

    expect(order).toEqual(["t1", "t2"]);
    expect(lane.getActiveCount()).toBe(0);
  });
});

describe("CommandQueue", () => {
  it("has default lanes", () => {
    const queue = new CommandQueue();
    const status = queue.getStatus();
    expect(status.main).toBeDefined();
    expect(status.heartbeat).toBeDefined();
    expect(status.subagent).toBeDefined();
  });

  it("throws on unknown lane", () => {
    const queue = new CommandQueue();
    expect(() => queue.getLane("unknown")).toThrow("Unknown lane: unknown");
  });

  it("reset clears all lanes", async () => {
    const queue = new CommandQueue();
    const d = deferred();
    queue.enqueue("main", "t1", () => d.promise);

    expect(queue.getStatus().main.active).toBe(1);
    queue.reset();
    expect(queue.getStatus().main.active).toBe(0);
    d.resolve();
  });
});
