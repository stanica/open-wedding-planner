import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { agentTasks, researchMessages } from "../db/schema.js";
import { CommandQueue } from "../infra/command-queue.js";
import { SessionManager } from "../infra/sessions.js";
import { TurnCounter } from "./safety/turn-limits.js";
import { LoopDetector } from "./safety/loop-detection.js";
import { withTimeout, TimeoutError } from "./safety/timeout.js";
import type { BaseAgent, AgentContext } from "./base-agent.js";
import type { Db } from "../infra/router.js";
import type { GatewayEvent } from "@wedding-planner/shared";
import type { ToolRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission-wrapper.js";
import type { UserResponse } from "../tools/permission-wrapper.js";

export interface OrchestratorConfig {
  maxTurns?: number;
  timeoutMs?: number;
}

const DEFAULTS: Required<OrchestratorConfig> = {
  maxTurns: 50,
  timeoutMs: 120_000,
};

export class Orchestrator {
  private agents = new Map<string, BaseAgent>();
  private queue: CommandQueue;
  private sessions: SessionManager;
  private config: Required<OrchestratorConfig>;
  private broadcast: (event: GatewayEvent) => void;
  private db: Db;
  private toolRegistry: ToolRegistry;
  private permissionManager: PermissionManager;
  private pendingPermissions = new Map<string, { resolve: (response: UserResponse) => void }>();

  constructor(
    db: Db,
    broadcast: (event: GatewayEvent) => void,
    toolRegistry: ToolRegistry,
    config?: OrchestratorConfig,
  ) {
    this.db = db;
    this.broadcast = broadcast;
    this.toolRegistry = toolRegistry;
    this.config = { ...DEFAULTS, ...config };
    this.queue = new CommandQueue();
    this.sessions = new SessionManager(db);
    this.permissionManager = new PermissionManager(db);
  }

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.name, agent);
  }

  async dispatch(
    agentName: string,
    input: unknown,
    options?: { lane?: string; vendorId?: number; categoryId?: number },
  ): Promise<{ taskId: string; sessionKey: string }> {
    const agent = this.agents.get(agentName);
    if (!agent) throw new Error(`Unknown agent: ${agentName}`);

    const taskId = randomUUID();
    const sessionKey = `${agentName}-${taskId}`;
    const lane = options?.lane ?? "main";

    // Create session
    await this.sessions.getOrCreate(sessionKey, { agentName, input });

    // Create agent task record
    await this.db.insert(agentTasks).values({
      type: agentName,
      status: "pending",
      sessionId: sessionKey,
      input: JSON.stringify(input),
      vendorId: options?.vendorId ?? null,
      categoryId: options?.categoryId ?? null,
    });

    // Enqueue execution
    this.queue.enqueue(lane, taskId, () =>
      this.execute(agent, taskId, sessionKey, input),
    );

    return { taskId, sessionKey };
  }

  private async execute(
    agent: BaseAgent,
    taskId: string,
    sessionKey: string,
    input: unknown,
  ): Promise<void> {
    // Mark as running
    await this.db
      .update(agentTasks)
      .set({ status: "running" })
      .where(eq(agentTasks.sessionId, sessionKey));

    const turnCounter = new TurnCounter(this.config.maxTurns);
    const loopDetector = new LoopDetector();

    const emit = (action: string, detail?: string) => {
      turnCounter.increment();
      const warning = loopDetector.record(action, detail);
      if (warning) {
        this.broadcast({
          name: "agent-activity",
          data: { sessionKey, action: "warning", detail: `Loop warning: ${warning.pattern} (${warning.count}x)` },
        });
      }
      this.broadcast({
        name: "agent-activity",
        data: { sessionKey, action, detail },
      });
    };

    const permissionCallbacks = {
      requestPermission: async (toolName: string): Promise<UserResponse> => {
        const requestId = randomUUID();
        const entry = this.toolRegistry.get(toolName);
        this.broadcast({
          name: "research.permissionRequest",
          data: {
            sessionKey,
            requestId,
            toolName,
            toolDescription: entry?.description ?? toolName,
          },
        });
        return new Promise<UserResponse>((resolve) => {
          this.pendingPermissions.set(requestId, { resolve });
        });
      },
    };

    try {
      const result = await withTimeout(
        (signal) => {
          const ctx: AgentContext = {
            db: this.db,
            sessionKey,
            emit,
            signal,
            toolRegistry: this.toolRegistry,
            permissionManager: this.permissionManager,
            permissionCallbacks,
          };
          return agent.run(ctx, input);
        },
        this.config.timeoutMs,
      );

      // Mark completed
      await this.db
        .update(agentTasks)
        .set({
          status: "completed",
          output: JSON.stringify(result),
          completedAt: sql`datetime('now')`,
        })
        .where(eq(agentTasks.sessionId, sessionKey));

      this.broadcast({
        name: "agent-complete",
        data: { taskId, summary: result.summary },
      });

      // Save assistant message to thread if this was a research chat
      const researchInput = input as { threadId?: number };
      if (researchInput.threadId) {
        const resultData = result.data as {
          toolCalls?: unknown[];
          vendorIds?: number[];
        } | undefined;
        await this.db.insert(researchMessages).values({
          threadId: researchInput.threadId,
          role: "assistant",
          content: result.summary,
          toolCalls: resultData?.toolCalls ? JSON.stringify(resultData.toolCalls) : null,
          vendorIds: resultData?.vendorIds ? JSON.stringify(resultData.vendorIds) : null,
        });
        this.broadcast({
          name: "research.messageComplete",
          data: { threadId: researchInput.threadId },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const status = err instanceof TimeoutError ? "failed" : "failed";

      await this.db
        .update(agentTasks)
        .set({
          status,
          output: JSON.stringify({ error: message }),
          completedAt: sql`datetime('now')`,
        })
        .where(eq(agentTasks.sessionId, sessionKey));

      this.broadcast({
        name: "agent-activity",
        data: { sessionKey, action: "error", detail: message },
      });
    }
  }

  resolvePermission(requestId: string, response: UserResponse): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve(response);
      this.pendingPermissions.delete(requestId);
    }
  }

  getQueueStatus() {
    return this.queue.getStatus();
  }

  async waitForDrain(maxWaitMs?: number): Promise<void> {
    return this.queue.waitForDrain(maxWaitMs);
  }
}
