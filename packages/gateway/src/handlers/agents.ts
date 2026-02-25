import type { Router } from "../infra/router.js";
import type { Orchestrator } from "../agents/orchestrator.js";

export function registerAgentHandlers(router: Router, orchestrator: Orchestrator) {
  router.register("agent.research", async (_db, params) => {
    const { query } = params as { query: string };
    if (!query || typeof query !== "string") {
      throw new Error("query is required");
    }
    const { taskId, sessionKey } = await orchestrator.dispatch("research", { query });
    return { taskId, sessionKey };
  });

  router.register("agent.status", async (_db) => {
    return orchestrator.getQueueStatus();
  });
}
