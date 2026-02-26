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
import { getDbPath } from "./config/paths.js";
import { Orchestrator } from "./agents/orchestrator.js";
import { researchAgent } from "./agents/research.js";
import { heartbeatAgent } from "./agents/heartbeat.js";
import { outreachAgent } from "./agents/outreach.js";
import { parserAgent } from "./agents/parser.js";
import { translationAgent } from "./agents/translation.js";
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

  // 8. Load saved AI config and create orchestrator
  const [savedAiConfig] = await db.select().from(aiConfig).limit(1);
  if (savedAiConfig) {
    setAIConfig({
      provider: savedAiConfig.provider as "api-key" | "claude-max",
      model: savedAiConfig.model,
      proxyUrl: savedAiConfig.proxyUrl,
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
  const orchestrator = new Orchestrator(db, (event) => {
    wsServer.broadcast(event);
  }, toolRegistry);
  orchestrator.registerAgent(researchAgent);
  orchestrator.registerAgent(heartbeatAgent);
  orchestrator.registerAgent(outreachAgent);
  orchestrator.registerAgent(parserAgent);
  orchestrator.registerAgent(translationAgent);
  registerAgentHandlers(router, orchestrator);

  router.register("tools.list", async () => {
    return toolRegistry.listAll();
  });

  // 9. Start heartbeat scheduler
  const heartbeat = new HeartbeatScheduler(
    orchestrator,
    (event) => wsServer.broadcast(event),
  );
  heartbeat.start();

  // 10. Print ready signal
  console.log(`${GATEWAY_READY_PREFIX}${port}`);

  // Return cleanup function
  async function stop() {
    await proxyManager.stop();
    heartbeat.stop();
    // Drain in-flight work (max 30s)
    await orchestrator.waitForDrain(30_000);
    await wsServer.close();
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
