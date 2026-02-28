import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import type { ModelMessage } from "ai";
import { agentTasks, researchMessages, researchThreads } from "../db/schema.js";
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
  private completionCallbacks = new Map<string, (threadId: number) => void>();

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

  onThreadComplete(threadId: number, callback: (threadId: number) => void): void {
    this.completionCallbacks.set(`thread-${threadId}`, callback);
  }

  removeThreadCallback(threadId: number): void {
    this.completionCallbacks.delete(`thread-${threadId}`);
  }

  registerConfig(taskConfig: TaskConfig): void {
    this.configs.set(taskConfig.name, taskConfig);
  }

  async dispatch(
    agentName: string,
    input: unknown,
    options?: { lane?: string; vendorId?: number; categoryId?: number; parentSessionKey?: string },
  ): Promise<{ taskId: string; sessionKey: string }> {
    const taskConfig = this.configs.get(agentName);
    const agent = this.agents.get(agentName);
    if (!taskConfig && !agent) throw new Error(`Unknown agent/config: ${agentName}`);

    const taskId = randomUUID();
    const sessionKey = `${agentName}-${taskId}`;
    const lane = options?.lane ?? "main";

    // Look up parent task ID if a parent session key was provided
    let parentTaskId: number | null = null;
    if (options?.parentSessionKey) {
      const [parent] = await this.db
        .select({ id: agentTasks.id })
        .from(agentTasks)
        .where(eq(agentTasks.sessionId, options.parentSessionKey))
        .limit(1);
      parentTaskId = parent?.id ?? null;
    }

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
      parentTaskId,
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
        // Resolve threadId: from input directly, or from parent task
        let resolvedThreadId = (input as any)?.threadId;
        if (!resolvedThreadId) {
          const [task] = await this.db
            .select({ parentTaskId: agentTasks.parentTaskId })
            .from(agentTasks)
            .where(eq(agentTasks.sessionId, sessionKey))
            .limit(1);
          if (task?.parentTaskId) {
            const [parentTask] = await this.db
              .select({ input: agentTasks.input })
              .from(agentTasks)
              .where(eq(agentTasks.id, task.parentTaskId))
              .limit(1);
            if (parentTask?.input) {
              try {
                const parentInput = JSON.parse(parentTask.input as string);
                resolvedThreadId = parentInput.threadId;
              } catch {}
            }
          }
        }

        const toolCtx: ToolFactoryContext = {
          db: this.db,
          emit,
          sqlite: this.sqlite,
          workspaceDir: getWorkspaceDir(),
          permissionCallbacks,
          orchestrator: this,
          parentSessionKey: sessionKey,
          ...this.extraToolCtx,
          threadId: resolvedThreadId,
          broadcast: this.broadcast,
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

      // Mark completed or cancelled
      const status = result.aborted ? "cancelled" : "completed";
      await this.db
        .update(agentTasks)
        .set({
          status,
          output: JSON.stringify(result),
          completedAt: sql`datetime('now')`,
        })
        .where(eq(agentTasks.sessionId, sessionKey));

      this.broadcast({
        name: "agent-complete",
        data: { taskId, sessionKey, summary: result.summary },
      });

      // Always save assistant message to thread — even on abort, so the agent
      // has full context of what it did on subsequent runs
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

        // Persist last token usage to thread for UI on reload
        if (result.lastTokenUsage) {
          await this.db.update(researchThreads).set({
            lastInputTokens: result.lastTokenUsage.inputTokens,
            lastContextWindow: result.lastTokenUsage.contextWindow,
            lastModelName: result.lastTokenUsage.modelName,
          }).where(eq(researchThreads.id, researchInput.threadId));
        }

        // Trigger completion callback for queue processing
        const threadCallback = this.completionCallbacks.get(`thread-${researchInput.threadId}`);
        if (threadCallback) {
          threadCallback(researchInput.threadId);
        }

        // Save compaction marker if context was summarized
        if (result.compactionSummary) {
          await this.db.insert(researchMessages).values({
            threadId: researchInput.threadId,
            role: "system",
            content: result.compactionSummary,
          });
          this.broadcast({
            name: "context-compacted",
            data: { threadId: researchInput.threadId },
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      await this.db
        .update(agentTasks)
        .set({
          status: "failed",
          output: JSON.stringify({ error: message }),
          completedAt: sql`datetime('now')`,
        })
        .where(eq(agentTasks.sessionId, sessionKey));

      this.broadcast({
        name: "agent-activity",
        data: { sessionKey, action: "error", detail: message },
      });

      this.broadcast({
        name: "agent-complete",
        data: { taskId, sessionKey, summary: `Error: ${message}` },
      });

      // Save error as assistant message so the retry loop doesn't see an
      // unanswered user message and re-dispatch infinitely
      const failedInput = input as { threadId?: number };
      if (failedInput.threadId) {
        await this.db.insert(researchMessages).values({
          threadId: failedInput.threadId,
          role: "assistant",
          content: `I encountered an error and couldn't complete this task: ${message}`,
        });
        this.broadcast({
          name: "research.messageComplete",
          data: { threadId: failedInput.threadId },
        });

        const threadCallback = this.completionCallbacks.get(`thread-${failedInput.threadId}`);
        if (threadCallback) {
          threadCallback(failedInput.threadId);
        }
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

  broadcastEvent(event: GatewayEvent): void {
    this.broadcast(event);
  }

  async waitForDrain(maxWaitMs?: number): Promise<void> {
    return this.queue.waitForDrain(maxWaitMs);
  }
}
