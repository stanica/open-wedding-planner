import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./db/schema.js";
import { pushSchema } from "./db/migrate.js";
import { seedCategories } from "./db/seed.js";
import { createWsServer } from "./infra/ws-server.js";
import { Router } from "./infra/router.js";
import { registerAllHandlers } from "./handlers/index.js";
import { ProxyManager } from "./infra/proxy-manager.js";
import { registerShutdownHandlers } from "./infra/process-signal.js";
import {
  getDbPath,
  getDataDir,
  getDeliveryQueueDir,
  getImagesDir,
} from "./config/paths.js";
import { TunnelManager } from "./infra/tunnel-manager.js";
import { registerTunnelHandlers } from "./handlers/tunnel.js";
import { GogManager } from "./infra/gog-manager.js";
import { WhatsAppChannel } from "./channels/whatsapp.js";
import { VapiChannel } from "./channels/vapi.js";
import { DeliveryQueue } from "./infra/delivery-queue.js";
import { registerWhatsAppAuthHandlers } from "./handlers/whatsapp-auth.js";
import { eq } from "drizzle-orm";
import { Orchestrator } from "./agents/orchestrator.js";
import { heartbeatAgent } from "./agents/heartbeat.js";
import { TASK_CONFIGS } from "./agents/task-configs.js";
import { EmbeddingService } from "./db/embeddings.js";
import { registerAgentHandlers } from "./handlers/agents.js";
import { createToolRegistry } from "./tools/index.js";
import { HeartbeatScheduler } from "./infra/heartbeat-scheduler.js";
import { setAIConfig } from "./agents/model-provider.js";
import { setSearchConfig, type SearchProviderType } from "./tools/search.js";
import { aiConfig, searchConfig, voiceCalls } from "./db/schema.js";
import {
  DEFAULT_GATEWAY_PORT,
  GATEWAY_READY_PREFIX,
} from "@wedding-planner/shared";
import type {
  GatewayEvent,
  GatewayStateSnapshot,
} from "@wedding-planner/shared";
import { handleWhatsAppCommand } from "./channels/whatsapp-commands.js";

export interface GatewayOptions {
  port?: number;
  dbPath?: string;
}

export async function startGateway(options: GatewayOptions = {}) {
  const port = options.port ?? DEFAULT_GATEWAY_PORT;
  const dbPath = options.dbPath ?? getDbPath();

  // 1. Create database
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqliteVec.load(sqlite);

  // 2. Push schema + embeddings
  pushSchema(sqlite);
  const embeddingService = new EmbeddingService(sqlite, null);

  // 3. Create Drizzle instance
  const db = drizzle(sqlite, { schema });

  // 4. Seed categories
  await seedCategories(db);

  // 5. Create router, delivery queue, and register handlers
  const router = new Router();
  const proxyManager = new ProxyManager();
  const deliveryQueue = new DeliveryQueue(getDeliveryQueueDir());
  deliveryQueue.recover();
  const imagesDir = getImagesDir();

  // 5b. Create gog manager
  const gogBinDir = path.join(getDataDir(), "bin");
  const gogManager = new GogManager(gogBinDir);

  // Lazy broadcast wrapper — wsServer is created after handler registration,
  // but handlers are only called after startup completes.
  let broadcastFn: ((event: GatewayEvent) => void) | undefined;
  const broadcast = (event: GatewayEvent) => broadcastFn?.(event);

  // Lazy VAPI refs — vapiChannel and config are created after handler registration,
  // but handlers are only called after startup completes.
  let lazyVapiChannel: VapiChannel | null = null;
  let lazyGetVapiConfig: (() => { phoneNumberId: string; assistantId: string } | null) | null =
    null;

  registerAllHandlers(
    router,
    proxyManager,
    deliveryQueue,
    gogManager,
    imagesDir,
    embeddingService,
    sqlite,
    broadcast,
    {
      vapiChannel: {
        createCall: (params) => {
          if (!lazyVapiChannel) throw new Error("VAPI channel not initialized");
          return lazyVapiChannel.createCall(params);
        },
      } as VapiChannel,
      getVapiConfig: () => lazyGetVapiConfig?.() ?? null,
      broadcast,
    },
  );

  // 7c. WhatsApp channel + delivery queue
  const whatsapp = new WhatsAppChannel({ dataDir: getDataDir() }, broadcast);

  // 6. Build state snapshot
  function getState(): GatewayStateSnapshot {
    return {
      version: "0.0.1",
      channels: {
        whatsapp: whatsapp.isConnected() ? "connected" : "disconnected",
        gmail: "disconnected",
        calendar: "disconnected",
      },
    };
  }

  // 7. Start WebSocket server
  let handleVapiWebhook: ((payload: unknown) => void) | null = null;

  const wsServer = await createWsServer({
    port,
    getState,
    router,
    db,
    imagesDir,
    onVapiWebhook: (payload: unknown) => handleVapiWebhook?.(payload),
  });

  broadcastFn = (event) => wsServer.broadcast(event);

  // 7a. VAPI webhook handler
  handleVapiWebhook = async (payload: any) => {
    const message = payload?.message ?? payload;
    const type = message?.type;

    if (type === "status-update") {
      const callStatus = message.status;
      const vapiCallId = message.call?.id;
      if (vapiCallId && callStatus) {
        const [existing] = await db
          .select()
          .from(voiceCalls)
          .where(eq(voiceCalls.vapiCallId, vapiCallId));
        if (existing) {
          await db
            .update(voiceCalls)
            .set({ status: callStatus === "in-progress" ? "in-progress" : callStatus })
            .where(eq(voiceCalls.id, existing.id));
          wsServer.broadcast({
            name: "voice-call-status",
            data: { callId: existing.id, status: callStatus },
          });
        }
      }
    }

    if (type === "end-of-call-report") {
      const call = message.call;
      const vapiCallId = call?.id;
      if (vapiCallId) {
        const [existing] = await db
          .select()
          .from(voiceCalls)
          .where(eq(voiceCalls.vapiCallId, vapiCallId));
        if (existing) {
          await db
            .update(voiceCalls)
            .set({
              status: "ended",
              endedReason: call.endedReason,
              duration: call.duration ?? message.durationSeconds,
              summary: message.analysis?.summary ?? message.artifact?.transcript?.slice(0, 500),
              transcript: message.artifact?.transcript,
              recordingUrl: message.artifact?.recordingUrl,
              structuredData: message.analysis?.structuredData
                ? JSON.stringify(message.analysis.structuredData)
                : null,
              endedAt: call.endedAt ?? new Date().toISOString(),
            })
            .where(eq(voiceCalls.id, existing.id));
          wsServer.broadcast({
            name: "voice-call-ended",
            data: { callId: existing.id, vendorId: existing.vendorId },
          });
        }
      }
    }
  };

  // 7b. Tunnel manager
  const cloudflaredBin = process.env.CLOUDFLARED_PATH ?? "";
  const tunnelManager = new TunnelManager(cloudflaredBin);
  registerTunnelHandlers(router, tunnelManager, port);

  // VAPI dedicated tunnel (auto-start)
  const vapiTunnelManager = new TunnelManager(cloudflaredBin);
  tunnelManager.onStatus((status) => {
    wsServer.broadcast({ name: "tunnel.status", data: status });
  });

  // 7d. Register WhatsApp send function on delivery queue
  deliveryQueue.registerChannel("whatsapp", async (entry) => {
    const payload = entry.payload as {
      communicationId: number;
      to: string;
      text: string;
    };
    await whatsapp.send(payload.to, payload.text);
    // Update communication status to sent
    await db
      .update(schema.communications)
      .set({ status: "sent", sentAt: new Date().toISOString() })
      .where(eq(schema.communications.id, payload.communicationId));
  });

  // 7e. Register WhatsApp auth handlers
  registerWhatsAppAuthHandlers(router, whatsapp);

  // 7f. Auto-connect WhatsApp if saved credentials exist
  if (whatsapp.hasCredentials()) {
    console.log("[WhatsApp] found saved credentials, auto-connecting...");
    whatsapp.connect().catch((err) =>
      console.error("[WhatsApp] auto-connect failed:", err),
    );
  }

  // 8. Load saved AI config and create orchestrator
  const [savedAiConfig] = await db.select().from(aiConfig).limit(1);
  if (savedAiConfig) {
    setAIConfig({
      provider: savedAiConfig.provider as "api-key" | "claude-max",
      model: savedAiConfig.model,
      proxyUrl: savedAiConfig.proxyUrl,
      apiKey: savedAiConfig.apiKey,
    });
  }

  // 8a-ii. Wire embedding function if OpenAI key is configured
  if (savedAiConfig?.openaiApiKey) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { embed } = await import("ai");
    const openai = createOpenAI({ apiKey: savedAiConfig.openaiApiKey });
    embeddingService.setEmbedFn(async (text: string) => {
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: text,
      });
      return embedding;
    });
  }

  // 8b. Load saved search config
  const [savedSearchConfig] = await db.select().from(searchConfig).limit(1);
  if (savedSearchConfig) {
    setSearchConfig({
      provider: savedSearchConfig.provider as SearchProviderType,
      apiKey: savedSearchConfig.apiKey,
    });
  }

  let whatsappActiveThreadId: number | null =
    savedAiConfig?.whatsappActiveThreadId ?? null;

  if (savedAiConfig?.provider === "claude-max") {
    try {
      await proxyManager.start();
      console.log("Claude Max proxy started");
    } catch (err) {
      console.error("Failed to start Claude Max proxy:", err);
    }
  }

  const toolRegistry = createToolRegistry();

  const autoSendGetter = () => {
    const rows = sqlite
      .prepare("SELECT whatsapp_auto_send FROM ai_config LIMIT 1")
      .all() as any[];
    return rows.length > 0 && rows[0].whatsapp_auto_send === 1;
  };

  const googleAutoSendGetter = () => {
    const rows = sqlite
      .prepare("SELECT auto_send FROM google_config LIMIT 1")
      .all() as any[];
    return rows.length > 0 && rows[0].auto_send === 1;
  };

  const getGoogleConfig = () => {
    const rows = sqlite
      .prepare("SELECT account_email, services FROM google_config LIMIT 1")
      .all() as any[];
    return rows[0] ?? null;
  };

  const getVapiConfig = () => {
    const rows = sqlite
      .prepare("SELECT vapi_api_key, vapi_phone_number_id, vapi_assistant_id FROM ai_config LIMIT 1")
      .all() as any[];
    if (!rows.length) return null;
    const r = rows[0];
    if (!r.vapi_api_key || !r.vapi_phone_number_id || !r.vapi_assistant_id) return null;
    return {
      apiKey: r.vapi_api_key,
      phoneNumberId: r.vapi_phone_number_id,
      assistantId: r.vapi_assistant_id,
    };
  };

  const getVapiAutoCall = () => {
    const rows = sqlite
      .prepare("SELECT vapi_auto_call FROM ai_config LIMIT 1")
      .all() as any[];
    return rows.length > 0 && rows[0].vapi_auto_call === 1;
  };

  const vapiConfig = getVapiConfig();
  const vapiChannel = vapiConfig ? new VapiChannel({ apiKey: vapiConfig.apiKey }) : null;

  // Wire up lazy VAPI refs for handler deps
  lazyVapiChannel = vapiChannel;
  lazyGetVapiConfig = () => {
    const cfg = getVapiConfig();
    if (!cfg) return null;
    return { phoneNumberId: cfg.phoneNumberId, assistantId: cfg.assistantId };
  };

  // 8c-ii. Auto-start VAPI tunnel if VAPI is configured
  if (vapiChannel && vapiConfig) {
    vapiTunnelManager.onStatus(async (status) => {
      if (status.state === "running" && status.url) {
        try {
          await vapiChannel.updatePhoneNumberServerUrl(
            vapiConfig.phoneNumberId,
            `${status.url}/vapi/webhook`,
          );
          console.log(`VAPI webhook URL set to: ${status.url}/vapi/webhook`);
        } catch (err) {
          console.error("Failed to update VAPI phone number server URL:", err);
        }
      }
    });
    vapiTunnelManager.start(port).catch((err) => {
      console.error("Failed to start VAPI tunnel:", err);
    });
  }

  const orchestrator = new Orchestrator(
    db,
    (event) => {
      wsServer.broadcast(event);
    },
    toolRegistry,
    undefined,
    sqlite,
    {
      deliveryQueue,
      getAutoSend: autoSendGetter,
      gogManager,
      getGoogleAutoSend: googleAutoSendGetter,
      getGoogleConfig,
      imagesDir,
      embeddingService,
      vapiChannel,
      getVapiAutoCall,
      getVapiConfig: () => {
        const cfg = getVapiConfig();
        if (!cfg) return null;
        return { phoneNumberId: cfg.phoneNumberId, assistantId: cfg.assistantId };
      },
    },
  );

  for (const config of TASK_CONFIGS) {
    orchestrator.registerConfig(config);
  }
  orchestrator.registerAgent(heartbeatAgent);
  registerAgentHandlers(router, orchestrator);

  async function getOrCreateWhatsAppThread(): Promise<number> {
    if (whatsappActiveThreadId) {
      // Verify thread still exists
      const [thread] = await db
        .select()
        .from(schema.researchThreads)
        .where(eq(schema.researchThreads.id, whatsappActiveThreadId));
      if (thread) return whatsappActiveThreadId;
    }

    // Create new thread
    const [thread] = await db
      .insert(schema.researchThreads)
      .values({ title: "WhatsApp" })
      .returning();
    whatsappActiveThreadId = thread.id;
    await db.update(schema.aiConfig).set({ whatsappActiveThreadId: thread.id });
    return thread.id;
  }

  async function setWhatsAppActiveThread(id: number): Promise<void> {
    whatsappActiveThreadId = id;
    await db.update(schema.aiConfig).set({ whatsappActiveThreadId: id });
  }

  // 8c. Register incoming WhatsApp message handler
  whatsapp.onIncoming(async ({ from, body, messageId, selfChat }) => {
    console.log("[WhatsApp] onIncoming:", { from, selfChat, bodyPreview: body.slice(0, 80) });
    if (selfChat) {
      // --- Self-chat: route to research agent ---
      const userJid = whatsapp.getUserJid();
      if (!userJid) {
        console.warn("[WhatsApp] self-chat received but getUserJid() returned null");
        return;
      }

      // Check commands first
      const cmdResult = await handleWhatsAppCommand(body, {
        db,
        sqlite,
        reply: (text: string) => whatsapp.send(userJid, text),
        getActiveThreadId: () => whatsappActiveThreadId,
        setActiveThreadId: setWhatsAppActiveThread,
        getQueueStatus: () => {
          const status = orchestrator.getQueueStatus();
          const running = Object.values(status).reduce(
            (sum, s) => sum + s.active,
            0,
          );
          const pending = Object.values(status).reduce(
            (sum, s) => sum + s.queued,
            0,
          );
          return { running, pending };
        },
      });
      if (cmdResult.handled) return;

      // Get or create active thread
      const threadId = await getOrCreateWhatsAppThread();

      // Save user message to thread
      await db.insert(schema.researchMessages).values({
        threadId,
        role: "user",
        content: body,
      });

      // Notify frontend so it can display the message immediately
      wsServer.broadcast({
        name: "research.messagesChanged",
        data: { threadId },
      });

      // Load full message history
      const history = await db
        .select()
        .from(schema.researchMessages)
        .where(eq(schema.researchMessages.threadId, threadId))
        .orderBy(schema.researchMessages.createdAt)
        .all();

      const agentMessages = history.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      // Dispatch via router — returns { queued: true } if agent already running on this thread
      const result = (await router.handle(db, "agent.research", {
        threadId,
        messages: agentMessages,
      })) as any;

      if (result && !result.queued && result.sessionKey) {
        whatsapp.sendTyping(userJid);
      }

      return;
    }

    // --- Vendor message: existing behavior ---
    // Try direct match first, then resolve phone → LID for each vendor
    let matchedVendors = await db
      .select()
      .from(schema.vendors)
      .where(eq(schema.vendors.contactWhatsapp, from));
    if (matchedVendors.length === 0 && from.endsWith("@lid")) {
      const withPhone = await db.select().from(schema.vendors);
      for (const v of withPhone) {
        if (!v.contactWhatsapp) continue;
        const lid = await whatsapp.resolveLidForPhone(v.contactWhatsapp);
        if (lid && lid.replace(/:\d+@/, "@") === from) {
          matchedVendors = [v];
          break;
        }
      }
    }
    const vendor = matchedVendors[0] ?? null;

    wsServer.broadcast({
      name: "agent-activity",
      data: {
        sessionKey: "whatsapp-incoming",
        action: "message-received",
        detail: `WhatsApp from ${vendor?.name ?? from}: ${body.slice(0, 100)}`,
      },
    });

    if (vendor) {
      const [comm] = await db
        .insert(schema.communications)
        .values({
          vendorId: vendor.id,
          direction: "in",
          channel: "whatsapp",
          bodyOriginal: body,
          status: "received",
          sentAt: new Date().toISOString(),
          threadId: messageId,
        })
        .returning();

      wsServer.broadcast({
        name: "communication-received",
        data: { vendorId: vendor.id, channel: "whatsapp" },
      });
    }
  });

  // Intercept broadcasts to deliver research responses via WhatsApp
  const origBroadcastFn = wsServer.broadcast.bind(wsServer);
  wsServer.broadcast = (event: GatewayEvent) => {
    origBroadcastFn(event);

    // Send agent response to WhatsApp when research completes on active thread
    if (event.name === "research.messageComplete") {
      const { threadId } = event.data as { threadId: number };
      if (threadId === whatsappActiveThreadId) {
        const userJid = whatsapp.getUserJid();
        if (!userJid) return;

        const messages = db
          .select()
          .from(schema.researchMessages)
          .where(eq(schema.researchMessages.threadId, threadId))
          .orderBy(schema.researchMessages.createdAt)
          .all();

        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === "assistant");
        if (!lastAssistant) return;

        const text = lastAssistant.content;
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += 4000) {
          chunks.push(text.slice(i, i + 4000));
        }
        chunks
          .reduce(
            (p, chunk) => p.then(() => whatsapp.send(userJid, chunk)),
            Promise.resolve(),
          )
          .then(() => whatsapp.stopTyping(userJid));
      }
    }

    // Refresh typing indicator on tool calls (WhatsApp expires composing after ~25s)
    if (event.name === "agent-activity") {
      const data = event.data as { sessionKey: string; action: string };
      if (
        data.sessionKey.startsWith("research-") &&
        data.action === "tool-call"
      ) {
        const userJid = whatsapp.getUserJid();
        if (userJid && whatsappActiveThreadId) {
          whatsapp.sendTyping(userJid);
        }
      }
    }

    // Send error message to WhatsApp
    if (event.name === "agent-activity") {
      const data = event.data as { sessionKey: string; action: string };
      if (data.action === "error" && whatsappActiveThreadId) {
        const userJid = whatsapp.getUserJid();
        if (userJid) {
          whatsapp
            .send(userJid, "Something went wrong, try again.")
            .then(() => whatsapp.stopTyping(userJid));
        }
      }
    }
  };

  router.register("tools.list", async () => {
    return toolRegistry.listAll();
  });

  // 9. Start heartbeat scheduler
  const heartbeat = new HeartbeatScheduler(
    orchestrator,
    (event) => wsServer.broadcast(event),
    db,
  );
  heartbeat.start();
  deliveryQueue.startProcessing(5000);

  // 10. Print ready signal
  console.log(`${GATEWAY_READY_PREFIX}${port}`);

  // Return cleanup function
  async function stop() {
    await proxyManager.stop();
    await tunnelManager.stop();
    await vapiTunnelManager.stop();
    heartbeat.stop();
    // Drain in-flight work (max 30s)
    await orchestrator.waitForDrain(30_000);
    await wsServer.close();
    deliveryQueue.stopProcessing();
    whatsapp.disconnect();
    sqlite.close();
  }

  // Safety net: "exit" handler is synchronous-only, so use killSync
  process.on("exit", () => {
    proxyManager.killSync();
    tunnelManager.killSync();
    vapiTunnelManager.killSync();
  });

  return stop;
}

// If run directly (not imported as module)
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/index.js") ||
    process.argv[1].endsWith("/index.mjs"));

if (isMainModule) {
  const stop = await startGateway();
  registerShutdownHandlers(stop);
}
