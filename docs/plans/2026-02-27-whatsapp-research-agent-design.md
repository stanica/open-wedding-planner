# WhatsApp Research Agent — Design

## Overview

Allow the wedding planner couple to chat with the research agent via WhatsApp self-chat ("Message Yourself"). Messages are routed to the same research agent used in the desktop app, with full tool access. Threads created from WhatsApp appear as normal research threads in the Electron app.

## Existing Infrastructure (no changes needed)

- `WhatsAppChannel` class — Baileys connection, QR auth, reconnection, cred backup
- Delivery queue — persistent file-based queue with retry
- `sendWhatsApp` tool — used by outreach agent
- Incoming message handler — matches vendor phone numbers
- UI — WhatsApp setup (QR code, status, auto-send toggle)
- DB schema — `communications`, `vendors.contactWhatsapp`, `aiConfig.whatsappAutoSend`

## Design

### 1. Self-Chat Detection

**File:** `packages/gateway/src/channels/whatsapp.ts`

The `messages.upsert` handler currently skips all `fromMe` messages. Change this to detect self-chat:

- Expose the connected user's JID via a `getUserJid()` method on `WhatsAppChannel` (from `this.socket.user.id`)
- In the `messages.upsert` handler, when `msg.key.fromMe` is true AND `msg.key.remoteJid` matches the user's own JID, route to `onIncoming` with a `selfChat: true` flag
- Non-self-chat `fromMe` messages are still skipped
- The `onIncoming` callback signature gains `selfChat: boolean`

### 2. Command Router

**New file:** `packages/gateway/src/channels/whatsapp-commands.ts`

Before dispatching to the research agent, self-chat messages pass through a command router that checks for a `/` prefix.

| Command   | Behavior |
|-----------|----------|
| `/new`    | Create a new research thread, set it as active, reply "New thread started." |
| `/status` | Reply with current thread title + agent queue status |
| `/help`   | Reply with list of available commands |

Implementation: a plain function `handleWhatsAppCommand(body, ctx) → { handled: boolean }`. Each command is a simple `startsWith` check. Called in the incoming handler before agent dispatch. If `handled: true`, no agent is invoked.

### 3. Thread Management

**Active thread persistence:** Add `whatsapp_active_thread_id` integer column to the `aiConfig` table. Read on startup, update on `/new`.

**Auto-creation:** On first self-chat message when no active thread exists, auto-create a research thread titled "WhatsApp" and persist its ID.

**Thread rows:** Standard `researchThreads` + `researchMessages` rows. No special markers — they appear in the desktop app alongside threads created from the UI.

### 4. Agent Dispatch

Self-chat messages follow the same path as the desktop `agent.research` handler:

1. Save user message to `researchMessages` with `role: "user"` on the active thread
2. Load thread message history from `researchMessages`
3. Apply compaction (same logic as `agent.research` handler — find last system marker, use summary + post-marker messages)
4. Call `orchestrator.dispatch("research", { threadId, messages })`

Full research agent toolset, auto-approved (same as desktop).

### 5. Unified Message Queue

**Scope:** This queue works for both WhatsApp and desktop UI messages. It lives at the orchestrator/handler level, not in the WhatsApp layer.

**Per-thread queue behavior:**

- When `agent.research` is invoked (from either channel) and an agent is already running on that thread:
  - The user message is saved to `researchMessages` in the DB immediately (visible in desktop UI)
  - The message is marked as queued internally (in-memory set of threadIds with pending messages)
- When an agent run completes on a thread:
  - Check if there are queued messages (user messages in `researchMessages` newer than the last assistant message)
  - If yes, auto-dispatch a new agent run with the full updated message history
  - This continues until the queue drains

**Desktop UI change:** Remove the input-disabled state while agent is running. Users can type and send freely — messages appear in chat immediately and get processed after the current run finishes.

**Gateway restart:** Queued state is in-memory and lost on restart. The messages are already persisted in `researchMessages`, but auto-dispatch won't happen. User can resend. Acceptable trade-off.

### 6. Response Delivery (WhatsApp)

Subscribe to agent completion for WhatsApp-originated sessions:

- Track which sessionKeys originated from WhatsApp in a `Set<string>` (in-memory)
- On `agent-complete`: read the latest assistant message from `researchMessages`
- Send only text content back via `whatsapp.send(userJid, text)`
- Chunk at ~4000 chars if needed, send sequentially
- On agent error: send "Something went wrong, try again."

### 7. Typing Indicator

- Call `sock.sendPresenceUpdate("composing", userJid)` when dispatching an agent run from WhatsApp
- Call `sock.sendPresenceUpdate("paused", userJid)` when the agent completes or errors
- Exposed as `sendTyping(jid)` / `stopTyping(jid)` methods on `WhatsAppChannel`

### 8. Error Handling

- Agent failure → send short error message, clear typing indicator
- Baileys disconnect mid-agent-run → agent continues (it's in the orchestrator), response is lost but thread state is preserved. User can send another message after reconnect.
- Self-chat message with empty body → skip silently

## Files Changed

| File | Change |
|------|--------|
| `packages/gateway/src/channels/whatsapp.ts` | Self-chat detection, `getUserJid()`, typing indicator methods |
| `packages/gateway/src/channels/whatsapp-commands.ts` | **New** — command router |
| `packages/gateway/src/index.ts` | Self-chat routing in incoming handler, agent completion subscription |
| `packages/gateway/src/handlers/agents.ts` | Unified queue logic in `agent.research` handler |
| `packages/gateway/src/db/schema.ts` | `whatsappActiveThreadId` column on `aiConfig` |
| `packages/gateway/src/db/migrate.ts` | Migration for new column |
| `packages/app/src/renderer/components/research/ResearchView.tsx` | Remove input-disabled state during agent runs |

## Not In Scope

- WhatsApp media messages (images, audio, documents) — text only for now
- Tool call progress updates via WhatsApp — too noisy
- WhatsApp-specific thread labels or icons in the desktop UI
- Group chat support — self-chat only
