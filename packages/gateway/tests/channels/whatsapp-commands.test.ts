import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSchema } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { handleWhatsAppCommand } from "../../src/channels/whatsapp-commands.js";

describe("WhatsApp command router", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  function makeCtx(overrides: Partial<Parameters<typeof handleWhatsAppCommand>[1]> = {}) {
    return {
      db,
      sqlite,
      reply: vi.fn() as (text: string) => Promise<void>,
      getActiveThreadId: () => null as number | null,
      setActiveThreadId: vi.fn() as (id: number) => Promise<void>,
      getQueueStatus: () => ({ running: 0, pending: 0 }),
      ...overrides,
    };
  }

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    pushSchema(sqlite);
    db = drizzle(sqlite, { schema });
  });

  it("returns handled=false for non-command messages", async () => {
    const ctx = makeCtx();
    const result = await handleWhatsAppCommand("find me a florist", ctx);
    expect(result.handled).toBe(false);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("handles /new — creates thread and replies", async () => {
    const ctx = makeCtx();
    const result = await handleWhatsAppCommand("/new", ctx);
    expect(result.handled).toBe(true);
    expect(ctx.setActiveThreadId).toHaveBeenCalledWith(expect.any(Number));
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("New thread started"));
  });

  it("handles /status — replies with thread info", async () => {
    const [thread] = await db.insert(schema.researchThreads).values({ title: "Test thread" }).returning();
    const ctx = makeCtx({ getActiveThreadId: () => thread.id });

    const result = await handleWhatsAppCommand("/status", ctx);
    expect(result.handled).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Test thread"));
  });

  it("handles /status with no active thread", async () => {
    const ctx = makeCtx();
    const result = await handleWhatsAppCommand("/status", ctx);
    expect(result.handled).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("No active thread"));
  });

  it("handles /help — lists commands", async () => {
    const ctx = makeCtx();
    const result = await handleWhatsAppCommand("/help", ctx);
    expect(result.handled).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("/new"));
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("/status"));
  });

  it("is case-insensitive", async () => {
    const ctx = makeCtx();
    const result = await handleWhatsAppCommand("/NEW", ctx);
    expect(result.handled).toBe(true);
  });

  it("ignores unknown slash commands", async () => {
    const ctx = makeCtx();
    const result = await handleWhatsAppCommand("/unknown", ctx);
    expect(result.handled).toBe(false);
  });
});
