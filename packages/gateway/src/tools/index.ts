import { ToolRegistry } from "./registry.js";
import { searchTool } from "./search.js";
import { scraperTool } from "./scraper.js";
import { browserTool } from "./browser.js";
import { pdfTool } from "./pdf.js";
import { createCmdTool } from "./cmd.js";
import { createDbQueryTool } from "./db-query.js";
import { createDbSchemaTool } from "./db-schema.js";
import { makeCreateVendorTool } from "./create-vendor.js";
import { makeSendWhatsAppTool } from "./send-whatsapp.js";

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
    name: "browse",
    description: "Load a JavaScript-heavy web page using a headless browser",
    category: "web",
    tool: browserTool,
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

  return registry;
}

export { ToolRegistry } from "./registry.js";
