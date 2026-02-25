import { eq, and, isNull, sql, lt } from "drizzle-orm";
import { agentTasks, communications } from "../db/schema.js";
import type { BaseAgent, AgentContext, AgentResult } from "./base-agent.js";

/**
 * Heartbeat agent — periodically checks for:
 * 1. Agent tasks stuck in "running" for > 10 minutes
 * 2. Incoming communications that haven't been parsed
 * 3. Stalled research tasks (pending for > 30 minutes)
 */
export const heartbeatAgent: BaseAgent = {
  name: "heartbeat",

  async run(ctx: AgentContext): Promise<AgentResult> {
    ctx.emit("starting", "Running periodic health check");

    const issues: string[] = [];

    // 1. Check for stalled running tasks (running > 10 min)
    const stalledTasks = await ctx.db
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.status, "running"),
          lt(
            agentTasks.createdAt,
            sql`datetime('now', '-10 minutes')`,
          ),
        ),
      );

    if (stalledTasks.length > 0) {
      ctx.emit("warning", `Found ${stalledTasks.length} stalled task(s)`);
      // Mark them as failed so they can be retried
      for (const task of stalledTasks) {
        await ctx.db
          .update(agentTasks)
          .set({
            status: "failed",
            output: JSON.stringify({ error: "Stalled — marked by heartbeat" }),
            completedAt: sql`datetime('now')`,
          })
          .where(eq(agentTasks.id, task.id));
      }
      issues.push(`Marked ${stalledTasks.length} stalled task(s) as failed`);
    }

    // 2. Check for unparsed incoming communications
    const unparsed = await ctx.db
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.direction, "in"),
          eq(communications.status, "received"),
          isNull(communications.parsedAt),
        ),
      );

    if (unparsed.length > 0) {
      ctx.emit("found", `${unparsed.length} unparsed incoming message(s)`);
      issues.push(`${unparsed.length} incoming message(s) need parsing`);
    }

    // 3. Check for stalled pending tasks (pending > 30 min)
    const stalledPending = await ctx.db
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.status, "pending"),
          lt(
            agentTasks.createdAt,
            sql`datetime('now', '-30 minutes')`,
          ),
        ),
      );

    if (stalledPending.length > 0) {
      ctx.emit(
        "warning",
        `${stalledPending.length} task(s) pending for >30 minutes`,
      );
      issues.push(
        `${stalledPending.length} task(s) pending for over 30 minutes`,
      );
    }

    if (issues.length === 0) {
      ctx.emit("complete", "All systems healthy");
    } else {
      ctx.emit("complete", `Found ${issues.length} issue(s)`);
    }

    return {
      summary:
        issues.length === 0
          ? "Health check passed — no issues found"
          : `Health check found ${issues.length} issue(s): ${issues.join("; ")}`,
      data: { issues, stalledCount: stalledTasks.length, unparsedCount: unparsed.length },
    };
  },
};

export const mockHeartbeatAgent: BaseAgent = {
  name: "heartbeat",

  async run(ctx: AgentContext): Promise<AgentResult> {
    ctx.emit("starting", "Running periodic health check");
    ctx.emit("complete", "All systems healthy");

    return {
      summary: "Health check passed (mock)",
      data: { issues: [], stalledCount: 0, unparsedCount: 0 },
    };
  },
};
