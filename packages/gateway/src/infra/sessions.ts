import { eq } from "drizzle-orm";
import { sessions } from "../db/schema.js";
import type { Db } from "./router.js";

export class SessionManager {
  constructor(private db: Db) {}

  async getOrCreate(key: string, context?: unknown): Promise<{ id: number; key: string }> {
    const [existing] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.key, key));

    if (existing) {
      await this.db
        .update(sessions)
        .set({ lastActiveAt: new Date().toISOString() })
        .where(eq(sessions.id, existing.id));
      return { id: existing.id, key: existing.key };
    }

    const [created] = await this.db
      .insert(sessions)
      .values({
        key,
        context: context ? JSON.stringify(context) : null,
      })
      .returning();

    return { id: created.id, key: created.key };
  }

  async updateContext(key: string, context: unknown): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        context: JSON.stringify(context),
        lastActiveAt: new Date().toISOString(),
      })
      .where(eq(sessions.key, key));
  }
}
