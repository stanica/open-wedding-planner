import { ToolRegistry } from "./registry.js";
import { searchTool } from "./search.js";
import { scraperTool } from "./scraper.js";
import { pdfTool } from "./pdf.js";
import { createCmdTool } from "./cmd.js";
import { createDbQueryTool } from "./db-query.js";
import { createDbSchemaTool } from "./db-schema.js";
import { makeCreateVendorTool } from "./create-vendor.js";
import { makeAddVendorImagesTool } from "./add-vendor-images.js";
import { makeSendWhatsAppTool } from "./send-whatsapp.js";
import { makeGogTool } from "./gog.js";
import { makeDispatchTool } from "./dispatch.js";
import { makeAwaitTasksTool } from "./await-tasks.js";
import { makeSemanticSearchTool } from "./semantic-search.js";
import { makeVapiCallTool } from "./vapi-call.js";
import { tool } from "ai";
import { z } from "zod";

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "search",
    description: "Search the web for wedding venues and vendor information",
    category: "web",
    tool: searchTool,
  });

  registry.register({
    name: "scrape",
    description: "Extract text and contact info from a web page",
    category: "web",
    tool: scraperTool,
  });

  registry.register({
    name: "parsePdf",
    description: "Download and extract text from a PDF document",
    category: "web",
    tool: pdfTool,
  });

  registry.registerFactory("cmd", {
    description: "Execute a command-line program in the workspace directory",
    category: "system",
    create: (ctx: unknown) => {
      const { workspaceDir, permissionCallbacks } = ctx as any;
      return createCmdTool(workspaceDir, permissionCallbacks);
    },
  });

  registry.registerFactory("dbQuery", {
    description: "Execute a SQL query against the application database",
    category: "database",
    create: (ctx: unknown) => {
      const { sqlite, permissionCallbacks } = ctx as any;
      return createDbQueryTool(sqlite, permissionCallbacks);
    },
  });

  registry.registerFactory("dbSchema", {
    description: "Inspect the database schema (tables, columns, foreign keys)",
    category: "database",
    create: (ctx: unknown) => {
      const { sqlite } = ctx as any;
      return createDbSchemaTool(sqlite);
    },
  });

  registry.registerFactory("createVendor", {
    description: "Create a new vendor record in the database",
    category: "database",
    create: (ctx: unknown) => makeCreateVendorTool(ctx as any),
  });

  registry.registerFactory("addVendorImages", {
    description: "Add images to a vendor's photo gallery",
    category: "database",
    create: (ctx: unknown) => {
      const { db, emit, imagesDir } = ctx as any;
      return makeAddVendorImagesTool({ db, emit, imagesDir });
    },
  });

  registry.registerFactory("sendWhatsApp", {
    description: "Send a WhatsApp message to a vendor",
    category: "messaging",
    create: (ctx: unknown) => {
      const { db, emit, deliveryQueue, getAutoSend } = ctx as any;
      return makeSendWhatsAppTool({
        db,
        emit,
        getAutoSend: getAutoSend ?? (() => false),
        enqueue: deliveryQueue
          ? (channel: string, vendorId: number, payload: unknown) =>
              (deliveryQueue as any).enqueue(channel, vendorId, payload)
          : () => {
              throw new Error("Delivery queue not available");
            },
      });
    },
  });

  registry.registerFactory("gog", {
    description: "Run Google Workspace commands via gog CLI",
    category: "messaging",
    create: (ctx: unknown) => {
      const { gogManager, getGoogleConfig, getGoogleAutoSend, permissionCallbacks } =
        ctx as any;
      const googleConfig = getGoogleConfig?.();
      if (!gogManager || !googleConfig?.account_email) {
        return tool({
          description: "Google services are not connected. Ask the user to connect in Settings.",
          inputSchema: z.object({}),
          execute: async () => ({ error: "Google services not connected. The user needs to connect their Google account in Settings." }),
        });
      }
      return makeGogTool({
        gogManager,
        accountEmail: googleConfig.account_email,
        services: googleConfig.services ?? "gmail",
        getAutoSend: getGoogleAutoSend ?? (() => false),
        permissionCallbacks,
      });
    },
  });

  registry.registerFactory("dispatch", {
    description: "Dispatch a browser subagent to research a website",
    category: "agent",
    create: (ctx: unknown) => {
      const { orchestrator, parentSessionKey } = ctx as any;
      return makeDispatchTool({ orchestrator, parentSessionKey });
    },
  });

  registry.registerFactory("awaitTasks", {
    description: "Wait for dispatched subagent tasks to complete",
    category: "agent",
    create: (ctx: unknown) => {
      const { db, orchestrator, parentSessionKey } = ctx as any;
      return makeAwaitTasksTool({ db, orchestrator, parentSessionKey });
    },
  });

  registry.registerFactory("semanticSearch", {
    description: "Search all data using natural language semantic similarity",
    category: "database",
    create: (ctx: unknown) => {
      const { embeddingService } = ctx as any;
      if (!embeddingService) {
        return tool({
          description: "Semantic search (not configured)",
          inputSchema: z.object({ query: z.string() }),
          execute: async () => ({ error: "Embedding service not available" }),
        });
      }
      return makeSemanticSearchTool(embeddingService);
    },
  });

  registry.registerFactory("makeVapiCall", {
    description: "Initiate a voice call to a vendor via VAPI",
    category: "messaging",
    create: (ctx: unknown) => {
      const { db, emit, getVapiConfig, getVapiChannel, broadcast } = ctx as any;
      return makeVapiCallTool({
        db,
        emit,
        createCall: (params) => {
          const ch = getVapiChannel?.();
          if (!ch) throw new Error("VAPI is not configured. Set API key, phone number ID, and assistant ID in Settings.");
          return ch.createCall(params);
        },
        getCall: (callId) => {
          const ch = getVapiChannel?.();
          if (!ch) throw new Error("VAPI is not configured.");
          return ch.getCall(callId);
        },
        getVapiConfig: getVapiConfig ?? (() => null),
        broadcast,
      });
    },
  });

  return registry;
}

export { ToolRegistry } from "./registry.js";
