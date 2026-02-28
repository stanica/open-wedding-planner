# Messaging UI Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat Outreach/Inbox views with purpose-built WhatsApp chat, Gmail-style inbox, and vendor communications timeline — all sharing components from the same `communications` table.

**Architecture:** Shared messaging primitives (`MessageBubble`, `ContactList`, `ConversationThread`, `AgentSidePanel`, `ComposeBox`) composed differently in three views. Backend `communications.list` fixed for compound filtering. New `agent.action` handler for per-message AI actions.

**Tech Stack:** React 19, Tailwind CSS v4, framer-motion, lucide-react, zustand, Vercel AI SDK, drizzle-orm, WebSocket RPC

---

### Task 1: Fix backend `communications.list` compound filtering

The current handler uses `if/else if` so only one filter applies at a time. Fix to apply all filters with AND logic.

**Files:**
- Modify: `packages/gateway/src/handlers/communications.ts:7-44`
- Test: `packages/gateway/tests/handlers/communications.test.ts` (create)

**Step 1: Write the failing test**

Create `packages/gateway/tests/handlers/communications.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { migrate } from "../helpers/migrate";
import { Router } from "../../src/infra/router";
import { registerCommunicationHandlers } from "../../src/handlers/communications";
import * as schema from "../../src/db/schema";

describe("communications.list", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    const sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    migrate(db);
    router = new Router(db);
    registerCommunicationHandlers(router);

    // Seed a vendor
    await db.insert(schema.vendors).values({
      id: 1,
      name: "Test Vendor",
      categoryId: 1,
      status: "researched",
      favorite: false,
    });

    // Seed communications
    await db.insert(schema.communications).values([
      { vendorId: 1, direction: "out", channel: "whatsapp", bodyOriginal: "Hi", status: "draft" },
      { vendorId: 1, direction: "out", channel: "whatsapp", bodyOriginal: "Sent", status: "sent" },
      { vendorId: 1, direction: "in", channel: "whatsapp", bodyOriginal: "Reply", status: "received" },
      { vendorId: 1, direction: "out", channel: "email", bodyOriginal: "Email", status: "draft" },
    ]);
  });

  it("filters by direction AND status together", async () => {
    const result = await router.handle("communications.list", { direction: "out", status: "draft" });
    expect(result).toHaveLength(2); // WhatsApp draft + Email draft
    expect(result.every((r: any) => r.direction === "out" && r.status === "draft")).toBe(true);
  });

  it("filters by direction AND channel together", async () => {
    const result = await router.handle("communications.list", { direction: "out", channel: "whatsapp" });
    expect(result).toHaveLength(2); // WhatsApp draft + WhatsApp sent
    expect(result.every((r: any) => r.channel === "whatsapp" && r.direction === "out")).toBe(true);
  });

  it("filters by vendorId AND direction", async () => {
    const result = await router.handle("communications.list", { vendorId: 1, direction: "in" });
    expect(result).toHaveLength(1);
    expect(result[0].bodyOriginal).toBe("Reply");
  });

  it("returns all when no filters", async () => {
    const result = await router.handle("communications.list", {});
    expect(result).toHaveLength(4);
  });
});
```

> **Note:** Adjust the test helper imports to match the existing test patterns in `packages/gateway/tests/`. Check `packages/gateway/tests/helpers/` for existing `migrate` helpers. If no helpers exist, inline the migration setup.

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/communications.test.ts`
Expected: FAIL — the compound filter test will only get direction-filtered results (3 rows instead of 2)

**Step 3: Implement compound filtering**

In `packages/gateway/src/handlers/communications.ts`, replace the `if/else if` filter chain (lines 34-43) with:

```ts
    let filtered = rows;
    if (filters.direction) {
      filtered = filtered.filter((r) => r.direction === filters.direction);
    }
    if (filters.status) {
      filtered = filtered.filter((r) => r.status === filters.status);
    }
    if (filters.vendorId) {
      filtered = filtered.filter((r) => r.vendorId === filters.vendorId);
    }
    if (filters.channel) {
      filtered = filtered.filter((r) => r.channel === filters.channel);
    }
    return filtered;
```

Also update the filter type to include `channel`:

```ts
    const filters = (params as {
      direction?: string;
      status?: string;
      vendorId?: number;
      channel?: string;
    } | undefined) ?? {};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/handlers/communications.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/handlers/communications.ts packages/gateway/tests/handlers/communications.test.ts
git commit -m "fix: compound filtering in communications.list handler"
```

---

### Task 2: Emit missing WebSocket events

The `communication-received` and `draft-ready` events are defined in the protocol but never emitted. Add them.

**Files:**
- Modify: `packages/gateway/src/index.ts:279-290` (incoming WhatsApp handler)
- Modify: `packages/gateway/src/tools/send-whatsapp.ts:47-49`
- Modify: `packages/gateway/src/handlers/agents.ts` (add broadcast reference)

**Step 1: Emit `communication-received` after incoming WhatsApp message**

In `packages/gateway/src/index.ts`, after the `db.insert(schema.communications)` block (around line 290), add:

```ts
      wsServer.broadcast({
        name: "communication-received",
        data: { vendorId: vendor.id, channel: "whatsapp" },
      });
```

**Step 2: Emit `draft-ready` from sendWhatsApp tool**

The `sendWhatsApp` tool needs access to `wsServer.broadcast`. The tool already has an `emit` callback in its context. In `packages/gateway/src/index.ts` where `makeSendWhatsAppTool` is called, the `emit` function broadcasts `agent-activity`. We need to also broadcast `draft-ready` when status is `"draft"`.

In `packages/gateway/src/tools/send-whatsapp.ts`, after the `ctx.emit(...)` call (line 47), add:

```ts
      if (status === "draft") {
        ctx.emit("draft-ready", `Draft ready for ${vendor.name}`);
      }
```

However, the `ctx.emit` wraps into `agent-activity`. Instead, add a `broadcastDraftReady` callback to `SendWhatsAppContext`:

Actually, the simplest fix: the OutreachView listens for `agent-activity` with `action === "draft-ready"`. The sendWhatsApp tool already emits `agent-activity` with `action: "send-whatsapp"`. Just change the action to `"draft-ready"` when it's a draft:

In `packages/gateway/src/tools/send-whatsapp.ts`, replace the emit call (line 47-49):

```ts
      ctx.emit(
        autoSend ? "send-whatsapp" : "draft-ready",
        `${autoSend ? "Queued" : "Drafted"} WhatsApp message to ${vendor.name}`,
      );
```

**Step 3: Commit**

```bash
git add packages/gateway/src/index.ts packages/gateway/src/tools/send-whatsapp.ts
git commit -m "feat: emit communication-received and draft-ready WebSocket events"
```

---

### Task 3: Extract ComposeBox to common components

The `ComposeBox` in `packages/app/src/renderer/components/research/ComposeBox.tsx` is already well-factored with a clean interface. Move it to `common/` so it can be reused.

**Files:**
- Move: `packages/app/src/renderer/components/research/ComposeBox.tsx` → `packages/app/src/renderer/components/common/ComposeBox.tsx`
- Modify: `packages/app/src/renderer/components/research/ResearchView.tsx:9` (update import)

**Step 1: Move the file**

```bash
mv packages/app/src/renderer/components/research/ComposeBox.tsx packages/app/src/renderer/components/common/ComposeBox.tsx
```

**Step 2: Update import in ResearchView**

In `packages/app/src/renderer/components/research/ResearchView.tsx`, change line 9:

```ts
// Before:
import { ComposeBox } from "./ComposeBox";
// After:
import { ComposeBox } from "../common/ComposeBox";
```

**Step 3: Verify the app builds**

Run: `cd packages/app && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/app/src/renderer/components/common/ComposeBox.tsx packages/app/src/renderer/components/research/ResearchView.tsx
git commit -m "refactor: extract ComposeBox to common components"
```

---

### Task 4: Build shared `MessageBubble` component

**Files:**
- Create: `packages/app/src/renderer/components/common/MessageBubble.tsx`

**Step 1: Create MessageBubble**

```tsx
import { Mail, MessageCircle } from "lucide-react";

export interface MessageBubbleProps {
  direction: "in" | "out";
  channel: "whatsapp" | "email" | string;
  body: string;
  translatedBody?: string | null;
  subject?: string | null;
  senderName?: string | null;
  sentAt?: string | null;
  status?: string;
}

export function MessageBubble({
  direction,
  channel,
  body,
  translatedBody,
  subject,
  senderName,
  sentAt,
}: MessageBubbleProps) {
  const isOut = direction === "out";
  const ChannelIcon = channel === "email" ? Mail : MessageCircle;
  const displayBody = translatedBody ?? body;

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isOut
            ? "bg-blue-600/20 border border-blue-500/20"
            : "bg-white/[0.07] border border-white/10"
        }`}
      >
        {/* Header: sender + channel icon + time */}
        <div className="flex items-center gap-2 mb-1">
          <ChannelIcon className="h-3 w-3 text-gray-500" />
          {senderName && (
            <span className="text-xs font-medium text-gray-400">{senderName}</span>
          )}
          {sentAt && (
            <span className="text-xs text-gray-600 ml-auto">
              {new Date(sentAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {/* Subject (email) */}
        {subject && (
          <p className="text-sm font-medium text-gray-200 mb-1">{subject}</p>
        )}

        {/* Body */}
        <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
          {displayBody}
        </div>

        {/* Original text toggle if translated */}
        {translatedBody && (
          <details className="mt-2">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
              Show original
            </summary>
            <div className="mt-1 whitespace-pre-wrap text-xs text-gray-500 leading-relaxed">
              {body}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd packages/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/common/MessageBubble.tsx
git commit -m "feat: add shared MessageBubble component"
```

---

### Task 5: Build shared `ContactList` component

A vertical list of vendor contacts with latest message preview. Used by the WhatsApp view.

**Files:**
- Create: `packages/app/src/renderer/components/common/ContactList.tsx`

**Step 1: Create ContactList**

```tsx
import { MessageCircle } from "lucide-react";

export interface ContactSummary {
  vendorId: number;
  vendorName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  channel: string;
}

interface ContactListProps {
  contacts: ContactSummary[];
  selectedVendorId: number | null;
  onSelect: (vendorId: number) => void;
}

export function ContactList({ contacts, selectedVendorId, onSelect }: ContactListProps) {
  return (
    <div className="flex flex-col h-full border-r border-white/10">
      <div className="p-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white">Conversations</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <MessageCircle className="h-8 w-8 text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">No conversations yet</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <button
              key={contact.vendorId}
              onClick={() => onSelect(contact.vendorId)}
              className={`w-full text-left px-3 py-3 border-b border-white/5 transition-colors ${
                selectedVendorId === contact.vendorId
                  ? "bg-white/10"
                  : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white truncate">
                  {contact.vendorName}
                </span>
                {contact.lastMessageAt && (
                  <span className="text-xs text-gray-500 shrink-0 ml-2">
                    {formatRelativeTime(contact.lastMessageAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 truncate">
                  {contact.lastMessage}
                </p>
                {contact.unreadCount > 0 && (
                  <span className="ml-2 shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs font-medium text-white">
                    {contact.unreadCount}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
```

**Step 2: Verify it compiles**

Run: `cd packages/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/common/ContactList.tsx
git commit -m "feat: add shared ContactList component"
```

---

### Task 6: Build shared `ConversationThread` component

Scrollable list of `MessageBubble`s for a single vendor conversation.

**Files:**
- Create: `packages/app/src/renderer/components/common/ConversationThread.tsx`

**Step 1: Create ConversationThread**

```tsx
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";

export interface Communication {
  id: number;
  vendorId: number;
  vendorName: string | null;
  direction: string;
  channel: string;
  subject: string | null;
  bodyOriginal: string;
  bodyTranslated: string | null;
  language: string | null;
  sentAt: string | null;
  status: string;
  threadId: string | null;
  parsedAt: string | null;
}

interface ConversationThreadProps {
  messages: Communication[];
  vendorName?: string;
  onMessageAction?: (message: Communication) => void;
  actionLabel?: string;
}

export function ConversationThread({
  messages,
  vendorName,
  onMessageAction,
  actionLabel = "Ask AI",
}: ConversationThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-sm">No messages yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <div key={msg.id} className="group relative">
          <MessageBubble
            direction={msg.direction as "in" | "out"}
            channel={msg.channel}
            body={msg.bodyOriginal}
            translatedBody={msg.bodyTranslated}
            subject={msg.subject}
            senderName={msg.direction === "in" ? (msg.vendorName ?? "Vendor") : "You"}
            sentAt={msg.sentAt}
            status={msg.status}
          />
          {onMessageAction && (
            <button
              onClick={() => onMessageAction(msg)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md bg-white/10 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/20"
            >
              {actionLabel}
            </button>
          )}
        </div>
      ))}

      {/* Draft messages needing approval */}
      {messages.some((m) => m.status === "draft") && (
        <div className="mt-2 text-xs text-amber-400/70 text-center">
          Draft messages shown above need approval before sending
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd packages/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/common/ConversationThread.tsx
git commit -m "feat: add shared ConversationThread component"
```

---

### Task 7: Build `AgentSidePanel` component

Slide-out panel with a mini chat interface for AI actions on messages.

**Files:**
- Create: `packages/app/src/renderer/components/common/AgentSidePanel.tsx`

**Step 1: Create AgentSidePanel**

```tsx
import { useState, useEffect, useRef } from "react";
import { X, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ComposeBox } from "./ComposeBox";
import { useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import type { Communication } from "./ConversationThread";
import type { GatewayEvent } from "@wedding-planner/shared";

interface AgentSidePanelProps {
  open: boolean;
  communication: Communication | null;
  onClose: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function AgentSidePanel({ open, communication, onClose }: AgentSidePanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { mutate: dispatchAction } = useMutation<
    { communicationId: number; instruction: string; history: ChatMessage[] },
    { sessionKey: string }
  >("agent.action");

  // Reset chat when communication changes
  useEffect(() => {
    setMessages([]);
  }, [communication?.id]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for agent responses
  useEffect(() => {
    if (!loading) return;

    const unsub = wsClient.onEvent((event: GatewayEvent) => {
      if (event.name === "agent-complete") {
        const { summary } = event.data;
        setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
        setLoading(false);
      }
    });

    return unsub;
  }, [loading]);

  async function handleSend(instruction: string) {
    if (!communication) return;

    const userMsg: ChatMessage = { role: "user", content: instruction };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      await dispatchAction({
        communicationId: communication.id,
        instruction,
        history: [...messages, userMsg],
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to start agent. Please try again." },
      ]);
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 400, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-full border-l border-white/10 flex flex-col bg-gray-950 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-white">AI Assistant</span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Context preview */}
          {communication && (
            <div className="px-3 py-2 border-b border-white/10 bg-white/[0.03]">
              <p className="text-xs text-gray-500">
                {communication.channel} from {communication.vendorName ?? "unknown"}
              </p>
              <p className="text-xs text-gray-400 truncate mt-0.5">
                {communication.subject ?? communication.bodyOriginal.slice(0, 80)}
              </p>
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-xs mt-8">
                <p>Ask the AI to analyze this message.</p>
                <p className="mt-1 text-gray-600">
                  e.g. "Pull out pricing info" or "Draft a reply"
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm ${msg.role === "user" ? "text-gray-300" : "text-gray-400"}`}
              >
                <span className="text-xs font-medium text-gray-500 block mb-0.5">
                  {msg.role === "user" ? "You" : "AI"}
                </span>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                Working...
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Compose */}
          <ComposeBox
            onSend={handleSend}
            disabled={loading}
            placeholder="Ask about this message..."
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd packages/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/common/AgentSidePanel.tsx
git commit -m "feat: add AgentSidePanel component for per-message AI actions"
```

---

### Task 8: Add `agent.action` backend handler

Register a new `agent.action` RPC method that spawns a short-lived agent with the communication context.

**Files:**
- Modify: `packages/gateway/src/agents/task-configs.ts` (add "action" config)
- Modify: `packages/gateway/src/handlers/agents.ts` (add `agent.action` route)

**Step 1: Add action task config**

In `packages/gateway/src/agents/task-configs.ts`, add before the closing `];` of `TASK_CONFIGS`:

```ts
const ACTION_PROMPT = `You are a helpful assistant processing a specific vendor communication for a wedding planning app.

## Context
You've been given a communication (email or WhatsApp message) and a user instruction. Execute the instruction using the tools available to you.

## Common Tasks
- "Pull out relevant information" → Extract pricing, availability, contact details. Update the vendor record via dbQuery.
- "Draft a reply" → Compose a response appropriate for the channel. Save as a communication draft via dbQuery.
- "Summarize" → Provide a concise summary of the key points.
- "Update vendor record" → Extract and save relevant data to the vendor's database record.

## Guidelines
- Use dbSchema to understand the database structure before making changes
- Use dbQuery for all database reads and writes
- Be concise in your responses
- When updating vendor records, always confirm what you changed`;
```

And add to the TASK_CONFIGS array:

```ts
  {
    name: "action",
    systemPrompt: ACTION_PROMPT,
    tools: ["cmd", "dbQuery", "dbSchema", "gog"],
    maxSteps: 5,
  },
```

**Step 2: Add agent.action handler**

In `packages/gateway/src/handlers/agents.ts`, add after the `agent.translate` registration:

```ts
  router.register("agent.action", async (_db, params) => {
    const { communicationId, instruction, history } = params as {
      communicationId: number;
      instruction: string;
      history?: Array<{ role: string; content: string }>;
    };

    // Build context message with the communication content
    const contextMessages = [
      {
        role: "user",
        content: `Communication ID: ${communicationId}\n\nUser instruction: ${instruction}`,
      },
      ...(history ?? []).slice(0, -1), // Include prior conversation turns if any
    ];

    const { taskId, sessionKey } = await orchestrator.dispatch("action", {
      communicationId,
      instruction,
      messages: contextMessages,
    });
    return { taskId, sessionKey };
  });
```

**Step 3: Verify it compiles**

Run: `cd packages/gateway && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add packages/gateway/src/agents/task-configs.ts packages/gateway/src/handlers/agents.ts
git commit -m "feat: add agent.action handler for per-message AI actions"
```

---

### Task 9: Build WhatsApp view (replace Outreach)

Replace `OutreachView` with a full WhatsApp chat UI using `ContactList` + `ConversationThread` + `ComposeBox`.

**Files:**
- Rewrite: `packages/app/src/renderer/components/outreach/OutreachView.tsx` → rename to `packages/app/src/renderer/components/whatsapp/WhatsAppView.tsx`
- Modify: `packages/app/src/renderer/App.tsx` (update route + import)
- Modify: `packages/app/src/renderer/components/layout/Sidebar.tsx` (update nav item)
- Keep: `packages/app/src/renderer/components/outreach/DraftCard.tsx` and `ApprovalActions.tsx` (may still be used inline)

**Step 1: Create the WhatsApp view**

Create `packages/app/src/renderer/components/whatsapp/WhatsAppView.tsx`:

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { ContactList, type ContactSummary } from "../common/ContactList";
import { ConversationThread, type Communication } from "../common/ConversationThread";
import { ComposeBox } from "../common/ComposeBox";
import { AgentSidePanel } from "../common/AgentSidePanel";
import { ApprovalActions } from "../outreach/ApprovalActions";
import { EmptyState } from "../common/EmptyState";
import { MessageCircle } from "lucide-react";
import type { GatewayEvent } from "@wedding-planner/shared";

export function WhatsAppView() {
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [sidePanelComm, setSidePanelComm] = useState<Communication | null>(null);

  // Fetch all WhatsApp communications
  const {
    data: allMessages,
    loading,
    refetch,
  } = useRequest<Communication[]>("communications.list", {
    channel: "whatsapp",
  });

  const { mutate: approve } = useMutation<{ id: number }>("communications.approve");
  const { mutate: reject } = useMutation<{ id: number }>("communications.reject");
  const { mutate: sendWhatsApp } = useMutation<
    { vendorId: number; channel: string; customInstructions: string },
    unknown
  >("agent.outreach");

  // Listen for real-time updates
  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (
        event.name === "communication-received" ||
        event.name === "draft-ready" ||
        event.name === "agent-complete"
      ) {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  // Build contact list from messages
  const contacts: ContactSummary[] = useMemo(() => {
    if (!allMessages) return [];
    const byVendor = new Map<number, Communication[]>();
    for (const msg of allMessages) {
      const existing = byVendor.get(msg.vendorId) ?? [];
      existing.push(msg);
      byVendor.set(msg.vendorId, existing);
    }

    return Array.from(byVendor.entries())
      .map(([vendorId, msgs]) => {
        const sorted = msgs.sort(
          (a, b) => new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime()
        );
        const latest = sorted[0];
        return {
          vendorId,
          vendorName: latest.vendorName ?? "Unknown",
          lastMessage: latest.bodyOriginal.slice(0, 80),
          lastMessageAt: latest.sentAt,
          unreadCount: msgs.filter((m) => m.direction === "in" && m.status === "received" && !m.parsedAt).length,
          channel: "whatsapp",
        };
      })
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [allMessages]);

  // Filter messages for selected vendor
  const vendorMessages = useMemo(() => {
    if (!allMessages || !selectedVendorId) return [];
    return allMessages
      .filter((m) => m.vendorId === selectedVendorId)
      .sort((a, b) => new Date(a.sentAt ?? 0).getTime() - new Date(b.sentAt ?? 0).getTime());
  }, [allMessages, selectedVendorId]);

  // Draft messages needing approval
  const drafts = vendorMessages.filter((m) => m.status === "draft");

  async function handleSend(message: string) {
    if (!selectedVendorId) return;
    await sendWhatsApp({
      vendorId: selectedVendorId,
      channel: "whatsapp",
      customInstructions: `Send this exact message: ${message}`,
    });
    refetch();
  }

  async function handleApprove(id: number) {
    await approve({ id });
    refetch();
  }

  async function handleReject(id: number) {
    await reject({ id });
    refetch();
  }

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-72 border-r border-white/10 animate-pulse bg-white/[0.02]" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Contact list */}
      <div className="w-72 shrink-0">
        <ContactList
          contacts={contacts}
          selectedVendorId={selectedVendorId}
          onSelect={setSelectedVendorId}
        />
      </div>

      {/* Conversation area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedVendorId ? (
          <>
            {/* Vendor name header */}
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-semibold text-white">
                {contacts.find((c) => c.vendorId === selectedVendorId)?.vendorName ?? "Conversation"}
              </h2>
            </div>

            <ConversationThread
              messages={vendorMessages}
              onMessageAction={(msg) => setSidePanelComm(msg)}
            />

            {/* Draft approval bar */}
            {drafts.length > 0 && (
              <div className="px-4 py-2 border-t border-amber-500/20 bg-amber-500/5">
                {drafts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-1">
                    <span className="text-xs text-amber-400 truncate flex-1 mr-3">
                      Draft: {d.bodyOriginal.slice(0, 60)}...
                    </span>
                    <ApprovalActions
                      onApprove={() => handleApprove(d.id)}
                      onReject={() => handleReject(d.id)}
                    />
                  </div>
                ))}
              </div>
            )}

            <ComposeBox
              onSend={handleSend}
              placeholder="Type a message..."
            />
          </>
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="Select a conversation"
            description="Choose a vendor from the list to view their WhatsApp messages"
          />
        )}
      </div>

      {/* Agent side panel */}
      <AgentSidePanel
        open={sidePanelComm !== null}
        communication={sidePanelComm}
        onClose={() => setSidePanelComm(null)}
      />
    </div>
  );
}
```

**Step 2: Update App.tsx route**

In `packages/app/src/renderer/App.tsx`:

Replace the import:
```ts
// Before:
import { OutreachView } from "./components/outreach/OutreachView";
// After:
import { WhatsAppView } from "./components/whatsapp/WhatsAppView";
```

Replace the route:
```ts
// Before:
<Route path="outreach" element={<OutreachView />} />
// After:
<Route path="whatsapp" element={<WhatsAppView />} />
```

**Step 3: Update Sidebar**

In `packages/app/src/renderer/components/layout/Sidebar.tsx`:

Update the imports — replace `Send` with `MessageCircle` (already imported):
```ts
// Before:
import { LayoutDashboard, Search, Store, Send, Inbox, Calendar, DollarSign, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
// After:
import { LayoutDashboard, Search, Store, MessageCircle, Inbox, Calendar, DollarSign, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
```

Update the nav item:
```ts
// Before:
  { to: "/outreach", icon: Send, label: "Outreach" },
// After:
  { to: "/whatsapp", icon: MessageCircle, label: "WhatsApp" },
```

**Step 4: Verify the app builds**

Run: `cd packages/app && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add packages/app/src/renderer/components/whatsapp/WhatsAppView.tsx packages/app/src/renderer/App.tsx packages/app/src/renderer/components/layout/Sidebar.tsx
git commit -m "feat: replace Outreach with WhatsApp chat view"
```

---

### Task 10: Build Gmail-style Inbox view

Rewrite `InboxView` with a two-panel Gmail-like layout: email list on the left, detail panel on the right, AI side panel on far right.

**Files:**
- Rewrite: `packages/app/src/renderer/components/inbox/InboxView.tsx`

**Step 1: Rewrite InboxView**

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { AgentSidePanel } from "../common/AgentSidePanel";
import { EmptyState } from "../common/EmptyState";
import { Badge } from "../common/Badge";
import { Mail, Sparkles } from "lucide-react";
import type { Communication } from "../common/ConversationThread";
import type { GatewayEvent } from "@wedding-planner/shared";

export function InboxView() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sidePanelComm, setSidePanelComm] = useState<Communication | null>(null);

  const {
    data: messages,
    loading,
    refetch,
  } = useRequest<Communication[]>("communications.list", {
    channel: "email",
  });

  const { mutate: startOutreach } = useMutation<
    { vendorId: number; channel: string },
    unknown
  >("agent.outreach");

  // Listen for updates
  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (
        event.name === "communication-received" ||
        event.name === "agent-complete"
      ) {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  const selected = useMemo(
    () => messages?.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId],
  );

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-[400px] border-r border-white/10 animate-pulse bg-white/[0.02]" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Email list */}
      <div className="w-[400px] shrink-0 flex flex-col border-r border-white/10">
        <div className="p-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Inbox</h2>
          <p className="text-xs text-gray-500 mt-0.5">{messages?.length ?? 0} messages</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!messages || messages.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No emails yet"
              description="Emails will appear here when synced from Gmail"
            />
          ) : (
            messages.map((msg) => (
              <button
                key={msg.id}
                onClick={() => setSelectedId(msg.id)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                  selectedId === msg.id ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">
                    {msg.vendorName ?? "Unknown"}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {msg.status === "received" && !msg.parsedAt && (
                      <Badge variant="info">New</Badge>
                    )}
                    {msg.sentAt && (
                      <span className="text-xs text-gray-500">
                        {new Date(msg.sentAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>
                {msg.subject && (
                  <p className="text-sm text-gray-300 truncate">{msg.subject}</p>
                )}
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {msg.bodyOriginal.slice(0, 100)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-lg font-semibold text-white">
                  {selected.subject ?? "(No subject)"}
                </h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSidePanelComm(selected)}
                    className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 px-3 py-1.5 text-sm text-purple-400 hover:bg-purple-500/10 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Ask AI
                  </button>
                  <button
                    onClick={() => startOutreach({ vendorId: selected.vendorId, channel: "email" })}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    Reply
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span>From: {selected.vendorName ?? "Unknown"}</span>
                {selected.sentAt && (
                  <span>{new Date(selected.sentAt).toLocaleString()}</span>
                )}
                {selected.language && selected.language !== "en" && (
                  <Badge variant="warning">{selected.language}</Badge>
                )}
              </div>
            </div>

            {/* Translated body */}
            {selected.bodyTranslated && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                  English Translation
                </p>
                <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
                  {selected.bodyTranslated}
                </div>
              </div>
            )}

            {/* Original body */}
            <div>
              {selected.bodyTranslated && (
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                  Original ({selected.language ?? "unknown"})
                </p>
              )}
              <div className="whitespace-pre-wrap text-sm text-gray-400 leading-relaxed">
                {selected.bodyOriginal}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Mail}
            title="Select an email"
            description="Choose a message from the list to view its contents"
          />
        )}
      </div>

      {/* Agent side panel */}
      <AgentSidePanel
        open={sidePanelComm !== null}
        communication={sidePanelComm}
        onClose={() => setSidePanelComm(null)}
      />
    </div>
  );
}
```

**Step 2: Verify the app builds**

Run: `cd packages/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/inbox/InboxView.tsx
git commit -m "feat: rewrite Inbox as Gmail-style email view with AI side panel"
```

---

### Task 11: Implement Vendor Communications tab

Replace the `VendorComms` stub with an aggregated timeline.

**Files:**
- Rewrite: `packages/app/src/renderer/components/vendors/VendorComms.tsx`

**Step 1: Rewrite VendorComms**

```tsx
import { useState, useEffect, useCallback } from "react";
import { useRequest } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { ConversationThread, type Communication } from "../common/ConversationThread";
import { AgentSidePanel } from "../common/AgentSidePanel";
import { EmptyState } from "../common/EmptyState";
import { MessageSquare } from "lucide-react";
import type { GatewayEvent } from "@wedding-planner/shared";

export function VendorComms({ vendorId }: { vendorId: number }) {
  const [sidePanelComm, setSidePanelComm] = useState<Communication | null>(null);

  const {
    data: messages,
    loading,
    refetch,
  } = useRequest<Communication[]>("communications.list", {
    vendorId,
  });

  // Listen for updates
  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (
        event.name === "communication-received" ||
        event.name === "draft-ready" ||
        event.name === "agent-complete"
      ) {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  // Sort chronologically (oldest first)
  const sorted = (messages ?? []).sort(
    (a, b) => new Date(a.sentAt ?? 0).getTime() - new Date(b.sentAt ?? 0).getTime()
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No communications yet"
        description="WhatsApp and email messages with this vendor will appear here"
      />
    );
  }

  return (
    <div className="flex" style={{ height: "calc(100vh - 280px)" }}>
      <div className="flex-1 flex flex-col min-w-0">
        <ConversationThread
          messages={sorted}
          onMessageAction={(msg) => setSidePanelComm(msg)}
        />
      </div>

      <AgentSidePanel
        open={sidePanelComm !== null}
        communication={sidePanelComm}
        onClose={() => setSidePanelComm(null)}
      />
    </div>
  );
}
```

**Step 2: Verify the app builds**

Run: `cd packages/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/vendors/VendorComms.tsx
git commit -m "feat: implement Vendor Communications tab with aggregated timeline"
```

---

### Task 12: Clean up old Outreach files

The old OutreachView is no longer routed. The `DraftCard`, `ApprovalActions` components are still used by WhatsAppView. Clean up only what's unused.

**Files:**
- Delete: `packages/app/src/renderer/components/outreach/OutreachView.tsx` (replaced by WhatsAppView)
- Delete: `packages/app/src/renderer/components/inbox/InboxItem.tsx` (replaced by new InboxView)
- Delete: `packages/app/src/renderer/components/inbox/ParsedHighlights.tsx` (if only used by InboxItem)
- Keep: `packages/app/src/renderer/components/outreach/DraftCard.tsx` (still useful)
- Keep: `packages/app/src/renderer/components/outreach/ApprovalActions.tsx` (used by WhatsAppView)

**Step 1: Delete unused files**

```bash
rm packages/app/src/renderer/components/outreach/OutreachView.tsx
rm packages/app/src/renderer/components/inbox/InboxItem.tsx
```

Check if `ParsedHighlights` is used anywhere else before deleting:
```bash
grep -r "ParsedHighlights" packages/app/src/renderer/ --include="*.tsx"
```

If only used by InboxItem, delete it too.

**Step 2: Verify the app builds**

Run: `cd packages/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add -A packages/app/src/renderer/components/outreach/ packages/app/src/renderer/components/inbox/
git commit -m "chore: remove unused OutreachView and InboxItem components"
```

---

### Task 13: Integration test — full build and visual verification

**Step 1: Run full TypeScript check**

```bash
cd packages/app && npx tsc --noEmit
cd ../gateway && npx tsc --noEmit
cd ../shared && npx tsc --noEmit
```

**Step 2: Run existing tests**

```bash
cd packages/gateway && npx vitest run
```

**Step 3: Start the app and visually verify**

```bash
npm run dev
```

Check:
- [ ] Sidebar shows "WhatsApp" with MessageCircle icon instead of "Outreach"
- [ ] WhatsApp view loads with contact list on left, conversation on right
- [ ] Inbox shows email list on left, detail panel on right
- [ ] "Ask AI" button opens the side panel
- [ ] Vendor detail > Communications tab shows messages (if any exist)
- [ ] Empty states render correctly for all three views

**Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: integration fixes for messaging UI overhaul"
```
