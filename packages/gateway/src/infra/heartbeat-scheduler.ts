import type { Orchestrator } from "../agents/orchestrator.js";
import type { GatewayEvent } from "@wedding-planner/shared";

export interface HeartbeatSchedulerConfig {
  intervalMs: number;
}

const DEFAULT_INTERVAL = 30 * 60 * 1000; // 30 minutes

export class HeartbeatScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private orchestrator: Orchestrator;
  private broadcast: (event: GatewayEvent) => void;
  private intervalMs: number;

  constructor(
    orchestrator: Orchestrator,
    broadcast: (event: GatewayEvent) => void,
    config?: Partial<HeartbeatSchedulerConfig>,
  ) {
    this.orchestrator = orchestrator;
    this.broadcast = broadcast;
    this.intervalMs = config?.intervalMs ?? DEFAULT_INTERVAL;
  }

  start(): void {
    if (this.timer) return;

    // Run once immediately
    this.tick();

    this.timer = setInterval(() => this.tick(), this.intervalMs);

    this.broadcast({
      name: "agent-activity",
      data: {
        sessionKey: "heartbeat",
        action: "scheduled",
        detail: `Heartbeat scheduled every ${Math.round(this.intervalMs / 60_000)} minutes`,
      },
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      await this.orchestrator.dispatch("heartbeat", {}, { lane: "heartbeat" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.broadcast({
        name: "agent-activity",
        data: {
          sessionKey: "heartbeat",
          action: "error",
          detail: `Heartbeat failed: ${message}`,
        },
      });
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
