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
import { getDbPath, getDataDir, getDeliveryQueueDir } from "./config/paths.js";
import { WhatsAppChannel } from "./channels/whatsapp.js";
import { DeliveryQueue } from "./infra/delivery-queue.js";
import { registerWhatsAppAuthHandlers } from "./handlers/whatsapp-auth.js";
import { eq } from "drizzle-orm";
import { Orchestrator } from "./agents/orchestrator.js";
import { heartbeatAgent } from "./agents/heartbeat.js";
import { TASK_CONFIGS } from "./agents/task-configs.js";
import { createEmbeddingsTable } from "./db/embeddings.js";
import { registerAgentHandlers } from "./handlers/agents.js";
import { createToolRegistry } from "./tools/index.js";
import { HeartbeatScheduler } from "./infra/heartbeat-scheduler.js";
import { setAIConfig } from "./agents/model-provider.js";
import { setSearchConfig, type SearchProviderType } from "./tools/search.js";
import { aiConfig, searchConfig } from "./db/schema.js";
import {
  DEFAULT_GATEWAY_PORT,
  GATEWAY_READY_PREFIX,
} from "@wedding-planner/shared";
import type { GatewayStateSnapshot } from "@wedding-planner/shared";

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
  createEmbeddingsTable(sqlite);

  // 3. Create Drizzle instance
  const db = drizzle(sqlite, { schema });

  // 4. Seed categories
  await seedCategories(db);

  // 5. Create router and register handlers
  const router = new Router();
  const proxyManager = new ProxyManager();
  registerAllHandlers(router, proxyManager);

  // 6. Build state snapshot
  function getState(): GatewayStateSnapshot {
    return {
      version: "0.0.1",
      channels: {
        whatsapp: "disconnected",
        gmail: "disconnected",
        calendar: "disconnected",
      },
    };
  }

  // 7. Start WebSocket server
  const wsServer = await createWsServer({ port, getState, router, db });

  // 7b. WhatsApp channel + delivery queue
  const whatsapp = new WhatsAppChannel(
    { dataDir: getDataDir() },
    (event) => wsServer.broadcast(event),
  );

  const deliveryQueue = new DeliveryQueue(getDeliveryQueueDir());
  deliveryQueue.recover();

  // 7c. Register WhatsApp send function on delivery queue
  deliveryQueue.registerChannel("whatsapp", async (entry) => {
    const payload = entry.payload as { communicationId: number; to: string; text: string };
    await whatsapp.send(payload.to, payload.text);
    // Update communication status to sent
    await db
      .update(schema.communications)
      .set({ status: "sent", sentAt: new Date().toISOString() })
      .where(eq(schema.communications.id, payload.communicationId));
  });

  // 7d. Register WhatsApp auth handlers
  registerWhatsAppAuthHandlers(router, whatsapp);

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

  // 8b. Load saved search config
  const [savedSearchConfig] = await db.select().from(searchConfig).limit(1);
  if (savedSearchConfig) {
    setSearchConfig({
      provider: savedSearchConfig.provider as SearchProviderType,
      apiKey: savedSearchConfig.apiKey,
    });
  }

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
    const rows = sqlite.prepare("SELECT whatsapp_auto_send FROM ai_config LIMIT 1").all() as any[];
    return rows.length > 0 && rows[0].whatsapp_auto_send === 1;
  };

  const orchestrator = new Orchestrator(db, (event) => {
    wsServer.broadcast(event);
  }, toolRegistry, undefined, sqlite, {
    deliveryQueue,
    getAutoSend: autoSendGetter,
  });

  for (const config of TASK_CONFIGS) {
    orchestrator.registerConfig(config);
  }
  orchestrator.registerAgent(heartbeatAgent);
  registerAgentHandlers(router, orchestrator);

  // 8c. Register incoming WhatsApp message handler
  whatsapp.onIncoming(async ({ from, body, messageId }) => {
    // Match phone to vendor
    const matchedVendors = await db
      .select()
      .from(schema.vendors)
      .where(eq(schema.vendors.contactWhatsapp, from));
    const vendor = matchedVendors[0] ?? null;

    wsServer.broadcast({
      name: "agent-activity",
      data: {
        sessionKey: "whatsapp-incoming",
        action: "message-received",
        detail: `WhatsApp from ${vendor?.name ?? from}: ${body.slice(0, 100)}`,
      },
    });

    // Only create communication record if vendor matched (FK constraint)
    if (vendor) {
      const [comm] = await db
        .insert(schema.communications)
        .values({
          vendorId: vendor.id,
          direction: "in",
          channel: "whatsapp",
          bodyOriginal: body,
          status: "received",
          threadId: messageId,
        })
        .returning();

      // Auto-dispatch parser agent
      orchestrator.dispatch("parse", {
        communicationId: comm.id,
        vendorId: vendor.id,
        vendorName: vendor.name,
        messageBody: body,
      });
    }
  });

  router.register("tools.list", async () => {
    return toolRegistry.listAll();
  });

  // 9. Start heartbeat scheduler
  const heartbeat = new HeartbeatScheduler(
    orchestrator,
    (event) => wsServer.broadcast(event),
  );
  heartbeat.start();
  deliveryQueue.startProcessing(5000);

  // 10. Print ready signal
  console.log(`${GATEWAY_READY_PREFIX}${port}`);

  // Return cleanup function
  async function stop() {
    await proxyManager.stop();
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
