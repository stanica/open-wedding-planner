# WhatsApp Research Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the couple chat with the research agent via WhatsApp self-chat, with a unified message queue that works for both WhatsApp and desktop UI.

**Architecture:** Extend the existing `WhatsAppChannel` to detect self-chat messages and route them to the research agent via the orchestrator. Add a per-thread message queue in the `agent.research` handler so messages sent while an agent is running (from either channel) are automatically dispatched when the current run finishes. Persist the active WhatsApp thread ID in `aiConfig`.

**Tech Stack:** Baileys (already installed), drizzle-orm, Vercel AI SDK orchestrator, React/zustand frontend

---

### Task 1: DB Migration — `whatsapp_active_thread_id` Column

**Files:**
- Modify: `packages/gateway/src/db/schema.ts:195-202`
- Modify: `packages/gateway/src/db/migrate.ts:248-259`

**Step 1: Add column to Drizzle schema**

In `packages/gateway/src/db/schema.ts`, add to the `aiConfig` table:

```typescript
export const aiConfig = sqliteTable("ai_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().default("api-key"),
  model: text("model").notNull().default("claude-sonnet-4-20250514"),
  proxyUrl: text("proxy_url").notNull().default("http://localhost:3456/v1"),
  apiKey: text("api_key"),
  whatsappAutoSend: integer("whatsapp_auto_send").notNull().default(0),
  whatsappActiveThreadId: integer("whatsapp_active_thread_id"),
});
```

**Step 2: Add migration**

In `packages/gateway/src/db/migrate.ts`, add after the existing `whatsapp_auto_send` migration:

```typescript
try {
  sqlite.exec(`ALTER TABLE ai_config ADD COLUMN whatsapp_active_thread_id INTEGER;`);
} catch {
  // Column already exists
}
```

**Step 3: Run tests to verify nothing breaks**

Run: `cd packages/gateway && npx vitest run`
Expected: All existing tests pass.

**Step 4: Commit**

```bash
git add packages/gateway/src/db/schema.ts packages/gateway/src/db/migrate.ts
git commit -m "feat: add whatsapp_active_thread_id column to ai_config"
```

---

### Task 2: Self-Chat Detection in `WhatsAppChannel`

**Files:**
- Modify: `packages/gateway/src/channels/whatsapp.ts:14-127`

**Step 1: Write the failing test**

Create `packages/gateway/tests/channels/whatsapp-self-chat.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// We test the self-chat detection logic in isolation.
// The WhatsAppChannel needs Baileys so we test the routing logic separately.

describe("WhatsApp self-chat detection", () => {
  it("identifies self-chat when remoteJid matches user jid", () => {
    const userJid = "5511999999999@s.whatsapp.net";
    const remoteJid = "5511999999999@s.whatsapp.net";
    const fromMe = true;

    const isSelfChat = fromMe && remoteJid === userJid;
    expect(isSelfChat).toBe(true);
  });

  it("skips non-self fromMe messages", () => {
    const userJid = "5511999999999@s.whatsapp.net";
    const remoteJid = "5522888888888@s.whatsapp.net";
    const fromMe = true;

    const isSelfChat = fromMe && remoteJid === userJid;
    expect(isSelfChat).toBe(false);
  });

  it("allows incoming messages from others (not fromMe)", () => {
    const userJid = "5511999999999@s.whatsapp.net";
    const remoteJid = "5522888888888@s.whatsapp.net";
    const fromMe = false;

    // Not fromMe = incoming vendor message, should not be treated as self-chat
    const isSelfChat = fromMe && remoteJid === userJid;
    expect(isSelfChat).toBe(false);
  });

  it("normalizes JID with :device suffix", () => {
    // Baileys sometimes returns JIDs with device suffixes like "123:45@s.whatsapp.net"
    const userJid = "5511999999999:12@s.whatsapp.net";
    const remoteJid = "5511999999999@s.whatsapp.net";

    const normalizeJid = (jid: string) => jid.replace(/:\d+@/, "@");
    expect(normalizeJid(userJid)).toBe(remoteJid);
  });
});
```

**Step 2: Run test to verify it passes** (these are pure logic tests)

Run: `cd packages/gateway && npx vitest run tests/channels/whatsapp-self-chat.test.ts`
Expected: PASS

**Step 3: Update `WhatsAppChannel` class**

In `packages/gateway/src/channels/whatsapp.ts`:

1. Add `getUserJid()` method:

```typescript
getUserJid(): string | null {
  if (!this.socket?.user?.id) return null;
  // Normalize: strip device suffix (e.g. "123:45@s.whatsapp.net" → "123@s.whatsapp.net")
  return this.socket.user.id.replace(/:\d+@/, "@");
}
```

2. Update the `onIncoming` callback type to include `selfChat`:

```typescript
private onMessage:
  | ((msg: { from: string; body: string; messageId: string; selfChat: boolean }) => void)
  | null = null;

// ...

onIncoming(
  handler: (msg: { from: string; body: string; messageId: string; selfChat: boolean }) => void,
) {
  this.onMessage = handler;
}
```

3. Update the `messages.upsert` handler to detect self-chat:

```typescript
this.socket.ev.on("messages.upsert", ({ messages }) => {
  for (const msg of messages) {
    const body =
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      "";
    if (!body) continue;

    const userJid = this.getUserJid();
    const remoteJid = msg.key.remoteJid ?? "";

    if (msg.key.fromMe) {
      // Self-chat: fromMe + remoteJid matches our own JID
      if (userJid && remoteJid === userJid) {
        this.onMessage?.({ from: remoteJid, body, messageId: msg.key.id ?? "", selfChat: true });
      }
      // Non-self fromMe messages: skip (our own outgoing messages to others)
      continue;
    }

    // Incoming message from someone else
    this.onMessage?.({
      from: remoteJid,
      body,
      messageId: msg.key.id ?? "",
      selfChat: false,
    });
  }
});
```

4. Add typing indicator methods:

```typescript
async sendTyping(jid: string): Promise<void> {
  if (!this.socket) return;
  await this.socket.sendPresenceUpdate("composing", jid);
}

async stopTyping(jid: string): Promise<void> {
  if (!this.socket) return;
  await this.socket.sendPresenceUpdate("paused", jid);
}
```

**Step 4: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/gateway/src/channels/whatsapp.ts packages/gateway/tests/channels/whatsapp-self-chat.test.ts
git commit -m "feat: detect self-chat messages and add typing indicators to WhatsAppChannel"
```

---

### Task 3: WhatsApp Command Router

**Files:**
- Create: `packages/gateway/src/channels/whatsapp-commands.ts`
- Test: `packages/gateway/tests/channels/whatsapp-commands.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/channels/whatsapp-commands.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
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
    // Create a thread first
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

  it("ignores commands with extra text as unknown", async () => {
    const ctx = makeCtx();
    const result = await handleWhatsAppCommand("/unknown", ctx);
    expect(result.handled).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/channels/whatsapp-commands.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the command router**

Create `packages/gateway/src/channels/whatsapp-commands.ts`:

```typescript
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
```

**Step 4: Run tests**

Run: `cd packages/gateway && npx vitest run tests/channels/whatsapp-commands.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/channels/whatsapp-commands.ts packages/gateway/tests/channels/whatsapp-commands.test.ts
git commit -m "feat: add WhatsApp command router (/new, /status, /help)"
```

---

### Task 4: Unified Message Queue in `agent.research` Handler

**Files:**
- Modify: `packages/gateway/src/handlers/agents.ts:1-30`
- Modify: `packages/gateway/src/agents/orchestrator.ts:198-234`
- Test: `packages/gateway/tests/handlers/research-queue.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/handlers/research-queue.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc } from "drizzle-orm";
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
    // Create thread
    const [thread] = await db.insert(schema.researchThreads).values({ title: "Test" }).returning();

    // Simulate: user message, assistant response, then 2 more user messages
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "user", content: "first" });
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "assistant", content: "response" });
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "user", content: "second" });
    await db.insert(schema.researchMessages).values({ threadId: thread.id, role: "user", content: "third" });

    // Check for queued messages: user messages after the last assistant message
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
```

**Step 2: Run test to verify it passes** (pure DB logic)

Run: `cd packages/gateway && npx vitest run tests/handlers/research-queue.test.ts`
Expected: PASS

**Step 3: Add `onComplete` callback to orchestrator**

In `packages/gateway/src/agents/orchestrator.ts`, add a completion callback registry:

1. Add a new field and method:

```typescript
// After line 31 (private extraToolCtx)
private completionCallbacks = new Map<string, (threadId: number) => void>();

// New public method
onThreadComplete(threadId: number, callback: (threadId: number) => void): void {
  this.completionCallbacks.set(`thread-${threadId}`, callback);
}

removeThreadCallback(threadId: number): void {
  this.completionCallbacks.delete(`thread-${threadId}`);
}
```

2. In the `execute` method, after the `research.messageComplete` broadcast (around line 220), add:

```typescript
// Trigger completion callback for queue processing
const threadCallback = this.completionCallbacks.get(`thread-${researchInput.threadId}`);
if (threadCallback) {
  threadCallback(researchInput.threadId);
}
```

**Step 4: Add queue logic to `agent.research` handler**

In `packages/gateway/src/handlers/agents.ts`, modify the `agent.research` handler. The handler needs access to `db` for checking queued messages. Update the function signature and add queue logic:

```typescript
import { eq } from "drizzle-orm";
import { researchMessages } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";
import type { Orchestrator } from "../agents/orchestrator.js";

// Track threads with running agents
const activeThreads = new Set<number>();

export function registerAgentHandlers(router: Router, orchestrator: Orchestrator) {
  router.register("agent.research", async (db, params) => {
    const { threadId, messages } = params as { threadId: number; messages: Array<{ role: string; content: string }> };
    if (!threadId || !messages) {
      throw new Error("threadId and messages are required");
    }

    // If agent already running on this thread, message is already saved to DB — just return queued status
    if (activeThreads.has(threadId)) {
      return { queued: true, threadId };
    }

    return dispatchResearch(db, orchestrator, threadId, messages);
  });

  // ... rest of handlers unchanged
}

async function dispatchResearch(
  db: Db,
  orchestrator: Orchestrator,
  threadId: number,
  messages: Array<{ role: string; content: string }>,
) {
  // Find the last compaction marker (role: "system") in the message list
  let compactedMessages: unknown[];
  const lastSystemIdx = messages.findLastIndex((m) => m.role === "system");
  if (lastSystemIdx !== -1) {
    const summary = messages[lastSystemIdx].content;
    const postMarker = messages.slice(lastSystemIdx + 1)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
    compactedMessages = [
      { role: "user", content: `Previous conversation summary:\n\n${summary}` },
      ...(postMarker.length > 0 ? postMarker : []),
    ];
  } else {
    compactedMessages = messages;
  }

  activeThreads.add(threadId);

  // Register completion callback to check for queued messages
  orchestrator.onThreadComplete(threadId, async (tid) => {
    activeThreads.delete(tid);

    // Check for user messages after the last assistant response
    const allMessages = await db
      .select()
      .from(researchMessages)
      .where(eq(researchMessages.threadId, tid))
      .orderBy(researchMessages.createdAt)
      .all();

    const lastAssistantIdx = allMessages.findLastIndex((m: any) => m.role === "assistant");
    const queued = allMessages.slice(lastAssistantIdx + 1).filter((m: any) => m.role === "user");

    if (queued.length > 0) {
      // Re-dispatch with full message history
      const fullHistory = allMessages.map((m: any) => ({ role: m.role, content: m.content }));
      dispatchResearch(db, orchestrator, tid, fullHistory);
    } else {
      orchestrator.removeThreadCallback(tid);
    }
  });

  const { taskId, sessionKey } = await orchestrator.dispatch("research", { threadId, messages: compactedMessages });
  return { taskId, sessionKey };
}
```

**Step 5: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add packages/gateway/src/handlers/agents.ts packages/gateway/src/agents/orchestrator.ts packages/gateway/tests/handlers/research-queue.test.ts
git commit -m "feat: unified per-thread message queue for research agent"
```

---

### Task 5: Self-Chat Routing in Gateway `index.ts`

**Files:**
- Modify: `packages/gateway/src/index.ts:109-215`

**Step 1: Read the active thread ID on startup**

After the existing AI config loading (line 109-117 in `index.ts`), load the active WhatsApp thread ID:

```typescript
// After line 117
let whatsappActiveThreadId: number | null = savedAiConfig?.whatsappActiveThreadId ?? null;
```

Add helper functions for thread management:

```typescript
async function getOrCreateWhatsAppThread(): Promise<number> {
  if (whatsappActiveThreadId) {
    // Verify thread still exists
    const [thread] = await db
      .select()
      .from(schema.researchThreads)
      .where(eq(schema.researchThreads.id, whatsappActiveThreadId));
    if (thread) return whatsappActiveThreadId;
  }

  // Create new thread
  const [thread] = await db
    .insert(schema.researchThreads)
    .values({ title: "WhatsApp" })
    .returning();
  whatsappActiveThreadId = thread.id;
  await db
    .update(schema.aiConfig)
    .set({ whatsappActiveThreadId: thread.id });
  return thread.id;
}

async function setWhatsAppActiveThread(id: number): Promise<void> {
  whatsappActiveThreadId = id;
  await db
    .update(schema.aiConfig)
    .set({ whatsappActiveThreadId: id });
}
```

**Step 2: Update the `onIncoming` handler**

Replace the existing `whatsapp.onIncoming` block (lines 176-215) with:

```typescript
// Track WhatsApp-originated sessions for response delivery
const whatsAppSessions = new Set<string>();

whatsapp.onIncoming(async ({ from, body, messageId, selfChat }) => {
  if (selfChat) {
    // --- Self-chat: route to research agent ---
    const userJid = whatsapp.getUserJid();
    if (!userJid) return;

    // Import and check commands first
    const { handleWhatsAppCommand } = await import("./channels/whatsapp-commands.js");
    const cmdResult = await handleWhatsAppCommand(body, {
      db,
      sqlite,
      reply: (text: string) => whatsapp.send(userJid, text),
      getActiveThreadId: () => whatsappActiveThreadId,
      setActiveThreadId: setWhatsAppActiveThread,
      getQueueStatus: () => orchestrator.getQueueStatus(),
    });
    if (cmdResult.handled) return;

    // Get or create active thread
    const threadId = await getOrCreateWhatsAppThread();

    // Save user message to thread
    await db.insert(schema.researchMessages).values({
      threadId,
      role: "user",
      content: body,
    });

    // Load full message history
    const history = await db
      .select()
      .from(schema.researchMessages)
      .where(eq(schema.researchMessages.threadId, threadId))
      .orderBy(schema.researchMessages.createdAt)
      .all();

    const agentMessages = history.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Dispatch — the handler returns { queued: true } if agent is already running on this thread
    const result = await router.handle("agent.research", db, { threadId, messages: agentMessages });

    if (result && !result.queued && result.sessionKey) {
      whatsAppSessions.add(result.sessionKey);
      whatsapp.sendTyping(userJid);
    }

    return;
  }

  // --- Vendor message: existing behavior ---
  const matchedVendors = await db
    .select()
    .from(schema.vendors)
    .where(eq(schema.vendors.contactWhatsapp, from));
  const vendor = matchedVendors[0] ?? null;

  wsServer.broadcast({
    name: "agent-activity",
    data: {
      sessionKey: "whatsapp-incoming",
      action: "message-received",
      detail: `WhatsApp from ${vendor?.name ?? from}: ${body.slice(0, 100)}`,
    },
  });

  if (vendor) {
    const [comm] = await db
      .insert(schema.communications)
      .values({
        vendorId: vendor.id,
        direction: "in",
        channel: "whatsapp",
        bodyOriginal: body,
        status: "received",
        threadId: messageId,
      })
      .returning();

    orchestrator.dispatch("parse", {
      communicationId: comm.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      messageBody: body,
    });
  }
});
```

**Step 3: Add completion listener for WhatsApp response delivery**

After the `onIncoming` handler, add a listener for agent completion events. We need to hook into the orchestrator's broadcast. The simplest way: subscribe to the `wsServer` broadcast by wrapping it, OR add a post-completion hook on the orchestrator. Since the orchestrator already has `onThreadComplete`, we can use the broadcast interception approach.

Add this after the `whatsapp.onIncoming(...)` block:

```typescript
// Listen for agent completions to send WhatsApp responses
const originalBroadcast = (event: GatewayEvent) => wsServer.broadcast(event);

// We need to intercept broadcasts to detect agent-complete for WhatsApp sessions.
// Wrap the orchestrator's broadcast by subscribing to events we care about.
// Since we can't easily wrap the broadcast, we'll use a polling approach on the
// orchestrator's onThreadComplete — the queue handler already sets this up.
// Instead, add a second event subscription layer.

// The cleanest approach: after the orchestrator is created, monkey-patch the
// broadcast to also handle WhatsApp responses.
const origBroadcastFn = wsServer.broadcast.bind(wsServer);
wsServer.broadcast = (event: GatewayEvent) => {
  origBroadcastFn(event);

  // Handle WhatsApp response delivery
  if (event.name === "research.messageComplete") {
    const { threadId } = event.data as { threadId: number };
    if (threadId === whatsappActiveThreadId) {
      const userJid = whatsapp.getUserJid();
      if (!userJid) return;

      // Read latest assistant message and send via WhatsApp
      db.select()
        .from(schema.researchMessages)
        .where(eq(schema.researchMessages.threadId, threadId))
        .orderBy(schema.researchMessages.createdAt)
        .all()
        .then((messages) => {
          // Find last assistant message
          const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
          if (!lastAssistant) return;

          const text = lastAssistant.content;
          // Chunk at 4000 chars
          const chunks = [];
          for (let i = 0; i < text.length; i += 4000) {
            chunks.push(text.slice(i, i + 4000));
          }
          // Send chunks sequentially
          chunks.reduce(
            (p, chunk) => p.then(() => whatsapp.send(userJid, chunk)),
            Promise.resolve(),
          ).then(() => whatsapp.stopTyping(userJid));
        });
    }
  }

  // Restart typing indicator when queue auto-dispatches on this thread
  if (event.name === "agent-activity") {
    const data = event.data as { sessionKey: string; action: string };
    if (data.sessionKey.startsWith("research-") && data.action === "tool-call") {
      // If this is on the WhatsApp thread, ensure typing is active
      // (typing indicator auto-expires after ~25s in WhatsApp, refresh it)
      const userJid = whatsapp.getUserJid();
      if (userJid && whatsappActiveThreadId) {
        whatsapp.sendTyping(userJid);
      }
    }
  }

  // Stop typing on error
  if (event.name === "agent-activity") {
    const data = event.data as { sessionKey: string; action: string; detail?: string };
    if (data.action === "error" && whatsappActiveThreadId) {
      const userJid = whatsapp.getUserJid();
      if (userJid) {
        whatsapp.send(userJid, "Something went wrong, try again.")
          .then(() => whatsapp.stopTyping(userJid));
      }
    }
  }
});
```

**Step 4: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add packages/gateway/src/index.ts
git commit -m "feat: route WhatsApp self-chat messages to research agent with response delivery"
```

---

### Task 6: Enable ComposeBox During Active Agent

**Files:**
- Modify: `packages/app/src/renderer/components/research/ResearchView.tsx:117-148,318`

**Step 1: Update `handleSend` to support queueing**

In `ResearchView.tsx`, modify `handleSend` to save the message and call the handler even when an agent is running. The handler will return `{ queued: true }` if an agent is already active:

```typescript
async function handleSend(content: string) {
  let threadId = activeThreadId;

  if (!threadId) {
    // Auto-create thread from first message
    const title = content.length > 50 ? content.slice(0, 50) + "..." : content;
    const thread = await createThread({ title });
    threadId = thread.id;
    setActiveThreadId(thread.id);
    refetchThreads();
  }

  // Save user message
  await createMessage({ threadId, role: "user", content });
  refetchMessages();

  // Build conversation history
  let history: Message[] = [];
  try {
    history = await wsClient.request<Message[]>("research.messages.list", { threadId });
  } catch {
    history = messages ?? [];
  }

  const agentMessages = history.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  const result = await startResearch({ threadId, messages: agentMessages });
  // Only set session if not queued (agent is actually starting)
  if (result && !result.queued) {
    setActiveSession(result.sessionKey, threadId);
  }
}
```

**Step 2: Remove disabled prop from ComposeBox**

Change line 318:

```typescript
// Before:
<ComposeBox onSend={handleSend} disabled={researching || (!!activeSession && isSessionThread)} />

// After:
<ComposeBox onSend={handleSend} disabled={researching} />
```

The `researching` loading state still prevents double-clicks while the HTTP request is in flight, but the compose box is no longer disabled while the agent is running.

**Step 3: Run the app to verify**

Run: `cd packages/app && npm run dev`
Expected: Compose box stays enabled while agent is working. New messages appear in chat immediately.

**Step 4: Commit**

```bash
git add packages/app/src/renderer/components/research/ResearchView.tsx
git commit -m "feat: allow sending messages while research agent is running (unified queue)"
```

---

### Task 7: Integration Test

**Files:**
- Create: `packages/gateway/tests/channels/whatsapp-research-flow.test.ts`

**Step 1: Write the integration test**

```typescript
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
```

**Step 2: Run the test**

Run: `cd packages/gateway && npx vitest run tests/channels/whatsapp-research-flow.test.ts`
Expected: All PASS

**Step 3: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/gateway/tests/channels/whatsapp-research-flow.test.ts
git commit -m "test: add WhatsApp research flow integration tests"
```

---

### Task 8: Handle `router.handle` Access from `index.ts`

**Files:**
- Modify: `packages/gateway/src/infra/router.ts` (if needed)

The self-chat routing in `index.ts` calls `router.handle("agent.research", db, params)` directly. Check that the `Router` class exposes a `handle` method. If it uses a different name (like `dispatch` or the WebSocket server calls handlers differently), adapt the call.

**Step 1: Check Router API**

Read `packages/gateway/src/infra/router.ts` to verify how handlers are invoked.

**Step 2: Adapt if needed**

If the router doesn't have a public `handle` method, either:
- Add one, or
- Call the orchestrator directly from `index.ts` instead of going through the router (simpler — avoids the double-dispatch through router → handler → orchestrator)

In that case, replace the `router.handle(...)` call in Task 5 with direct orchestrator dispatch + the queue check:

```typescript
// Check if agent is already running on this thread
// (use the activeThreads set from agents.ts — or just dispatch and let the handler deal with it)
const result = await orchestrator.dispatch("research", { threadId, messages: agentMessages });
```

This is simpler and avoids a circular dependency. The queue logic in the handler will still fire because the orchestrator's `onThreadComplete` callback triggers independently.

**Step 3: Commit if changes were made**

```bash
git add packages/gateway/src/index.ts
git commit -m "fix: use direct orchestrator dispatch for WhatsApp self-chat"
```

---

### Summary of All Changes

| # | What | Files |
|---|------|-------|
| 1 | DB migration | `schema.ts`, `migrate.ts` |
| 2 | Self-chat detection | `whatsapp.ts` + test |
| 3 | Command router | `whatsapp-commands.ts` + test |
| 4 | Unified message queue | `agents.ts`, `orchestrator.ts` + test |
| 5 | Self-chat routing | `index.ts` |
| 6 | Enable compose during agent | `ResearchView.tsx` |
| 7 | Integration test | test file |
| 8 | Router handle fix | `index.ts` or `router.ts` |
