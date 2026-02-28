import { eq, sql } from "drizzle-orm";
import { heartbeatConfig } from "../db/schema.js";
import type { Orchestrator } from "../agents/orchestrator.js";
import type { GatewayEvent } from "@wedding-planner/shared";
import type { Db } from "../infra/router.js";

export class HeartbeatScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private orchestrator: Orchestrator;
  private broadcast: (event: GatewayEvent) => void;
  private db: Db;
  private currentIntervalMs: number = 30 * 60 * 1000;

  constructor(
    orchestrator: Orchestrator,
    broadcast: (event: GatewayEvent) => void,
    db: Db,
  ) {
    this.orchestrator = orchestrator;
    this.broadcast = broadcast;
    this.db = db;
  }

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.currentIntervalMs);

    this.broadcast({
      name: "agent-activity",
      data: {
        sessionKey: "heartbeat",
        action: "scheduled",
        detail: `Heartbeat scheduled every ${Math.round(this.currentIntervalMs / 60_000)} minutes`,
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
      // Phase 1: Health checks (always)
      await this.orchestrator.dispatch("heartbeat", {}, { lane: "heartbeat" });

      // Phase 2: LLM research (if configured)
      const [config] = await this.db.select().from(heartbeatConfig).limit(1);

      if (config?.enabled && config.prompt) {
        // Register/update the heartbeat-research config with user's prompt
        this.orchestrator.registerConfig({
          name: "heartbeat-research",
          systemPrompt: config.prompt,
          tools: ["search", "scrape", "dispatch", "awaitTasks", "parsePdf", "createVendor", "cmd", "dbQuery", "dbSchema", "sendWhatsApp"],
        });

        this.broadcast({
          name: "agent-activity",
          data: {
            sessionKey: "heartbeat-research",
            action: "starting",
            detail: "Running scheduled research...",
          },
        });

        await this.orchestrator.dispatch(
          "heartbeat-research",
          { messages: [{ role: "user" as const, content: config.prompt }] },
          { lane: "heartbeat" },
        );

        // Update last_run_at
        await this.db
          .update(heartbeatConfig)
          .set({ lastRunAt: sql`datetime('now')` })
          .where(eq(heartbeatConfig.id, config.id));
      }

      // Check if interval changed and restart timer
      if (config?.intervalMinutes) {
        const newIntervalMs = config.intervalMinutes * 60 * 1000;
        if (newIntervalMs !== this.currentIntervalMs) {
          this.currentIntervalMs = newIntervalMs;
          this.stop();
          this.timer = setInterval(() => this.tick(), this.currentIntervalMs);
        }
      }
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
