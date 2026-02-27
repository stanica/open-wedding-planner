import { eq } from "drizzle-orm";
import { researchThreads } from "../db/schema.js";
import type { Db } from "../infra/router.js";

export interface CommandContext {
  db: Db;
  sqlite: unknown;
  reply: (text: string) => Promise<void>;
  getActiveThreadId: () => number | null;
  setActiveThreadId: (id: number) => Promise<void>;
  getQueueStatus: () => { running: number; pending: number };
}

export async function handleWhatsAppCommand(
  body: string,
  ctx: CommandContext,
): Promise<{ handled: boolean }> {
  const cmd = body.trim().toLowerCase();

  if (!cmd.startsWith("/")) {
    return { handled: false };
  }

  if (cmd === "/new") {
    const [thread] = await ctx.db
      .insert(researchThreads)
      .values({ title: "WhatsApp" })
      .returning();
    await ctx.setActiveThreadId(thread.id);
    await ctx.reply("New thread started.");
    return { handled: true };
  }

  if (cmd === "/status") {
    const threadId = ctx.getActiveThreadId();
    if (!threadId) {
      await ctx.reply("No active thread. Send a message to start one, or use /new.");
      return { handled: true };
    }
    const [thread] = await ctx.db
      .select()
      .from(researchThreads)
      .where(eq(researchThreads.id, threadId));
    const status = ctx.getQueueStatus();
    const lines = [
      `Thread: ${thread?.title ?? "Unknown"} (#${threadId})`,
      `Queue: ${status.running} running, ${status.pending} pending`,
    ];
    await ctx.reply(lines.join("\n"));
    return { handled: true };
  }

  if (cmd === "/help") {
    await ctx.reply(
      [
        "/new — Start a new research thread",
        "/status — Show current thread and queue status",
        "/help — Show this help message",
      ].join("\n"),
    );
    return { handled: true };
  }

  // Unknown slash command — don't handle, let it go to the agent
  return { handled: false };
}
