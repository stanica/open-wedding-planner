import { eq } from "drizzle-orm";
import { researchMessages } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";
import type { Orchestrator } from "../agents/orchestrator.js";

// Track threads with running agents
const activeThreads = new Set<number>();

export function registerAgentHandlers(router: Router, orchestrator: Orchestrator) {
  router.register("agent.research", async (db, params) => {
    const { threadId, messages } = params as { threadId: number; messages: Array<{ role: string; content: string }> };
    if (!threadId || !messages) {
      throw new Error("threadId and messages are required");
    }

    // If agent already running on this thread, message is already saved to DB — just return queued status
    if (activeThreads.has(threadId)) {
      return { queued: true, threadId };
    }

    return dispatchResearch(db, orchestrator, threadId, messages);
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

  router.register("agent.action", async (_db, params) => {
    const { communicationId, instruction, history } = params as {
      communicationId: number;
      instruction: string;
      history?: Array<{ role: string; content: string }>;
    };

    // Build context message with the communication content
    const contextMessages = [
      {
        role: "user",
        content: `Communication ID: ${communicationId}\n\nUser instruction: ${instruction}`,
      },
      ...(history ?? []).slice(0, -1), // Include prior conversation turns if any
    ];

    const { taskId, sessionKey } = await orchestrator.dispatch("action", {
      communicationId,
      instruction,
      messages: contextMessages,
    });
    return { taskId, sessionKey };
  });

  router.register("agent.status", async (_db) => {
    return orchestrator.getQueueStatus();
  });
}

async function dispatchResearch(
  db: Db,
  orchestrator: Orchestrator,
  threadId: number,
  messages: Array<{ role: string; content: string }>,
) {
  // Find the last compaction marker (role: "system") in the message list
  let compactedMessages: unknown[];
  const lastSystemIdx = messages.findLastIndex((m) => m.role === "system");
  if (lastSystemIdx !== -1) {
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

  activeThreads.add(threadId);

  // Register completion callback to check for queued messages
  orchestrator.onThreadComplete(threadId, async (tid) => {
    activeThreads.delete(tid);

    // Check for user messages after the last assistant response
    const allMessages = await db
      .select()
      .from(researchMessages)
      .where(eq(researchMessages.threadId, tid))
      .orderBy(researchMessages.createdAt)
      .all();

    const lastAssistantIdx = allMessages.findLastIndex((m) => m.role === "assistant");
    const queued = allMessages.slice(lastAssistantIdx + 1).filter((m) => m.role === "user");

    if (queued.length > 0) {
      // Re-dispatch with full message history
      const fullHistory = allMessages.map((m) => ({ role: m.role, content: m.content }));
      dispatchResearch(db, orchestrator, tid, fullHistory);
    } else {
      orchestrator.removeThreadCallback(tid);
    }
  });

  const { taskId, sessionKey } = await orchestrator.dispatch("research", { threadId, messages: compactedMessages });
  return { taskId, sessionKey };
}
