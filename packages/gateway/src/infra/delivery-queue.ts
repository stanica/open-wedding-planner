import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "crypto";

export interface DeliveryEntry {
  id: string;
  channel: "email" | "whatsapp";
  vendorId: number;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number;
  createdAt: number;
  status: "pending" | "in-flight" | "acked" | "failed";
}

export type SendFn = (entry: DeliveryEntry) => Promise<void>;

export class DeliveryQueue {
  private dir: string;
  private sendFns = new Map<string, SendFn>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  registerChannel(channel: string, sendFn: SendFn) {
    this.sendFns.set(channel, sendFn);
  }

  enqueue(
    channel: "email" | "whatsapp",
    vendorId: number,
    payload: unknown,
    maxAttempts = 5,
  ): DeliveryEntry {
    const entry: DeliveryEntry = {
      id: randomUUID(),
      channel,
      vendorId,
      payload,
      attempts: 0,
      maxAttempts,
      nextRetryAt: Date.now(),
      createdAt: Date.now(),
      status: "pending",
    };
    this.writeEntry(entry);
    return entry;
  }

  ack(id: string): void {
    const entry = this.readEntry(id);
    if (!entry) return;
    entry.status = "acked";
    this.writeEntry(entry);
  }

  fail(id: string): void {
    const entry = this.readEntry(id);
    if (!entry) return;
    entry.status = "failed";
    this.writeEntry(entry);
  }

  getPending(): DeliveryEntry[] {
    return this.readAll().filter(
      (e) => (e.status === "pending" || e.status === "in-flight") && e.attempts < e.maxAttempts,
    );
  }

  getAll(): DeliveryEntry[] {
    return this.readAll();
  }

  async processOnce(): Promise<{ processed: number; failed: number }> {
    if (this.processing) return { processed: 0, failed: 0 };
    this.processing = true;

    let processed = 0;
    let failed = 0;

    try {
      const pending = this.getPending().filter((e) => e.nextRetryAt <= Date.now());

      for (const entry of pending) {
        const sendFn = this.sendFns.get(entry.channel);
        if (!sendFn) continue;

        entry.status = "in-flight";
        entry.attempts++;
        this.writeEntry(entry);

        try {
          await sendFn(entry);
          entry.status = "acked";
          this.writeEntry(entry);
          processed++;
        } catch {
          if (entry.attempts >= entry.maxAttempts) {
            entry.status = "failed";
          } else {
            entry.status = "pending";
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s
            entry.nextRetryAt = Date.now() + 1000 * Math.pow(2, entry.attempts - 1);
          }
          this.writeEntry(entry);
          failed++;
        }
      }
    } finally {
      this.processing = false;
    }

    return { processed, failed };
  }

  startProcessing(intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.processOnce(), intervalMs);
  }

  stopProcessing(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  recover(): DeliveryEntry[] {
    // On startup, reset any in-flight entries back to pending
    const entries = this.readAll();
    const recovered: DeliveryEntry[] = [];
    for (const entry of entries) {
      if (entry.status === "in-flight") {
        entry.status = "pending";
        this.writeEntry(entry);
        recovered.push(entry);
      }
    }
    return recovered;
  }

  private entryPath(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private writeEntry(entry: DeliveryEntry): void {
    fs.writeFileSync(this.entryPath(entry.id), JSON.stringify(entry, null, 2));
  }

  private readEntry(id: string): DeliveryEntry | null {
    const filePath = this.entryPath(id);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  private readAll(): DeliveryEntry[] {
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    return files.map((f) => JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")));
  }
}
