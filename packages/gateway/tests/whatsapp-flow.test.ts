import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSchema } from "../src/db/migrate.js";
import * as schema from "../src/db/schema.js";
import { makeSendWhatsAppTool } from "../src/tools/send-whatsapp.js";

describe("WhatsApp send flow", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    pushSchema(sqlite);
    db = drizzle(sqlite, { schema });

    // Seed a category and vendor
    sqlite.exec(`INSERT INTO categories (id, name, budget_percent_low, budget_percent_high, sort_order) VALUES (1, 'Venue/Food/Beverage', 0.4, 0.5, 1)`);
    sqlite.exec(`INSERT INTO vendors (id, category_id, name, contact_whatsapp, status) VALUES (1, 1, 'Test Venue', '+39123456789', 'researched')`);
  });

  it("creates draft when autoSend is off", async () => {
    const enqueue = vi.fn();
    const tool = makeSendWhatsAppTool({
      db,
      emit: vi.fn(),
      getAutoSend: () => false,
      enqueue,
    });

    const result = await tool.execute(
      { vendorId: 1, message: "Hello, we are interested in your venue!" },
      { toolCallId: "test", messages: [], abortSignal: AbortSignal.timeout(5000) },
    );

    expect(result.status).toBe("draft");
    expect(result.communicationId).toBeDefined();
    expect(result.vendorName).toBe("Test Venue");
    expect(enqueue).not.toHaveBeenCalled();

    // Verify communication was created in DB
    const comms = sqlite.prepare("SELECT * FROM communications").all() as any[];
    expect(comms).toHaveLength(1);
    expect(comms[0].status).toBe("draft");
    expect(comms[0].channel).toBe("whatsapp");
    expect(comms[0].direction).toBe("out");
    expect(comms[0].body_original).toBe("Hello, we are interested in your venue!");
  });

  it("enqueues when autoSend is on", async () => {
    const enqueue = vi.fn();
    const tool = makeSendWhatsAppTool({
      db,
      emit: vi.fn(),
      getAutoSend: () => true,
      enqueue,
    });

    const result = await tool.execute(
      { vendorId: 1, message: "Hello!" },
      { toolCallId: "test", messages: [], abortSignal: AbortSignal.timeout(5000) },
    );

    expect(result.status).toBe("approved");
    expect(enqueue).toHaveBeenCalledWith("whatsapp", 1, expect.objectContaining({
      to: "+39123456789",
      text: "Hello!",
    }));
  });

  it("returns error for vendor without WhatsApp number", async () => {
    // Add a vendor without WhatsApp
    sqlite.exec(`INSERT INTO vendors (id, category_id, name, status) VALUES (2, 1, 'No WA Vendor', 'researched')`);

    const tool = makeSendWhatsAppTool({
      db,
      emit: vi.fn(),
      getAutoSend: () => false,
      enqueue: vi.fn(),
    });

    const result = await tool.execute(
      { vendorId: 2, message: "Hello!" },
      { toolCallId: "test", messages: [], abortSignal: AbortSignal.timeout(5000) },
    );

    expect(result.error).toBe("Vendor has no WhatsApp number");
  });

  it("returns error for nonexistent vendor", async () => {
    const tool = makeSendWhatsAppTool({
      db,
      emit: vi.fn(),
      getAutoSend: () => false,
      enqueue: vi.fn(),
    });

    const result = await tool.execute(
      { vendorId: 999, message: "Hello!" },
      { toolCallId: "test", messages: [], abortSignal: AbortSignal.timeout(5000) },
    );

    expect(result.error).toBe("Vendor not found");
  });
});
