import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import type { ModelMessage } from "ai";
import { agentTasks, researchMessages } from "../db/schema.js";
import { CommandQueue } from "../infra/command-queue.js";
import { SessionManager } from "../infra/sessions.js";
import { Guardrails } from "./safety/guardrails.js";
import { getGuardrailsConfigFromDb } from "../handlers/guardrails-config.js";
import { AgentRunner } from "./runner.js";
import type { ToolFactoryContext } from "./runner.js";
import type { BaseAgent, AgentContext, TaskConfig } from "./base-agent.js";
import type { Db } from "../infra/router.js";
import type { GatewayEvent } from "@wedding-planner/shared";
import type { ToolRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission-wrapper.js";
import type { UserResponse } from "../tools/permission-wrapper.js";
import { getWorkspaceDir } from "../config/paths.js";

export class Orchestrator {
  private agents = new Map<string, BaseAgent>();
  private configs = new Map<string, TaskConfig>();
  private queue: CommandQueue;
  private sessions: SessionManager;
  private broadcast: (event: GatewayEvent) => void;
  private db: Db;
  private toolRegistry: ToolRegistry;
  private permissionManager: PermissionManager;
  private pendingPermissions = new Map<string, { resolve: (response: UserResponse) => void }>();
  private runningAbortControllers = new Map<string, AbortController>();
  private sqlite: unknown;
  private extraToolCtx: Record<string, unknown>;

  constructor(
    db: Db,
    broadcast: (event: GatewayEvent) => void,
    toolRegistry: ToolRegistry,
    config?: unknown,
    sqlite?: unknown,
    extraToolCtx?: Record<string, unknown>,
  ) {
    this.db = db;
    this.broadcast = broadcast;
    this.toolRegistry = toolRegistry;
    this.queue = new CommandQueue();
    this.sessions = new SessionManager(db);
    this.permissionManager = new PermissionManager(db);
    this.sqlite = sqlite;
    this.extraToolCtx = extraToolCtx ?? {};
  }

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.name, agent);
  }

  registerConfig(taskConfig: TaskConfig): void {
    this.configs.set(taskConfig.name, taskConfig);
  }

  async dispatch(
    agentName: string,
    input: unknown,
    options?: { lane?: string; vendorId?: number; categoryId?: number },
  ): Promise<{ taskId: string; sessionKey: string }> {
    const taskConfig = this.configs.get(agentName);
    const agent = this.agents.get(agentName);
    if (!taskConfig && !agent) throw new Error(`Unknown agent/config: ${agentName}`);

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
      this.execute(taskConfig ?? null, agent ?? null, taskId, sessionKey, input),
    );

    return { taskId, sessionKey };
  }

  abortTask(sessionKey: string): boolean {
    const controller = this.runningAbortControllers.get(sessionKey);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  private async execute(
    taskConfig: TaskConfig | null,
    agent: BaseAgent | null,
    taskId: string,
    sessionKey: string,
    input: unknown,
  ): Promise<void> {
    // Mark as running
    await this.db
      .update(agentTasks)
      .set({ status: "running" })
      .where(eq(agentTasks.sessionId, sessionKey));

    const controller = new AbortController();
    this.runningAbortControllers.set(sessionKey, controller);

    const dbGuardrailsConfig = await getGuardrailsConfigFromDb(this.db);
    const guardrails = new Guardrails({
      ...dbGuardrailsConfig,
      ...taskConfig?.guardrails,
    });

    const emit = (action: string, detail?: string) => {
      this.broadcast({
        name: "agent-activity",
        data: { sessionKey, action, detail },
      });
    };

    const permissionCallbacks = {
      requestPermission: async (toolName: string, context?: string): Promise<UserResponse> => {
        const requestId = randomUUID();
        const entry = this.toolRegistry.get(toolName);
        this.broadcast({
          name: "research.permissionRequest",
          data: {
            sessionKey,
            requestId,
            toolName,
            toolDescription: entry?.description ?? toolName,
            context,
          },
        });
        return new Promise<UserResponse>((resolve) => {
          this.pendingPermissions.set(requestId, { resolve });
        });
      },
    };

    try {
      const ctx: AgentContext = {
        db: this.db,
        sessionKey,
        emit,
        signal: controller.signal,
        toolRegistry: this.toolRegistry,
        permissionManager: this.permissionManager,
        permissionCallbacks,
        guardrails,
      };

      let result;

      if (taskConfig) {
        const toolCtx: ToolFactoryContext = {
          db: this.db,
          emit,
          sqlite: this.sqlite,
          workspaceDir: getWorkspaceDir(),
          permissionCallbacks,
          ...this.extraToolCtx,
        };

        const inputData = input as { messages?: ModelMessage[]; threadId?: number; [key: string]: unknown };
        const messages: ModelMessage[] = inputData.messages ?? [{ role: "user" as const, content: JSON.stringify(input) }];

        const runner = new AgentRunner();
        result = await runner.run(taskConfig, ctx, messages, toolCtx);
      } else if (agent) {
        result = await agent.run(ctx, input);
      } else {
        throw new Error("No task config or agent provided");
      }

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
      const aborted = controller.signal.aborted;
      const message = aborted ? "Stopped by user" : (err instanceof Error ? err.message : "Unknown error");

      await this.db
        .update(agentTasks)
        .set({
          status: aborted ? "cancelled" : "failed",
          output: JSON.stringify({ error: message }),
          completedAt: sql`datetime('now')`,
        })
        .where(eq(agentTasks.sessionId, sessionKey));

      if (aborted) {
        this.broadcast({
          name: "agent-complete",
          data: { taskId, summary: "Stopped by user" },
        });
      } else {
        this.broadcast({
          name: "agent-activity",
          data: { sessionKey, action: "error", detail: message },
        });
      }
    } finally {
      this.runningAbortControllers.delete(sessionKey);
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
