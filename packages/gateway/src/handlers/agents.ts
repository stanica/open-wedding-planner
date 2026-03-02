import { eq, desc } from "drizzle-orm";
import { generateText } from "ai";
import { researchMessages, communications, vendors, voiceCalls } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";
import type { Orchestrator } from "../agents/orchestrator.js";
import { getSummarizationModel, setAIConfig, getAIConfig } from "../agents/model-provider.js";

// Track threads with running agents
const activeThreads = new Set<number>();
const threadSessionKeys = new Map<number, string>();

export function registerAgentHandlers(router: Router, orchestrator: Orchestrator) {
  router.register("agent.research", async (db, params) => {
    const { threadId, messages } = params as { threadId: number; messages: Array<{ role: string; content: string }> };
    if (!threadId || !messages) {
      throw new Error("threadId and messages are required");
    }

    // If agent already running on this thread, check if we can interrupt it
    if (activeThreads.has(threadId)) {
      const sessionKey = threadSessionKeys.get(threadId);
      if (sessionKey && orchestrator.isInterruptible(sessionKey)) {
        orchestrator.abortTask(sessionKey, "interrupt");
      }
      return { queued: true, threadId };
    }

    return dispatchResearch(db, orchestrator, threadId, messages);
  });

  router.register("agent.stop", async (_db, params) => {
    const { sessionKey } = params as { sessionKey: string };
    const stopped = await orchestrator.abortTask(sessionKey);
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

  router.register("agent.action", async (db, params) => {
    const { communicationId, vendorId, instruction, history } = params as {
      communicationId?: number;
      vendorId?: number;
      instruction: string;
      history?: Array<{ role: string; content: string }>;
    };

    // Fetch the full email thread for this vendor to give the agent complete context
    let contextText = "";
    const targetVendorId = vendorId ?? (communicationId
      ? (await db.select({ vendorId: communications.vendorId }).from(communications).where(eq(communications.id, communicationId)))[0]?.vendorId
      : undefined);

    if (targetVendorId) {
      const [vendor] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, targetVendorId));
      const thread = await db
        .select({
          id: communications.id,
          direction: communications.direction,
          channel: communications.channel,
          subject: communications.subject,
          bodyOriginal: communications.bodyOriginal,
          sentAt: communications.sentAt,
        })
        .from(communications)
        .where(eq(communications.vendorId, targetVendorId))
        .orderBy(communications.sentAt);

      contextText = `## Vendor: ${vendor?.name ?? "Unknown"} (ID: ${targetVendorId})\n\n`;
      contextText += `## Full email thread (${thread.length} messages):\n\n`;
      for (const msg of thread) {
        const dir = msg.direction === "out" ? "SENT" : "RECEIVED";
        const date = msg.sentAt ? new Date(msg.sentAt).toLocaleString() : "unknown date";
        contextText += `--- ${dir} | ${date} ---\n`;
        if (msg.subject) contextText += `Subject: ${msg.subject}\n`;
        contextText += `${msg.bodyOriginal}\n\n`;
      }
    }

    const contextMessages = [
      {
        role: "user",
        content: `${contextText}\nUser instruction: ${instruction}`,
      },
      ...(history ?? []).slice(0, -1),
    ];

    const { taskId, sessionKey } = await orchestrator.dispatch("action", {
      communicationId,
      vendorId: targetVendorId,
      instruction,
      messages: contextMessages,
    });
    return { taskId, sessionKey };
  });

  router.register("agent.callAction", async (db, params) => {
    const { callId, instruction, history } = params as {
      callId: number;
      instruction: string;
      history?: Array<{ role: string; content: string }>;
    };

    const [call] = await db
      .select()
      .from(voiceCalls)
      .where(eq(voiceCalls.id, callId));

    if (!call) throw new Error(`Voice call ${callId} not found`);

    let vendorName = "Unknown";
    if (call.vendorId) {
      const [vendor] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, call.vendorId));
      vendorName = vendor?.name ?? "Unknown";
    }

    let contextText = `## Voice Call with ${vendorName}\n`;
    contextText += `Phone: ${call.phoneNumber}\n`;
    contextText += `Status: ${call.status}\n`;
    if (call.createdAt) contextText += `Date: ${call.createdAt}\n`;
    if (call.duration) contextText += `Duration: ${Math.floor(call.duration / 60)}m ${call.duration % 60}s\n`;
    if (call.instructions) contextText += `\n## Call Instructions\n${call.instructions}\n`;
    if (call.summary) contextText += `\n## Call Summary\n${call.summary}\n`;
    if (call.transcript) contextText += `\n## Full Transcript\n${call.transcript}\n`;
    if (call.structuredData) contextText += `\n## Structured Data\n${call.structuredData}\n`;

    const contextMessages = [
      {
        role: "user",
        content: `${contextText}\nUser instruction: ${instruction}`,
      },
      ...(history ?? []).slice(0, -1),
    ];

    const { taskId, sessionKey } = await orchestrator.dispatch("action", {
      callId,
      vendorId: call.vendorId ?? undefined,
      instruction,
      messages: contextMessages,
    });
    return { taskId, sessionKey };
  });

  router.register("agent.status", async (_db) => {
    return orchestrator.getQueueStatus();
  });

  router.register("research.compact", async (db, params) => {
    const { threadId } = params as { threadId: number };
    if (!threadId) throw new Error("threadId is required");

    const allMessages = await db
      .select()
      .from(researchMessages)
      .where(eq(researchMessages.threadId, threadId))
      .orderBy(researchMessages.createdAt)
      .all();

    if (allMessages.length === 0) {
      return { ok: false, reason: "No messages to compact" };
    }

    const messageText = allMessages
      .filter((m) => m.role !== "system")
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");

    const model = await getSummarizationModel();
    const { text: summary } = await generateText({
      model,
      system: `You are summarizing a conversation between a user and a wedding planning research assistant. Produce a concise summary that preserves:
- All vendor names, pricing, and contact details discovered
- Key decisions and preferences expressed by the user
- Outstanding questions or next steps
- Any important context about the wedding (date, location, guest count, budget)

Be thorough but concise. This summary will replace the conversation history for future interactions.`,
      messages: [{ role: "user", content: messageText }],
    });

    await db.insert(researchMessages).values({
      threadId,
      role: "system",
      content: summary,
    });

    orchestrator.broadcastEvent({
      name: "context-compacted",
      data: { threadId },
    });

    return { ok: true };
  });

  router.register("research.clear", async (db, params) => {
    const { threadId } = params as { threadId: number };
    if (!threadId) throw new Error("threadId is required");

    await db
      .delete(researchMessages)
      .where(eq(researchMessages.threadId, threadId));

    return { ok: true };
  });

  router.register("research.switchModel", async (_db, params) => {
    const { model } = params as { model: string };
    if (!model) throw new Error("model name is required");

    setAIConfig({ model });
    const config = getAIConfig();
    return { ok: true, model: config.model };
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
    threadSessionKeys.delete(tid);

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
  threadSessionKeys.set(threadId, sessionKey);
  return { taskId, sessionKey };
}
