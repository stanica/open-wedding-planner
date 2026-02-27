import type { Router } from "../infra/router.js";
import type { Orchestrator } from "../agents/orchestrator.js";

export function registerAgentHandlers(router: Router, orchestrator: Orchestrator) {
  router.register("agent.research", async (_db, params) => {
    const { threadId, messages } = params as { threadId: number; messages: Array<{ role: string; content: string }> };
    if (!threadId || !messages) {
      throw new Error("threadId and messages are required");
    }

    // Find the last compaction marker (role: "system") in the message list
    let compactedMessages: unknown[];
    const lastSystemIdx = messages.findLastIndex((m) => m.role === "system");
    if (lastSystemIdx !== -1) {
      // Use summary as first user message + all messages after the marker
      const summary = messages[lastSystemIdx].content;
      const postMarker = messages.slice(lastSystemIdx + 1)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));
      compactedMessages = [
        { role: "user", content: `Previous conversation summary:\n\n${summary}` },
        ...(postMarker.length > 0 ? postMarker : []),
      ];
    } else {
      compactedMessages = messages;
    }

    const { taskId, sessionKey } = await orchestrator.dispatch("research", { threadId, messages: compactedMessages });
    return { taskId, sessionKey };
  });

  router.register("agent.stop", async (_db, params) => {
    const { sessionKey } = params as { sessionKey: string };
    const stopped = orchestrator.abortTask(sessionKey);
    return { ok: stopped };
  });

  router.register("research.permissionResponse", async (_db, params) => {
    const { requestId, response } = params as { requestId: string; response: string };
    orchestrator.resolvePermission(requestId, response as any);
    return { ok: true };
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
