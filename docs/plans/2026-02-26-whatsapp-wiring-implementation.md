# WhatsApp End-to-End Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up the existing WhatsApp/Baileys infrastructure so users can connect their WhatsApp, have agents send messages (with configurable auto-send or draft queue), and auto-parse incoming vendor replies.

**Architecture:** The existing `WhatsAppChannel`, `DeliveryQueue`, auth handlers, and UI components are connected together in `startGateway()`. A new `sendWhatsApp` tool lets the outreach agent create communications. The `DeliveryQueue` handles actual delivery with retry. Incoming messages are matched to vendors and auto-dispatched to the parser agent.

**Tech Stack:** Baileys (already installed), drizzle-orm, Vercel AI SDK tool system, qrcode.react (new dep for QR rendering)

---

### Task 1: Add `whatsappAutoSend` column to aiConfig

**Files:**
- Modify: `packages/gateway/src/db/schema.ts:181-187`
- Modify: `packages/gateway/src/db/migrate.ts:215-221`

**Step 1: Add column to Drizzle schema**

In `packages/gateway/src/db/schema.ts`, add `whatsappAutoSend` to the `aiConfig` table:

```ts
export const aiConfig = sqliteTable("ai_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().default("api-key"),
  model: text("model").notNull().default("claude-sonnet-4-20250514"),
  proxyUrl: text("proxy_url").notNull().default("http://localhost:3456/v1"),
  apiKey: text("api_key"),
  whatsappAutoSend: integer("whatsapp_auto_send").notNull().default(0),
});
```

**Step 2: Add migration for existing databases**

In `packages/gateway/src/db/migrate.ts`, add after the existing `api_key` migration:

```ts
try {
  sqlite.exec(`ALTER TABLE ai_config ADD COLUMN whatsapp_auto_send INTEGER NOT NULL DEFAULT 0;`);
} catch {
  // Column already exists
}
```

**Step 3: Commit**

```bash
git add packages/gateway/src/db/schema.ts packages/gateway/src/db/migrate.ts
git commit -m "feat: add whatsappAutoSend column to aiConfig"
```

---

### Task 2: Expose auto-send setting in AI config handlers

**Files:**
- Modify: `packages/gateway/src/handlers/ai-config.ts:87-146`

**Step 1: Update `ai-config.get` handler**

Add `whatsappAutoSend` to the returned config object. In the `row` branch:

```ts
whatsappAutoSend: !!row.whatsappAutoSend,
```

**Step 2: Update `ai-config.update` handler**

In the `updates` object construction, add:

```ts
if (data.whatsappAutoSend !== undefined) {
  updates.whatsappAutoSend = data.whatsappAutoSend ? 1 : 0;
}
```

The `data` type needs to accept `whatsappAutoSend?: boolean`. Since it's typed as `Partial<AIProviderConfig>`, either extend that type or use a broader params type.

**Step 3: Commit**

```bash
git add packages/gateway/src/handlers/ai-config.ts
git commit -m "feat: expose whatsappAutoSend in ai-config handlers"
```

---

### Task 3: Create `sendWhatsApp` tool

**Files:**
- Create: `packages/gateway/src/tools/send-whatsapp.ts`
- Modify: `packages/gateway/src/tools/index.ts`

**Step 1: Write the test**

Create `packages/gateway/tests/tools/send-whatsapp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSendWhatsAppTool } from "../../src/tools/send-whatsapp.js";

describe("sendWhatsApp tool", () => {
  it("creates a draft communication when autoSend is off", async () => {
    const insertValues = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) });
    const selectWhere = vi.fn().mockResolvedValue([{ id: 1, contactWhatsapp: "+39123456789", name: "Test Vendor" }]);
    const mockDb = {
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: selectWhere }) }),
    };
    const mockGetAutoSend = () => false;
    const mockEnqueue = vi.fn();
    const mockEmit = vi.fn();

    const tool = makeSendWhatsAppTool({
      db: mockDb as any,
      emit: mockEmit,
      getAutoSend: mockGetAutoSend,
      enqueue: mockEnqueue,
    });

    // The tool should be defined with proper schema
    expect(tool).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/send-whatsapp.test.ts`
Expected: FAIL — module not found

**Step 3: Write the tool implementation**

Create `packages/gateway/src/tools/send-whatsapp.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendors, communications } from "../db/schema.js";
import type { Db } from "../infra/router.js";

export interface SendWhatsAppContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
  getAutoSend: () => boolean;
  enqueue: (channel: "whatsapp", vendorId: number, payload: unknown) => void;
}

export function makeSendWhatsAppTool(ctx: SendWhatsAppContext) {
  return tool({
    description:
      "Send a WhatsApp message to a vendor. Looks up the vendor's WhatsApp number and either sends immediately (if auto-send is on) or creates a draft for user review.",
    inputSchema: z.object({
      vendorId: z.number().describe("The vendor ID to message"),
      message: z.string().describe("The message text to send"),
    }),
    execute: async ({ vendorId, message }) => {
      // Look up vendor
      const [vendor] = await ctx.db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId));
      if (!vendor) return { error: "Vendor not found" };
      if (!vendor.contactWhatsapp) return { error: "Vendor has no WhatsApp number" };

      const autoSend = ctx.getAutoSend();
      const status = autoSend ? "approved" : "draft";

      // Create communication record
      const [comm] = await ctx.db
        .insert(communications)
        .values({
          vendorId,
          direction: "out",
          channel: "whatsapp",
          bodyOriginal: message,
          status,
        })
        .returning();

      ctx.emit("send-whatsapp", `${autoSend ? "Queued" : "Drafted"} WhatsApp message to ${vendor.name}`);

      // If auto-send, enqueue for delivery
      if (autoSend) {
        ctx.enqueue("whatsapp", vendorId, {
          communicationId: comm.id,
          to: vendor.contactWhatsapp,
          text: message,
        });
      }

      return {
        communicationId: comm.id,
        status,
        vendorName: vendor.name,
        message: autoSend
          ? "Message queued for delivery"
          : "Message saved as draft for user review",
      };
    },
  });
}
```

**Step 4: Register in tool registry**

In `packages/gateway/src/tools/index.ts`, add the import and registration:

```ts
import { makeSendWhatsAppTool } from "./send-whatsapp.js";
```

Add inside `createToolRegistry()`:

```ts
registry.registerFactory("sendWhatsApp", {
  description: "Send a WhatsApp message to a vendor",
  category: "messaging",
  create: (ctx: unknown) => makeSendWhatsAppTool(ctx as any),
});
```

**Step 5: Run test**

Run: `cd packages/gateway && npx vitest run tests/tools/send-whatsapp.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/tools/send-whatsapp.ts packages/gateway/src/tools/index.ts packages/gateway/tests/tools/send-whatsapp.test.ts
git commit -m "feat: add sendWhatsApp tool for outreach agent"
```

---

### Task 4: Wire WhatsApp channel into gateway startup

**Files:**
- Modify: `packages/gateway/src/index.ts`

This is the core wiring task. The gateway needs to:
1. Instantiate `WhatsAppChannel`
2. Instantiate `DeliveryQueue`
3. Register WhatsApp send function on delivery queue
4. Register incoming message handler
5. Register auth handlers
6. Start delivery queue processing
7. Clean up on shutdown

**Step 1: Add imports to index.ts**

```ts
import { WhatsAppChannel } from "./channels/whatsapp.js";
import { DeliveryQueue } from "./infra/delivery-queue.js";
import { registerWhatsAppAuthHandlers } from "./handlers/whatsapp-auth.js";
import { getDeliveryQueueDir, getDataDir } from "./config/paths.js";
```

**Step 2: Instantiate WhatsApp channel and delivery queue after WebSocket server**

After `const wsServer = await createWsServer(...)` (line 72), add:

```ts
// 7b. WhatsApp channel + delivery queue
const whatsapp = new WhatsAppChannel(
  { dataDir: getDataDir() },
  (event) => wsServer.broadcast(event),
);

const deliveryQueue = new DeliveryQueue(getDeliveryQueueDir());
deliveryQueue.recover();
```

**Step 3: Register WhatsApp send function on delivery queue**

```ts
deliveryQueue.registerChannel("whatsapp", async (entry) => {
  const payload = entry.payload as { communicationId: number; to: string; text: string };
  await whatsapp.send(payload.to, payload.text);
  // Update communication status to sent
  await db
    .update(schema.communications)
    .set({ status: "sent", sentAt: new Date().toISOString() })
    .where(eq(schema.communications.id, payload.communicationId));
});
```

Will need `import { eq } from "drizzle-orm"` at the top.

**Step 4: Register incoming message handler**

```ts
whatsapp.onIncoming(async ({ from, body, messageId }) => {
  // Match phone to vendor
  const matchedVendors = await db
    .select()
    .from(schema.vendors)
    .where(eq(schema.vendors.contactWhatsapp, from));
  const vendor = matchedVendors[0] ?? null;

  // Create communication record
  const [comm] = await db
    .insert(schema.communications)
    .values({
      vendorId: vendor?.id ?? 0,
      direction: "in",
      channel: "whatsapp",
      bodyOriginal: body,
      status: "received",
      threadId: messageId,
    })
    .returning();

  wsServer.broadcast({
    name: "agent-activity",
    data: {
      sessionKey: "whatsapp-incoming",
      action: "message-received",
      detail: `WhatsApp from ${vendor?.name ?? from}: ${body.slice(0, 100)}`,
    },
  });

  // Auto-dispatch parser agent if vendor matched
  if (vendor) {
    orchestrator.dispatch("parse", {
      communicationId: comm.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      messageBody: body,
    });
  }
});
```

**Step 5: Register auth handlers**

After `registerAllHandlers(router, proxyManager)` (line 57), add:

```ts
registerWhatsAppAuthHandlers(router, whatsapp);
```

**Step 6: Start delivery queue and add to cleanup**

After heartbeat start:

```ts
deliveryQueue.startProcessing(5000);
```

In the `stop()` function, add before `sqlite.close()`:

```ts
deliveryQueue.stopProcessing();
whatsapp.disconnect();
```

**Step 7: Pass WhatsApp dependencies to tool registry context**

The `sendWhatsApp` tool factory needs access to `db`, `deliveryQueue`, and the auto-send setting. The tool context already flows through `ToolFactoryContext` in `runner.ts`. We need to extend it.

In `packages/gateway/src/agents/runner.ts`, add to `ToolFactoryContext`:

```ts
export interface ToolFactoryContext {
  db: unknown;
  emit: (action: string, detail?: string) => void;
  sqlite: unknown;
  workspaceDir: string;
  permissionCallbacks: unknown;
  deliveryQueue?: unknown;
  getAutoSend?: () => boolean;
}
```

In `packages/gateway/src/index.ts`, where the orchestrator is created, the tool context flows through `orchestrator.execute()`. We need to make `deliveryQueue` and `getAutoSend` available. Update the orchestrator construction to pass these:

In `orchestrator.ts`, the `ToolFactoryContext` is built in `execute()`. Add `deliveryQueue` and `getAutoSend` to the context built there. The orchestrator constructor needs these as additional params.

Add to the `Orchestrator` constructor:

```ts
constructor(
  db: Db,
  broadcast: (event: GatewayEvent) => void,
  toolRegistry: ToolRegistry,
  config?: unknown,
  sqlite?: unknown,
  private extraToolCtx?: Record<string, unknown>,
)
```

In `execute()`, merge `extraToolCtx` into `toolCtx`:

```ts
const toolCtx: ToolFactoryContext = {
  db: this.db,
  emit,
  sqlite: this.sqlite,
  workspaceDir: getWorkspaceDir(),
  permissionCallbacks,
  ...this.extraToolCtx,
};
```

In `index.ts`, pass the extra context:

```ts
const autoSendGetter = () => {
  const [row] = db.select().from(aiConfig).limit(1).all();
  return !!row?.whatsappAutoSend;
};

const orchestrator = new Orchestrator(db, (event) => {
  wsServer.broadcast(event);
}, toolRegistry, undefined, sqlite, {
  deliveryQueue,
  getAutoSend: autoSendGetter,
});
```

Then update the `sendWhatsApp` factory in `tools/index.ts` to extract these from context:

```ts
registry.registerFactory("sendWhatsApp", {
  description: "Send a WhatsApp message to a vendor",
  category: "messaging",
  create: (ctx: unknown) => {
    const { db, emit, deliveryQueue, getAutoSend } = ctx as any;
    return makeSendWhatsAppTool({
      db,
      emit,
      getAutoSend: getAutoSend ?? (() => false),
      enqueue: deliveryQueue
        ? (channel: string, vendorId: number, payload: unknown) =>
            (deliveryQueue as any).enqueue(channel, vendorId, payload)
        : () => { throw new Error("Delivery queue not available"); },
    });
  },
});
```

**Step 8: Commit**

```bash
git add packages/gateway/src/index.ts packages/gateway/src/agents/runner.ts packages/gateway/src/agents/orchestrator.ts packages/gateway/src/tools/index.ts
git commit -m "feat: wire WhatsApp channel, delivery queue, and incoming handler into gateway"
```

---

### Task 5: Bridge approval handler to delivery queue

**Files:**
- Modify: `packages/gateway/src/handlers/communications.ts`

When a user approves a draft WhatsApp message, it needs to be enqueued in the delivery queue.

**Step 1: Accept delivery queue dependency**

Change the handler registration to accept a `DeliveryQueue`:

```ts
import type { DeliveryQueue } from "../infra/delivery-queue.js";

export function registerCommunicationHandlers(router: Router, deliveryQueue?: DeliveryQueue) {
```

**Step 2: Update `communications.approve` handler**

After setting status to `"approved"`, enqueue for delivery if it's a WhatsApp message:

```ts
router.register("communications.approve", async (db: Db, params: unknown) => {
  const { id } = params as { id: number };
  await db
    .update(communications)
    .set({ status: "approved" })
    .where(eq(communications.id, id));
  const [updated] = await db
    .select()
    .from(communications)
    .where(eq(communications.id, id));

  // Enqueue approved WhatsApp messages for delivery
  if (updated && updated.channel === "whatsapp" && updated.direction === "out" && deliveryQueue) {
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, updated.vendorId));
    if (vendor?.contactWhatsapp) {
      deliveryQueue.enqueue("whatsapp", updated.vendorId, {
        communicationId: updated.id,
        to: vendor.contactWhatsapp,
        text: updated.bodyOriginal,
      });
    }
  }

  return updated;
});
```

Add `import { vendors } from "../db/schema.js"` (vendors may already be imported — check).

**Step 3: Update handler registration in `handlers/index.ts`**

```ts
import type { DeliveryQueue } from "../infra/delivery-queue.js";

export function registerAllHandlers(router: Router, proxyManager: ProxyManager, deliveryQueue?: DeliveryQueue) {
  // ...
  registerCommunicationHandlers(router, deliveryQueue);
  // ...
}
```

And in `index.ts`, pass the delivery queue:

```ts
registerAllHandlers(router, proxyManager, deliveryQueue);
```

Note: `deliveryQueue` must be instantiated before `registerAllHandlers` is called — reorder as needed.

**Step 4: Commit**

```bash
git add packages/gateway/src/handlers/communications.ts packages/gateway/src/handlers/index.ts packages/gateway/src/index.ts
git commit -m "feat: bridge communications.approve to delivery queue for WhatsApp"
```

---

### Task 6: Add `sendWhatsApp` to outreach agent config

**Files:**
- Modify: `packages/gateway/src/agents/task-configs.ts`

**Step 1: Add tool to outreach config**

In `TASK_CONFIGS`, update the outreach entry:

```ts
{
  name: "outreach",
  systemPrompt: OUTREACH_PROMPT,
  tools: ["cmd", "dbQuery", "dbSchema", "sendWhatsApp"],
  maxSteps: 5,
},
```

**Step 2: Update outreach system prompt**

Update `OUTREACH_PROMPT` to mention the sendWhatsApp tool:

```ts
const OUTREACH_PROMPT = `You are drafting outreach messages to wedding vendors.
You have access to the database to look up vendor details and wedding configuration.

## Process
1. Use dbSchema to understand the database structure
2. Use dbQuery to fetch vendor details and wedding configuration
3. Draft a professional, warm message appropriate for the channel (email or WhatsApp)
4. For WhatsApp messages, use the sendWhatsApp tool to send/queue the message
5. For other channels, use dbQuery to save the draft as a communication record

## Guidelines
- Be warm but professional
- Include relevant wedding details (date, guest count, budget context)
- Respect the couple's language preferences
- When sending via WhatsApp, use sendWhatsApp with the vendorId and composed message
- The message may be sent immediately or queued for user review depending on settings`;
```

**Step 3: Commit**

```bash
git add packages/gateway/src/agents/task-configs.ts
git commit -m "feat: add sendWhatsApp tool to outreach agent"
```

---

### Task 7: Render proper QR code in UI

**Files:**
- Modify: `packages/app/package.json` (new dep)
- Modify: `packages/app/src/renderer/components/settings/WhatsAppSetup.tsx`

**Step 1: Install qrcode.react**

```bash
cd packages/app && npm install qrcode.react
```

**Step 2: Update WhatsAppSetup.tsx**

Replace the ASCII `<pre>` block with a proper QR code component:

```tsx
import { QRCodeSVG } from "qrcode.react";
```

Replace the QR display section (inside `{qrCode && status === "connecting" && (...)}`):

```tsx
{qrCode && status === "connecting" && (
  <div className="flex flex-col items-center gap-3 py-4">
    <p className="text-sm text-gray-300">
      Scan this QR code with WhatsApp on your phone
    </p>
    <div className="rounded-xl bg-white p-4">
      <QRCodeSVG value={qrCode} size={256} />
    </div>
    <p className="text-xs text-gray-500">
      Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device
    </p>
  </div>
)}
```

**Step 3: Commit**

```bash
git add packages/app/package.json packages/app/package-lock.json packages/app/src/renderer/components/settings/WhatsAppSetup.tsx
git commit -m "feat: render scannable QR code for WhatsApp linking"
```

---

### Task 8: Add auto-send toggle to WhatsApp settings UI

**Files:**
- Modify: `packages/app/src/renderer/components/settings/WhatsAppSetup.tsx`

**Step 1: Add auto-send toggle**

Extend the component props:

```tsx
interface WhatsAppSetupProps {
  status: "disconnected" | "connecting" | "connected";
  qrCode: string | null;
  autoSend: boolean;
  onAutoSendChange: (value: boolean) => void;
}
```

Add toggle UI after the connected state section:

```tsx
{status === "connected" && (
  <div className="space-y-3">
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-white">Auto-send messages</p>
        <p className="text-xs text-gray-400">
          When off, outgoing messages are saved as drafts for your review
        </p>
      </div>
      <button
        onClick={() => onAutoSendChange(!autoSend)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          autoSend ? "bg-green-600" : "bg-gray-600"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            autoSend ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>

    <button
      onClick={handleDisconnect}
      className="w-full rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
    >
      Disconnect
    </button>
  </div>
)}
```

**Step 2: Wire up in IntegrationStatus**

In `packages/app/src/renderer/components/settings/IntegrationStatus.tsx`, fetch the auto-send setting and pass it down:

```tsx
import { useQuery, useMutation } from "../../hooks/useRequest";
```

Add state and fetch:

```tsx
const { data: aiConfigData } = useQuery("ai-config.get");
const { mutate: updateAiConfig } = useMutation("ai-config.update");

const autoSend = aiConfigData?.whatsappAutoSend ?? false;

function handleAutoSendChange(value: boolean) {
  updateAiConfig({ whatsappAutoSend: value });
}
```

Pass to WhatsAppSetup:

```tsx
<WhatsAppSetup
  status={statuses.whatsapp}
  qrCode={whatsappQr}
  autoSend={autoSend}
  onAutoSendChange={handleAutoSendChange}
/>
```

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/settings/WhatsAppSetup.tsx packages/app/src/renderer/components/settings/IntegrationStatus.tsx
git commit -m "feat: add auto-send toggle to WhatsApp settings"
```

---

### Task 9: Integration test — full send flow

**Files:**
- Create: `packages/gateway/tests/whatsapp-flow.test.ts`

**Step 1: Write integration test**

Test the full flow: tool creates communication → approval enqueues → delivery queue processes.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSchema } from "../src/db/migrate.js";
import * as schema from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { DeliveryQueue } from "../src/infra/delivery-queue.js";
import { makeSendWhatsAppTool } from "../src/tools/send-whatsapp.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("WhatsApp send flow", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    pushSchema(sqlite);
    db = drizzle(sqlite, { schema });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-test-"));
  });

  it("creates draft when autoSend is off", async () => {
    // Seed a vendor
    const [vendor] = await db.insert(schema.vendors).values({
      categoryId: 1,
      name: "Test Venue",
      contactWhatsapp: "+39123456789",
    }).returning();

    // Seed category
    await db.insert(schema.categories).values({
      id: 1, name: "Venue/Food/Beverage",
      budgetPercentLow: 0.4, budgetPercentHigh: 0.5, sortOrder: 1,
    }).onConflictDoNothing();

    const enqueue = vi.fn();
    const tool = makeSendWhatsAppTool({
      db,
      emit: vi.fn(),
      getAutoSend: () => false,
      enqueue,
    });

    const result = await tool.execute(
      { vendorId: vendor.id, message: "Hello!" },
      { toolCallId: "test", messages: [], abortSignal: AbortSignal.timeout(5000) },
    );

    expect(result.status).toBe("draft");
    expect(enqueue).not.toHaveBeenCalled();

    // Check communication was created
    const comms = await db.select().from(schema.communications);
    expect(comms).toHaveLength(1);
    expect(comms[0].status).toBe("draft");
    expect(comms[0].channel).toBe("whatsapp");
  });

  it("enqueues when autoSend is on", async () => {
    const [vendor] = await db.insert(schema.vendors).values({
      categoryId: 1,
      name: "Test Venue",
      contactWhatsapp: "+39123456789",
    }).returning();

    await db.insert(schema.categories).values({
      id: 1, name: "Venue/Food/Beverage",
      budgetPercentLow: 0.4, budgetPercentHigh: 0.5, sortOrder: 1,
    }).onConflictDoNothing();

    const enqueue = vi.fn();
    const tool = makeSendWhatsAppTool({
      db,
      emit: vi.fn(),
      getAutoSend: () => true,
      enqueue,
    });

    const result = await tool.execute(
      { vendorId: vendor.id, message: "Hello!" },
      { toolCallId: "test", messages: [], abortSignal: AbortSignal.timeout(5000) },
    );

    expect(result.status).toBe("approved");
    expect(enqueue).toHaveBeenCalledWith("whatsapp", vendor.id, expect.objectContaining({
      to: "+39123456789",
      text: "Hello!",
    }));
  });
});
```

**Step 2: Run the test**

Run: `cd packages/gateway && npx vitest run tests/whatsapp-flow.test.ts`
Expected: PASS (both tests)

**Step 3: Commit**

```bash
git add packages/gateway/tests/whatsapp-flow.test.ts
git commit -m "test: add WhatsApp send flow integration tests"
```

---

### Task 10: Verify all existing tests still pass

**Step 1: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 2: Fix any breakage**

The handler signature change in `registerAllHandlers` (now accepts optional `deliveryQueue`) and the orchestrator constructor change (now accepts optional `extraToolCtx`) should be backward-compatible since the new params are optional. But verify no tests break.

**Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve test breakage from WhatsApp wiring"
```
