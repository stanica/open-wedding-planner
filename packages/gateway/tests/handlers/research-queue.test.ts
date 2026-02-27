import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { pushSchema } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";

describe("Research message queue", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    pushSchema(sqlite);
    db = drizzle(sqlite, { schema });
  });

  it("detects queued messages newer than last assistant response", async () => {
    const [thread] = await db.insert(schema.researchThreads).values({ title: "Test" }).returning();

    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "user", content: "first" });
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "assistant", content: "response" });
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "user", content: "second" });
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "user", content: "third" });

    const messages = await db
      .select()
      .from(schema.researchMessages)
      .where(eq(schema.researchMessages.threadId, thread.id))
      .orderBy(schema.researchMessages.createdAt)
      .all();

    const lastAssistantIdx = messages.findLastIndex((m) => m.role === "assistant");
    const queuedMessages = messages.slice(lastAssistantIdx + 1).filter((m) => m.role === "user");

    expect(queuedMessages).toHaveLength(2);
    expect(queuedMessages[0].content).toBe("second");
    expect(queuedMessages[1].content).toBe("third");
  });

  it("returns empty when no messages are queued after assistant", async () => {
    const [thread] = await db.insert(schema.researchThreads).values({ title: "Test" }).returning();
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "user", content: "hello" });
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "assistant", content: "hi" });

    const messages = await db
      .select()
      .from(schema.researchMessages)
      .where(eq(schema.researchMessages.threadId, thread.id))
      .orderBy(schema.researchMessages.createdAt)
      .all();

    const lastAssistantIdx = messages.findLastIndex((m) => m.role === "assistant");
    const queuedMessages = messages.slice(lastAssistantIdx + 1).filter((m) => m.role === "user");

    expect(queuedMessages).toHaveLength(0);
  });
});
