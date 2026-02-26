import { eq, desc, sql } from "drizzle-orm";
import { researchThreads, researchMessages } from "../db/schema.js";
import type { Router } from "../infra/router.js";

export function registerResearchThreadHandlers(router: Router) {
  router.register("research.threads.list", async (db) => {
    return db.select().from(researchThreads).orderBy(desc(researchThreads.updatedAt)).all();
  });

  router.register("research.threads.create", async (db, params) => {
    const { title } = params as { title: string };
    const [thread] = await db
      .insert(researchThreads)
      .values({ title })
      .returning();
    return thread;
  });

  router.register("research.threads.update", async (db, params) => {
    const { id, ...updates } = params as {
      id: number;
      title?: string;
      categoryTags?: string;
    };
    await db
      .update(researchThreads)
      .set({ ...updates, updatedAt: sql`datetime('now')` })
      .where(eq(researchThreads.id, id));
    const [thread] = await db
      .select()
      .from(researchThreads)
      .where(eq(researchThreads.id, id));
    return thread;
  });

  router.register("research.threads.delete", async (db, params) => {
    const { id } = params as { id: number };
    await db.delete(researchMessages).where(eq(researchMessages.threadId, id));
    await db.delete(researchThreads).where(eq(researchThreads.id, id));
    return { ok: true };
  });

  router.register("research.messages.list", async (db, params) => {
    const { threadId } = params as { threadId: number };
    return db
      .select()
      .from(researchMessages)
      .where(eq(researchMessages.threadId, threadId))
      .orderBy(researchMessages.createdAt)
      .all();
  });

  router.register("research.messages.create", async (db, params) => {
    const { threadId, role, content, toolCalls, vendorIds } = params as {
      threadId: number;
      role: string;
      content: string;
      toolCalls?: string;
      vendorIds?: string;
    };
    const [msg] = await db
      .insert(researchMessages)
      .values({ threadId, role, content, toolCalls: toolCalls ?? null, vendorIds: vendorIds ?? null })
      .returning();
    // Touch the thread's updatedAt
    await db
      .update(researchThreads)
      .set({ updatedAt: sql`datetime('now')` })
      .where(eq(researchThreads.id, threadId));
    return msg;
  });
}
