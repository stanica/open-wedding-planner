import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeliveryQueue } from "../../src/infra/delivery-queue.js";

let tmpDir: string;
let queue: DeliveryQueue;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dq-test-"));
  queue = new DeliveryQueue(tmpDir);
});

afterEach(() => {
  queue.stopProcessing();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("DeliveryQueue", () => {
  it("enqueues and retrieves pending entries", () => {
    queue.enqueue("email", 1, { to: "vendor@test.com", subject: "Hi" });
    queue.enqueue("email", 2, { to: "vendor2@test.com", subject: "Hello" });

    const pending = queue.getPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].channel).toBe("email");
    expect(pending[0].status).toBe("pending");
  });

  it("acks an entry", () => {
    const entry = queue.enqueue("email", 1, { subject: "Test" });
    queue.ack(entry.id);

    const pending = queue.getPending();
    expect(pending).toHaveLength(0);

    const all = queue.getAll();
    expect(all[0].status).toBe("acked");
  });

  it("processes entries with registered send function", async () => {
    const sent: unknown[] = [];
    queue.registerChannel("email", async (entry) => {
      sent.push(entry.payload);
    });

    queue.enqueue("email", 1, { subject: "Test" });
    const result = await queue.processOnce();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(sent).toHaveLength(1);
    expect(queue.getPending()).toHaveLength(0);
  });

  it("retries failed entries with exponential backoff", async () => {
    let callCount = 0;
    queue.registerChannel("email", async () => {
      callCount++;
      if (callCount < 3) throw new Error("Send failed");
    });

    queue.enqueue("email", 1, { subject: "Test" }, 5);

    // First attempt fails
    await queue.processOnce();
    expect(callCount).toBe(1);
    expect(queue.getPending()).toHaveLength(1);

    const pending = queue.getPending();
    expect(pending[0].attempts).toBe(1);
    expect(pending[0].nextRetryAt).toBeGreaterThan(Date.now() - 100);
  });

  it("marks as failed after max attempts", async () => {
    queue.registerChannel("email", async () => {
      throw new Error("Always fails");
    });

    const entry = queue.enqueue("email", 1, { subject: "Test" }, 1);
    await queue.processOnce();

    const all = queue.getAll();
    const updated = all.find((e) => e.id === entry.id)!;
    expect(updated.status).toBe("failed");
    expect(queue.getPending()).toHaveLength(0);
  });

  it("recovers in-flight entries on startup", () => {
    const entry = queue.enqueue("email", 1, { subject: "Test" });
    // Simulate crash: manually set to in-flight
    const filePath = path.join(tmpDir, `${entry.id}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    data.status = "in-flight";
    fs.writeFileSync(filePath, JSON.stringify(data));

    const newQueue = new DeliveryQueue(tmpDir);
    const recovered = newQueue.recover();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].status).toBe("pending");
  });

  it("persists entries to disk", () => {
    queue.enqueue("whatsapp", 1, { message: "Hello" });

    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1);

    const newQueue = new DeliveryQueue(tmpDir);
    expect(newQueue.getPending()).toHaveLength(1);
  });
});
