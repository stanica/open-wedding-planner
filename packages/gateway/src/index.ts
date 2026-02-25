import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./db/schema.js";
import { pushSchema } from "./db/migrate.js";
import { seedCategories } from "./db/seed.js";
import { createWsServer } from "./infra/ws-server.js";
import { Router } from "./infra/router.js";
import { registerAllHandlers } from "./handlers/index.js";
import { registerShutdownHandlers } from "./infra/process-signal.js";
import { getDbPath } from "./config/paths.js";
import { Orchestrator } from "./agents/orchestrator.js";
import { researchAgent, mockResearchAgent } from "./agents/research.js";
import { heartbeatAgent, mockHeartbeatAgent } from "./agents/heartbeat.js";
import { outreachAgent, mockOutreachAgent } from "./agents/outreach.js";
import { parserAgent, mockParserAgent } from "./agents/parser.js";
import { translationAgent, mockTranslationAgent } from "./agents/translation.js";
import { createEmbeddingsTable } from "./db/embeddings.js";
import { registerAgentHandlers } from "./handlers/agents.js";
import { HeartbeatScheduler } from "./infra/heartbeat-scheduler.js";
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
  registerAllHandlers(router);

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

  // 8. Create orchestrator and register agents
  const orchestrator = new Orchestrator(db, (event) => {
    wsServer.broadcast({ type: "event", seq: Date.now(), event });
  });
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  orchestrator.registerAgent(hasApiKey ? researchAgent : mockResearchAgent);
  orchestrator.registerAgent(hasApiKey ? heartbeatAgent : mockHeartbeatAgent);
  orchestrator.registerAgent(hasApiKey ? outreachAgent : mockOutreachAgent);
  orchestrator.registerAgent(hasApiKey ? parserAgent : mockParserAgent);
  orchestrator.registerAgent(hasApiKey ? translationAgent : mockTranslationAgent);
  registerAgentHandlers(router, orchestrator);

  // 9. Start heartbeat scheduler
  const heartbeat = new HeartbeatScheduler(
    orchestrator,
    (event) => wsServer.broadcast({ type: "event", seq: Date.now(), event }),
  );
  heartbeat.start();

  // 10. Print ready signal
  console.log(`${GATEWAY_READY_PREFIX}${port}`);

  // Return cleanup function
  async function stop() {
    heartbeat.stop();
    // Drain in-flight work (max 30s)
    await orchestrator.waitForDrain(30_000);
    await wsServer.close();
    sqlite.close();
  }

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
