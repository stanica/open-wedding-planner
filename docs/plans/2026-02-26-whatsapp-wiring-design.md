# WhatsApp End-to-End Wiring Design

## Goal

Connect the existing WhatsApp/Baileys infrastructure so users can:
1. Link their WhatsApp account via QR code
2. Have the outreach agent send messages to vendors (with configurable auto-send or draft queue)
3. Automatically parse incoming vendor replies

## Existing Infrastructure

Already built but not wired together:
- `WhatsAppChannel` — Baileys client with QR auth, reconnection, credential backup
- `DeliveryQueue` — file-based queue with retry/backoff, supports WhatsApp entries
- `WhatsAppSetup.tsx` — UI with connect/disconnect and QR display
- `whatsapp-auth` handlers — `whatsapp.connect`, `whatsapp.disconnect`, `whatsapp.status`
- `communications` table — direction, channel, status (draft/approved/sent/received), body
- `vendors.contactWhatsapp` — phone numbers for vendors
- `communications.approve` / `communications.reject` handlers

## Design

### 1. Auto-send Setting

Add `whatsappAutoSend` column to `aiConfig` table (integer, default 0).

- **Off (default):** outreach agent creates communications with status `"draft"` — user reviews in a queue
- **On:** drafts are immediately enqueued in `DeliveryQueue` and sent

UI: toggle in WhatsApp settings panel. Uses existing `ai-config.update` handler pattern.

### 2. Sending Flow

New `sendWhatsApp` tool registered in the tool registry, available to the outreach agent.

```
Agent calls sendWhatsApp(vendorId, message)
  → Look up vendor's contactWhatsapp number
  → Create communications record (direction: "out", channel: "whatsapp")
  → If autoSend ON:  status = "approved", enqueue in DeliveryQueue
  → If autoSend OFF: status = "draft" (sits in review queue)
```

When user approves a draft via `communications.approve`:
  → Status moves to `"approved"`
  → Backend enqueues in `DeliveryQueue`

DeliveryQueue's WhatsApp `sendFn`:
  → Calls `WhatsAppChannel.send(phone, text)`
  → On success: update communication status to `"sent"`, set `sentAt`
  → On failure: DeliveryQueue handles retry with exponential backoff

Status flow: `draft` → `approved` → `sent` (or `failed`)

### 3. Incoming Messages

`WhatsAppChannel.onIncoming()` handler:

```
Message arrives (from, body, messageId)
  → Match phone number to vendor via vendors.contactWhatsapp
  → Create communications record (direction: "in", channel: "whatsapp", status: "received")
  → Dispatch parser agent via orchestrator with communication ID
  → Parser extracts pricing/availability, creates quotes, updates vendor
```

Unmatched phone numbers: still log the communication (vendorId null), broadcast notification to UI.

### 4. QR Code Rendering

Replace ASCII `<pre>` in `WhatsAppSetup.tsx` with `qrcode.react` to render a scannable QR image from the Baileys QR string.

### 5. Gateway Startup Wiring

In `startGateway()`:

1. Instantiate `WhatsAppChannel(config, broadcast)`
2. Instantiate `DeliveryQueue(getDeliveryQueueDir())`
3. Register WhatsApp `sendFn` on delivery queue — looks up communication, calls `WhatsAppChannel.send()`, updates status
4. Register `onIncoming` handler — creates communication, dispatches parser agent
5. Call `registerWhatsAppAuthHandlers(router, whatsapp)` (exists, just not called)
6. Register `sendWhatsApp` tool in tool registry
7. Start delivery queue processing, add cleanup to shutdown
8. Recover any in-flight entries on startup

### 6. Outreach Agent Update

Add `sendWhatsApp` to the outreach task config's tools list. Update the system prompt to instruct the agent to use the tool after drafting a message.

## New Code Summary

| Component | Location | ~Lines |
|-----------|----------|--------|
| `sendWhatsApp` tool | `packages/gateway/src/tools/send-whatsapp.ts` | 50 |
| Gateway startup wiring | `packages/gateway/src/index.ts` | 30 |
| Approval → delivery bridge | `packages/gateway/src/handlers/communications.ts` | 20 |
| Incoming message handler | `packages/gateway/src/index.ts` or separate file | 40 |
| Auto-send setting (schema + handler) | schema.ts + ai-config.ts | 20 |
| Auto-send UI toggle | `WhatsAppSetup.tsx` | 15 |
| QR code image rendering | `WhatsAppSetup.tsx` + dep | 10 |

No new tables. One new column on `aiConfig`. One new tool file.
