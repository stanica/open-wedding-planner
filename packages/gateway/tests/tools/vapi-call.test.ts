import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { makeVapiCallTool, type VapiCallContext } from "../../src/tools/vapi-call.js";
import type { CreateCallParams } from "../../src/channels/vapi.js";
import type { Db } from "../../src/infra/router.js";

const toolContext = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

async function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  await seedCategories(db);

  // Seed a vendor
  db.insert(schema.vendors).values({
    name: "Mary's Flowers",
    contactPhone: "+15551234567",
    categoryId: 1,
    status: "researched",
  }).run();

  return { db, sqlite };
}

describe("makeVapiCallTool", () => {
  let db: Db;
  let ctx: VapiCallContext;
  let mockCreateCall: ReturnType<typeof vi.fn<(params: CreateCallParams) => Promise<{ id: string; status: string }>>>;

  beforeEach(async () => {
    const s = await setup();
    db = s.db;
    mockCreateCall = vi.fn().mockResolvedValue({ id: "call-123", status: "queued" });

    ctx = {
      db,
      emit: vi.fn(),
      createCall: mockCreateCall,
      getCall: vi.fn(),
      getVapiConfig: () => ({
        phoneNumberId: "pn-1",
        assistantId: "asst-1",
      }),
      broadcast: vi.fn(),
    };
  });

  it("creates and initiates call immediately", async () => {
    const tool = makeVapiCallTool(ctx);
    const result = await tool.execute!(
      { vendorId: 1, phoneNumber: "+15551234567", instructions: "Ask about flower pricing" },
      toolContext,
    ) as any;

    expect(result.status).toBe("queued");
    expect(result.vapiCallId).toBe("call-123");
    expect(mockCreateCall).toHaveBeenCalled();
  });

  it("looks up vendor phone number when not provided", async () => {
    const tool = makeVapiCallTool(ctx);
    const result = await tool.execute!(
      { vendorId: 1, instructions: "Ask about flower pricing" },
      toolContext,
    ) as any;

    expect(result.status).toBe("queued");
    expect(mockCreateCall).toHaveBeenCalledWith(
      expect.objectContaining({ customerNumber: "+15551234567" }),
    );
  });

  it("returns error when vendor has no phone number", async () => {
    // Insert vendor without phone
    db.insert(schema.vendors).values({
      name: "No Phone Vendor",
      categoryId: 1,
      status: "researched",
    }).run();

    const tool = makeVapiCallTool(ctx);
    const result = await tool.execute!(
      { vendorId: 2, instructions: "Call them" },
      toolContext,
    ) as any;

    expect(result.error).toContain("no phone number");
  });
});
