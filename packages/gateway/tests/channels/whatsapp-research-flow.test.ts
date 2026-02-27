import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { pushSchema } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { handleWhatsAppCommand } from "../../src/channels/whatsapp-commands.js";

describe("WhatsApp research flow integration", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    pushSchema(sqlite);
    db = drizzle(sqlite, { schema });
    // Seed ai_config
    sqlite.exec(`INSERT INTO ai_config (provider) VALUES ('api-key')`);
  });

  it("full flow: /new → message → thread created with message", async () => {
    const reply = vi.fn();
    let activeThreadId: number | null = null;

    const ctx = {
      db,
      sqlite,
      reply,
      getActiveThreadId: () => activeThreadId,
      setActiveThreadId: vi.fn(async (id: number) => { activeThreadId = id; }),
      getQueueStatus: () => ({ running: 0, pending: 0 }),
    };

    // /new command
    await handleWhatsAppCommand("/new", ctx);
    expect(activeThreadId).not.toBeNull();
    expect(reply).toHaveBeenCalledWith("New thread started.");

    // Save a user message to the thread
    await db.insert(schema.researchMessages).values({
      threadId: activeThreadId!,
      role: "user",
      content: "Find me florists in Lisbon",
    });

    // Verify message is in DB
    const messages = await db
      .select()
      .from(schema.researchMessages)
      .where(eq(schema.researchMessages.threadId, activeThreadId!))
      .all();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Find me florists in Lisbon");
  });

  it("thread persists across simulated restarts", async () => {
    // Create thread and persist ID
    const [thread] = await db.insert(schema.researchThreads).values({ title: "WhatsApp" }).returning();
    await db.update(schema.aiConfig).set({ whatsappActiveThreadId: thread.id });

    // "Restart": read from DB
    const [config] = await db.select().from(schema.aiConfig).limit(1);
    expect(config.whatsappActiveThreadId).toBe(thread.id);

    // Verify thread exists
    const [restored] = await db
      .select()
      .from(schema.researchThreads)
      .where(eq(schema.researchThreads.id, config.whatsappActiveThreadId!));
    expect(restored.title).toBe("WhatsApp");
  });

  it("threads show up in regular thread list", async () => {
    // Create a WhatsApp thread and a regular thread
    await db.insert(schema.researchThreads).values({ title: "WhatsApp" });
    await db.insert(schema.researchThreads).values({ title: "Regular research" });

    const threads = await db.select().from(schema.researchThreads).all();
    expect(threads).toHaveLength(2);
    // Both are plain research threads — no distinction
    expect(threads.map((t) => t.title)).toContain("WhatsApp");
    expect(threads.map((t) => t.title)).toContain("Regular research");
  });
});
