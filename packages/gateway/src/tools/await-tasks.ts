import { tool } from "ai";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { agentTasks } from "../db/schema.js";
import type { Db } from "../infra/router.js";

export interface AwaitTasksContext {
  db: Db;
}

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];
const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes

export function makeAwaitTasksTool(ctx: AwaitTasksContext) {
  return tool({
    description:
      "Wait for one or more dispatched subagent tasks to complete. Blocks until all tasks finish (or fail/cancel). Returns the summary from each task.",
    inputSchema: z.object({
      taskIds: z.array(z.string()).describe("Task IDs returned by the dispatch tool"),
    }),
    execute: async ({ taskIds }, { abortSignal }) => {
      const deadline = Date.now() + MAX_WAIT_MS;

      while (Date.now() < deadline) {
        if (abortSignal?.aborted) break;

        const rows = await ctx.db
          .select()
          .from(agentTasks)
          .where(inArray(agentTasks.sessionId, taskIds));

        const allDone = rows.every((r) => TERMINAL_STATUSES.includes(r.status));

        if (allDone && rows.length === taskIds.length) {
          return {
            results: rows.map((r) => {
              const output = r.output ? JSON.parse(r.output) : {};
              return {
                taskId: r.sessionId ?? String(r.id),
                status: r.status,
                summary: output.summary ?? undefined,
                error: output.error ?? undefined,
              };
            }),
          };
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // Timeout or aborted — return partial results
      const rows = await ctx.db
        .select()
        .from(agentTasks)
        .where(inArray(agentTasks.sessionId, taskIds));

      return {
        results: rows.map((r) => {
          const output = r.output ? JSON.parse(r.output) : {};
          return {
            taskId: r.sessionId ?? String(r.id),
            status: r.status,
            summary: output.summary ?? undefined,
            error: r.status === "running" ? "Timed out waiting for completion" : output.error,
          };
        }),
      };
    },
  });
}
