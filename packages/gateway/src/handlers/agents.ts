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

  router.register("agent.outreach", async (_db, params) => {
    const { vendorId, channel, customInstructions } = params as {
      vendorId: number;
      channel: "email" | "whatsapp";
      customInstructions?: string;
    };
    const { taskId, sessionKey } = await orchestrator.dispatch(
      "outreach",
      { vendorId, channel, customInstructions },
      { vendorId },
    );
    return { taskId, sessionKey };
  });

  router.register("agent.parse", async (_db, params) => {
    const { communicationId } = params as { communicationId: number };
    const { taskId, sessionKey } = await orchestrator.dispatch("parse", {
      communicationId,
    });
    return { taskId, sessionKey };
  });

  router.register("agent.translate", async (_db, params) => {
    const { text, from, to } = params as {
      text: string;
      from?: string;
      to: string;
    };
    const { taskId, sessionKey } = await orchestrator.dispatch("translation", {
      text,
      from,
      to,
    });
    return { taskId, sessionKey };
  });

  router.register("agent.status", async (_db) => {
    return orchestrator.getQueueStatus();
  });
}
