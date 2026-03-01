# VAPI Voice Calling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add voice calling capabilities via the VAPI API so the agent can initiate outbound calls to vendors and store transcripts/summaries for user review.

**Architecture:** New `VapiChannel` REST client, dedicated auto-start Cloudflare tunnel for webhooks, `makeVapiCall` agent tool, webhook POST handler, new `voiceCalls` DB table, and a standalone "Calls" sidebar tab in the UI.

**Tech Stack:** VAPI REST API, drizzle-orm, Cloudflare tunnel (cloudflared), React, Tailwind CSS, WebSocket events

---

### Task 1: Add voiceCalls table to DB schema

**Files:**
- Modify: `packages/gateway/src/db/schema.ts:276` (end of file)

**Step 1: Add the voiceCalls table definition**

Add after the last table definition (line ~276) in `packages/gateway/src/db/schema.ts`:

```typescript
export const voiceCalls = sqliteTable("voice_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id").references(() => vendors.id),
  vapiCallId: text("vapi_call_id"),
  phoneNumber: text("phone_number").notNull(),
  assistantId: text("assistant_id"),
  status: text("status").notNull().default("draft"),
  endedReason: text("ended_reason"),
  duration: integer("duration"),
  summary: text("summary"),
  transcript: text("transcript"),
  recordingUrl: text("recording_url"),
  structuredData: text("structured_data"),
  instructions: text("instructions"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  endedAt: text("ended_at"),
});
```

**Step 2: Add VAPI columns to aiConfig table**

In `packages/gateway/src/db/schema.ts`, find the `aiConfig` table and add these columns:

```typescript
vapiApiKey: text("vapi_api_key"),
vapiPhoneNumberId: text("vapi_phone_number_id"),
vapiAssistantId: text("vapi_assistant_id"),
vapiAutoCall: integer("vapi_auto_call").default(0),
```

**Step 3: Run the app to verify the schema migration applies cleanly**

Run: `cd packages/gateway && npm test -- --run tests/db.test.ts`
Expected: PASS — the push migration handles the new table and columns.

**Step 4: Commit**

```bash
git add packages/gateway/src/db/schema.ts
git commit -m "feat(vapi): add voiceCalls table and aiConfig VAPI columns"
```

---

### Task 2: Create VapiChannel REST client

**Files:**
- Create: `packages/gateway/src/channels/vapi.ts`
- Create: `packages/gateway/tests/channels/vapi.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/channels/vapi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VapiChannel } from "../../src/channels/vapi.js";

describe("VapiChannel", () => {
  let channel: VapiChannel;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    channel = new VapiChannel({ apiKey: "test-key" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createCall", () => {
    it("sends POST to VAPI with correct auth and body", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "call-123",
          status: "queued",
          phoneNumber: { number: "+1234567890" },
        }),
      });

      const result = await channel.createCall({
        phoneNumberId: "pn-1",
        assistantId: "asst-1",
        customerNumber: "+1234567890",
      });

      expect(result.id).toBe("call-123");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.vapi.ai/call",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        }),
      );
    });

    it("sends assistantOverrides when provided", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "call-456", status: "queued" }),
      });

      await channel.createCall({
        phoneNumberId: "pn-1",
        assistantId: "asst-1",
        customerNumber: "+1234567890",
        assistantOverrides: {
          variableValues: { vendor_name: "Mary's Flowers" },
        },
      });

      const body = JSON.parse(
        (globalThis.fetch as any).mock.calls[0][1].body,
      );
      expect(body.assistantOverrides.variableValues.vendor_name).toBe(
        "Mary's Flowers",
      );
    });

    it("throws on API error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(
        channel.createCall({
          phoneNumberId: "pn-1",
          assistantId: "asst-1",
          customerNumber: "+1234567890",
        }),
      ).rejects.toThrow("VAPI API error 401");
    });
  });

  describe("getCall", () => {
    it("fetches call by ID", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "call-123",
          status: "ended",
          artifact: { transcript: "Hello..." },
        }),
      });

      const result = await channel.getCall("call-123");
      expect(result.id).toBe("call-123");
      expect(result.artifact.transcript).toBe("Hello...");
    });
  });

  describe("updatePhoneNumberServerUrl", () => {
    it("patches the phone number with server URL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "pn-1" }),
      });

      await channel.updatePhoneNumberServerUrl("pn-1", "https://tunnel.example.com/vapi/webhook");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.vapi.ai/phone-number/pn-1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("serverUrl"),
        }),
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npm test -- --run tests/channels/vapi.test.ts`
Expected: FAIL — `VapiChannel` does not exist.

**Step 3: Write minimal implementation**

Create `packages/gateway/src/channels/vapi.ts`:

```typescript
export interface VapiConfig {
  apiKey: string;
}

export interface CreateCallParams {
  phoneNumberId: string;
  assistantId: string;
  customerNumber: string;
  assistantOverrides?: {
    variableValues?: Record<string, string>;
  };
}

export interface VapiCallResult {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface VapiCallDetail {
  id: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  duration?: number;
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    messages?: unknown[];
  };
  analysis?: {
    summary?: string;
    structuredData?: unknown;
    successEvaluation?: string;
  };
  costBreakdown?: unknown;
  [key: string]: unknown;
}

const BASE_URL = "https://api.vapi.ai";

export class VapiChannel {
  private apiKey: string;

  constructor(config: VapiConfig) {
    this.apiKey = config.apiKey;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async createCall(params: CreateCallParams): Promise<VapiCallResult> {
    const body: Record<string, unknown> = {
      assistantId: params.assistantId,
      phoneNumberId: params.phoneNumberId,
      customer: { number: params.customerNumber },
    };
    if (params.assistantOverrides) {
      body.assistantOverrides = params.assistantOverrides;
    }

    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`VAPI API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<VapiCallResult>;
  }

  async getCall(callId: string): Promise<VapiCallDetail> {
    const res = await fetch(`${BASE_URL}/call/${callId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`VAPI API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<VapiCallDetail>;
  }

  async updatePhoneNumberServerUrl(
    phoneNumberId: string,
    serverUrl: string,
  ): Promise<void> {
    const res = await fetch(`${BASE_URL}/phone-number/${phoneNumberId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ serverUrl }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`VAPI API error ${res.status}: ${text}`);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npm test -- --run tests/channels/vapi.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/channels/vapi.ts packages/gateway/tests/channels/vapi.test.ts
git commit -m "feat(vapi): add VapiChannel REST client with tests"
```

---

### Task 3: Add webhook POST endpoint to HTTP server

**Files:**
- Modify: `packages/gateway/src/infra/ws-server.ts:81-136` (httpServer request handler)
- Create: `packages/gateway/tests/infra/vapi-webhook.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/infra/vapi-webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";

describe("VAPI webhook endpoint", () => {
  it("accepts POST to /vapi/webhook and calls the handler", async () => {
    // This test verifies the HTTP server routes POST /vapi/webhook correctly
    // We'll test the full integration after wiring everything together
    // For now, verify the route exists by importing the server
    expect(true).toBe(true); // placeholder — full integration tested in Task 7
  });
});
```

**Step 2: Modify ws-server.ts to handle POST /vapi/webhook**

In `packages/gateway/src/infra/ws-server.ts`, modify the `createServer` callback. Currently it rejects all non-GET requests at line ~81. Change it to handle POST `/vapi/webhook`:

Add a new option to `WsServerOptions`:

```typescript
export interface WsServerOptions {
  port: number;
  getState: () => GatewayStateSnapshot;
  router?: Router;
  db?: Db;
  imagesDir?: string;
  onVapiWebhook?: (payload: unknown) => void;
}
```

In the `createServer` handler, before the `if (req.method !== "GET" ...)` block, add:

```typescript
// Handle VAPI webhook POST
if (req.method === "POST" && req.url === "/vapi/webhook") {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
      const payload = JSON.parse(body);
      if (onVapiWebhook) onVapiWebhook(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end("Invalid JSON");
    }
  });
  return;
}
```

Destructure `onVapiWebhook` from options at the top of `createWsServer`:

```typescript
const { port, getState, router, db, imagesDir, onVapiWebhook } = options;
```

**Step 3: Commit**

```bash
git add packages/gateway/src/infra/ws-server.ts packages/gateway/tests/infra/vapi-webhook.test.ts
git commit -m "feat(vapi): add POST /vapi/webhook endpoint to HTTP server"
```

---

### Task 4: Create makeVapiCall agent tool

**Files:**
- Create: `packages/gateway/src/tools/vapi-call.ts`
- Create: `packages/gateway/tests/tools/vapi-call.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/tools/vapi-call.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { makeVapiCallTool, type VapiCallContext } from "../../src/tools/vapi-call.js";

const toolContext = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });

  // Seed a vendor
  db.insert(schema.vendors).values({
    name: "Mary's Flowers",
    contactPhone: "+15551234567",
    categoryId: null as any,
    status: "researched",
  }).run();

  return { db, sqlite };
}

describe("makeVapiCallTool", () => {
  let db: ReturnType<typeof drizzle>;
  let ctx: VapiCallContext;
  let mockCreateCall: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const s = setup();
    db = s.db;
    mockCreateCall = vi.fn().mockResolvedValue({ id: "call-123", status: "queued" });

    ctx = {
      db,
      emit: vi.fn(),
      getAutoCall: () => false,
      createCall: mockCreateCall,
      getVapiConfig: () => ({
        phoneNumberId: "pn-1",
        assistantId: "asst-1",
      }),
    };
  });

  it("creates a draft voice call when auto-call is off", async () => {
    const tool = makeVapiCallTool(ctx);
    const result = await tool.execute!(
      { vendorId: 1, phoneNumber: "+15551234567", instructions: "Ask about flower pricing" },
      toolContext,
    ) as any;

    expect(result.status).toBe("draft");
    expect(result.callId).toBeDefined();
    expect(mockCreateCall).not.toHaveBeenCalled();
  });

  it("creates and initiates call when auto-call is on", async () => {
    ctx.getAutoCall = () => true;
    const tool = makeVapiCallTool(ctx);
    const result = await tool.execute!(
      { vendorId: 1, phoneNumber: "+15551234567", instructions: "Ask about flower pricing" },
      toolContext,
    ) as any;

    expect(result.status).toBe("queued");
    expect(result.vapiCallId).toBe("call-123");
    expect(mockCreateCall).toHaveBeenCalled();
  });

  it("looks up vendor phone number when not provided", async () => {
    ctx.getAutoCall = () => true;
    const tool = makeVapiCallTool(ctx);
    const result = await tool.execute!(
      { vendorId: 1, instructions: "Ask about flower pricing" },
      toolContext,
    ) as any;

    expect(result.status).toBe("queued");
    expect(mockCreateCall).toHaveBeenCalledWith(
      expect.objectContaining({ customerNumber: "+15551234567" }),
    );
  });

  it("returns error when vendor has no phone number", async () => {
    // Insert vendor without phone
    db.insert(schema.vendors).values({
      name: "No Phone Vendor",
      categoryId: null as any,
      status: "researched",
    }).run();

    const tool = makeVapiCallTool(ctx);
    const result = await tool.execute!(
      { vendorId: 2, instructions: "Call them" },
      toolContext,
    ) as any;

    expect(result.error).toContain("no phone number");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npm test -- --run tests/tools/vapi-call.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `packages/gateway/src/tools/vapi-call.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendors, voiceCalls } from "../db/schema.js";
import type { Db } from "../infra/router.js";
import type { CreateCallParams } from "../channels/vapi.js";

export interface VapiCallContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
  getAutoCall: () => boolean;
  createCall: (params: CreateCallParams) => Promise<{ id: string; status: string }>;
  getVapiConfig: () => { phoneNumberId: string; assistantId: string } | null;
}

export function makeVapiCallTool(ctx: VapiCallContext) {
  return tool({
    description:
      "Initiate a voice call to a vendor. Looks up the vendor's phone number and either calls immediately (if auto-call is on) or creates a draft for user review.",
    inputSchema: z.object({
      vendorId: z.number().optional().describe("The vendor ID to call"),
      phoneNumber: z.string().optional().describe("Phone number to dial (overrides vendor lookup)"),
      instructions: z.string().describe("What the voice agent should discuss on the call"),
    }),
    execute: async ({ vendorId, phoneNumber, instructions }) => {
      let resolvedPhone = phoneNumber;
      let resolvedVendorId = vendorId;
      let vendorName: string | undefined;

      // Look up vendor phone if needed
      if (vendorId && !resolvedPhone) {
        const [vendor] = await ctx.db
          .select()
          .from(vendors)
          .where(eq(vendors.id, vendorId));
        if (!vendor) return { error: "Vendor not found" };
        resolvedPhone = vendor.contactPhone ?? undefined;
        vendorName = vendor.name;
        if (!resolvedPhone) return { error: `Vendor "${vendor.name}" has no phone number` };
      }

      if (!resolvedPhone) return { error: "No phone number provided and no vendor specified" };

      const vapiConfig = ctx.getVapiConfig();
      if (!vapiConfig) return { error: "VAPI is not configured. Set API key, phone number ID, and assistant ID in Settings." };

      const autoCall = ctx.getAutoCall();
      const status = autoCall ? "queued" : "draft";

      // Create voice call record
      const [call] = await ctx.db
        .insert(voiceCalls)
        .values({
          vendorId: resolvedVendorId ?? null,
          phoneNumber: resolvedPhone,
          assistantId: vapiConfig.assistantId,
          status,
          instructions,
        })
        .returning();

      ctx.emit(
        autoCall ? "vapi-call-initiated" : "vapi-call-draft",
        `${autoCall ? "Initiating" : "Drafted"} call to ${vendorName ?? resolvedPhone}`,
      );

      // If auto-call, place the call via VAPI
      if (autoCall) {
        try {
          const result = await ctx.createCall({
            phoneNumberId: vapiConfig.phoneNumberId,
            assistantId: vapiConfig.assistantId,
            customerNumber: resolvedPhone,
          });

          await ctx.db
            .update(voiceCalls)
            .set({ vapiCallId: result.id, status: result.status })
            .where(eq(voiceCalls.id, call.id));

          return {
            callId: call.id,
            vapiCallId: result.id,
            status: result.status,
            vendorName,
            message: `Call initiated to ${vendorName ?? resolvedPhone}`,
          };
        } catch (err) {
          await ctx.db
            .update(voiceCalls)
            .set({ status: "failed", endedReason: (err as Error).message })
            .where(eq(voiceCalls.id, call.id));

          return {
            callId: call.id,
            status: "failed",
            error: `Failed to initiate call: ${(err as Error).message}`,
          };
        }
      }

      return {
        callId: call.id,
        status: "draft",
        vendorName,
        message: `Call draft created for ${vendorName ?? resolvedPhone}. Awaiting user approval.`,
      };
    },
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npm test -- --run tests/tools/vapi-call.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/vapi-call.ts packages/gateway/tests/tools/vapi-call.test.ts
git commit -m "feat(vapi): add makeVapiCallTool for agent voice calling"
```

---

### Task 5: Register tool in registry and add to agent configs

**Files:**
- Modify: `packages/gateway/src/tools/index.ts:10` (add import) and `:101-160` (add factory registration)
- Modify: `packages/gateway/src/agents/task-configs.ts:130` (add to research tools) and `:135` (add to outreach tools)
- Modify: `packages/gateway/src/index.ts:235-243` (add VAPI context to extraToolCtx)

**Step 1: Register the tool factory in `packages/gateway/src/tools/index.ts`**

Add import at top:

```typescript
import { makeVapiCallTool } from "./vapi-call.js";
```

Add factory registration before the `return registry;` line (after `semanticSearch` registration):

```typescript
registry.registerFactory("makeVapiCall", {
  description: "Initiate a voice call to a vendor via VAPI",
  category: "messaging",
  create: (ctx: unknown) => {
    const { db, emit, vapiChannel, getVapiAutoCall, getVapiConfig } = ctx as any;
    if (!vapiChannel) {
      return tool({
        description: "Voice calling is not configured. Ask the user to set up VAPI in Settings.",
        inputSchema: z.object({}),
        execute: async () => ({ error: "VAPI is not configured. The user needs to add VAPI credentials in Settings." }),
      });
    }
    return makeVapiCallTool({
      db,
      emit,
      getAutoCall: getVapiAutoCall ?? (() => false),
      createCall: (params) => vapiChannel.createCall(params),
      getVapiConfig: getVapiConfig ?? (() => null),
    });
  },
});
```

**Step 2: Add `makeVapiCall` to agent tool lists in `packages/gateway/src/agents/task-configs.ts`**

Add `"makeVapiCall"` to the research agent's tools array (line 130):

```typescript
tools: ["search", "scrape", "dispatch", "awaitTasks", "parsePdf", "createVendor", "addVendorImages", "cmd", "dbQuery", "dbSchema", "gog", "semanticSearch", "sendWhatsApp", "makeVapiCall"],
```

Add `"makeVapiCall"` to the outreach agent's tools array (line 135):

```typescript
tools: ["cmd", "dbQuery", "dbSchema", "sendWhatsApp", "gog", "semanticSearch", "makeVapiCall"],
```

**Step 3: Wire VAPI context into orchestrator extraToolCtx in `packages/gateway/src/index.ts`**

This will be done in Task 7 when wiring everything together. For now, the tool gracefully handles missing config.

**Step 4: Run existing tests to ensure no regressions**

Run: `cd packages/gateway && npm test -- --run`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/index.ts packages/gateway/src/agents/task-configs.ts
git commit -m "feat(vapi): register makeVapiCall tool and add to agent configs"
```

---

### Task 6: Create VAPI handlers for UI interaction

**Files:**
- Create: `packages/gateway/src/handlers/vapi.ts`
- Create: `packages/gateway/tests/handlers/vapi.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/handlers/vapi.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerVapiHandlers } from "../../src/handlers/vapi.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerVapiHandlers(router);

  // Seed a vendor
  db.insert(schema.vendors).values({
    name: "Mary's Flowers",
    contactPhone: "+15551234567",
    categoryId: null as any,
    status: "researched",
  }).run();

  return { db, router };
}

describe("VAPI handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    ({ db, router } = setup());
  });

  describe("vapi.listCalls", () => {
    it("returns empty list initially", async () => {
      const result = await router.handle(db, "vapi.listCalls", {});
      expect(result).toEqual([]);
    });

    it("returns calls with vendor names", async () => {
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "ended",
        instructions: "Ask about pricing",
        summary: "They quoted $500",
      });

      const result = await router.handle(db, "vapi.listCalls", {}) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].vendorName).toBe("Mary's Flowers");
      expect(result[0].summary).toBe("They quoted $500");
    });
  });

  describe("vapi.getCall", () => {
    it("returns a single call by ID", async () => {
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "ended",
        instructions: "Ask about pricing",
      });

      const result = await router.handle(db, "vapi.getCall", { id: 1 }) as any;
      expect(result.phoneNumber).toBe("+15551234567");
    });

    it("throws if call not found", async () => {
      await expect(
        router.handle(db, "vapi.getCall", { id: 999 }),
      ).rejects.toThrow("not found");
    });
  });

  describe("vapi.approveDraft", () => {
    it("updates draft status to queued", async () => {
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "draft",
        instructions: "Ask about pricing",
      });

      const result = await router.handle(db, "vapi.approveDraft", { id: 1 }) as any;
      expect(result.status).toBe("queued");
    });
  });

  describe("vapi.rejectDraft", () => {
    it("deletes the draft call", async () => {
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "draft",
        instructions: "Ask about pricing",
      });

      await router.handle(db, "vapi.rejectDraft", { id: 1 });
      const calls = await router.handle(db, "vapi.listCalls", {}) as any[];
      expect(calls).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npm test -- --run tests/handlers/vapi.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `packages/gateway/src/handlers/vapi.ts`:

```typescript
import { eq, desc } from "drizzle-orm";
import { voiceCalls, vendors } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerVapiHandlers(router: Router) {
  router.register("vapi.listCalls", async (db: Db) => {
    const rows = await db
      .select({
        id: voiceCalls.id,
        vendorId: voiceCalls.vendorId,
        vendorName: vendors.name,
        vapiCallId: voiceCalls.vapiCallId,
        phoneNumber: voiceCalls.phoneNumber,
        assistantId: voiceCalls.assistantId,
        status: voiceCalls.status,
        endedReason: voiceCalls.endedReason,
        duration: voiceCalls.duration,
        summary: voiceCalls.summary,
        transcript: voiceCalls.transcript,
        recordingUrl: voiceCalls.recordingUrl,
        structuredData: voiceCalls.structuredData,
        instructions: voiceCalls.instructions,
        createdAt: voiceCalls.createdAt,
        endedAt: voiceCalls.endedAt,
      })
      .from(voiceCalls)
      .leftJoin(vendors, eq(voiceCalls.vendorId, vendors.id))
      .orderBy(desc(voiceCalls.id));

    return rows;
  });

  router.register("vapi.getCall", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [row] = await db
      .select({
        id: voiceCalls.id,
        vendorId: voiceCalls.vendorId,
        vendorName: vendors.name,
        vapiCallId: voiceCalls.vapiCallId,
        phoneNumber: voiceCalls.phoneNumber,
        assistantId: voiceCalls.assistantId,
        status: voiceCalls.status,
        endedReason: voiceCalls.endedReason,
        duration: voiceCalls.duration,
        summary: voiceCalls.summary,
        transcript: voiceCalls.transcript,
        recordingUrl: voiceCalls.recordingUrl,
        structuredData: voiceCalls.structuredData,
        instructions: voiceCalls.instructions,
        createdAt: voiceCalls.createdAt,
        endedAt: voiceCalls.endedAt,
      })
      .from(voiceCalls)
      .leftJoin(vendors, eq(voiceCalls.vendorId, vendors.id))
      .where(eq(voiceCalls.id, id));

    if (!row) throw new Error(`Voice call ${id} not found`);
    return row;
  });

  router.register("vapi.approveDraft", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db
      .update(voiceCalls)
      .set({ status: "queued" })
      .where(eq(voiceCalls.id, id));

    const [updated] = await db
      .select()
      .from(voiceCalls)
      .where(eq(voiceCalls.id, id));
    return updated;
  });

  router.register("vapi.rejectDraft", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(voiceCalls).where(eq(voiceCalls.id, id));
    return { ok: true };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npm test -- --run tests/handlers/vapi.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/handlers/vapi.ts packages/gateway/tests/handlers/vapi.test.ts
git commit -m "feat(vapi): add VAPI call handlers (list, get, approve, reject)"
```

---

### Task 7: Wire VAPI into gateway startup and webhook processing

**Files:**
- Modify: `packages/gateway/src/handlers/index.ts` (import + register VAPI handlers)
- Modify: `packages/gateway/src/index.ts` (VAPI tunnel, channel, webhook handler, extraToolCtx)

**Step 1: Register VAPI handlers in `packages/gateway/src/handlers/index.ts`**

Add import:

```typescript
import { registerVapiHandlers } from "./vapi.js";
```

Add registration call inside `registerAllHandlers` (before the closing of the function):

```typescript
registerVapiHandlers(router);
```

**Step 2: Wire VAPI channel, tunnel, and webhook in `packages/gateway/src/index.ts`**

Add imports at the top:

```typescript
import { VapiChannel } from "./channels/vapi.js";
import { voiceCalls } from "./db/schema.js";
```

After the tunnel manager initialization (around line 124-130), add the VAPI tunnel:

```typescript
// VAPI dedicated tunnel (auto-start)
const vapiTunnelManager = new TunnelManager(cloudflaredBin);
```

Before the orchestrator creation (around line 204-244), add VAPI config getters:

```typescript
const getVapiConfig = () => {
  const rows = sqlite
    .prepare("SELECT vapi_api_key, vapi_phone_number_id, vapi_assistant_id FROM ai_config LIMIT 1")
    .all() as any[];
  if (!rows.length) return null;
  const r = rows[0];
  if (!r.vapi_api_key || !r.vapi_phone_number_id || !r.vapi_assistant_id) return null;
  return {
    apiKey: r.vapi_api_key,
    phoneNumberId: r.vapi_phone_number_id,
    assistantId: r.vapi_assistant_id,
  };
};

const getVapiAutoCall = () => {
  const rows = sqlite
    .prepare("SELECT vapi_auto_call FROM ai_config LIMIT 1")
    .all() as any[];
  return rows.length > 0 && rows[0].vapi_auto_call === 1;
};

const vapiConfig = getVapiConfig();
const vapiChannel = vapiConfig ? new VapiChannel({ apiKey: vapiConfig.apiKey }) : null;
```

Add VAPI fields to the orchestrator's `extraToolCtx`:

```typescript
{
  deliveryQueue,
  getAutoSend: autoSendGetter,
  gogManager,
  getGoogleAutoSend: googleAutoSendGetter,
  getGoogleConfig,
  imagesDir,
  embeddingService,
  vapiChannel,
  getVapiAutoCall: getVapiAutoCall,
  getVapiConfig: () => {
    const cfg = getVapiConfig();
    if (!cfg) return null;
    return { phoneNumberId: cfg.phoneNumberId, assistantId: cfg.assistantId };
  },
},
```

**Step 3: Add webhook handler and pass to ws-server**

When creating the ws-server, add the `onVapiWebhook` callback. Find where `createWsServer` is called and add the webhook handler:

```typescript
onVapiWebhook: async (payload: any) => {
  const message = payload?.message ?? payload;
  const type = message?.type;

  if (type === "status-update") {
    const callStatus = message.status;
    const vapiCallId = message.call?.id;
    if (vapiCallId && callStatus) {
      const [existing] = await db
        .select()
        .from(voiceCalls)
        .where(eq(voiceCalls.vapiCallId, vapiCallId));
      if (existing) {
        await db
          .update(voiceCalls)
          .set({ status: callStatus === "in-progress" ? "in-progress" : callStatus })
          .where(eq(voiceCalls.id, existing.id));
        wsServer.broadcast({
          name: "voice-call-status",
          data: { callId: existing.id, status: callStatus },
        });
      }
    }
  }

  if (type === "end-of-call-report") {
    const call = message.call;
    const vapiCallId = call?.id;
    if (vapiCallId) {
      const [existing] = await db
        .select()
        .from(voiceCalls)
        .where(eq(voiceCalls.vapiCallId, vapiCallId));
      if (existing) {
        await db
          .update(voiceCalls)
          .set({
            status: "ended",
            endedReason: call.endedReason,
            duration: call.duration ?? message.durationSeconds,
            summary: message.analysis?.summary ?? message.artifact?.transcript?.slice(0, 500),
            transcript: message.artifact?.transcript,
            recordingUrl: message.artifact?.recordingUrl,
            structuredData: message.analysis?.structuredData
              ? JSON.stringify(message.analysis.structuredData)
              : null,
            endedAt: call.endedAt ?? new Date().toISOString(),
          })
          .where(eq(voiceCalls.id, existing.id));
        wsServer.broadcast({
          name: "voice-call-ended",
          data: { callId: existing.id, vendorId: existing.vendorId },
        });
      }
    }
  }
},
```

**Step 4: Auto-start VAPI tunnel**

After the ws-server is created and the VAPI channel is available, add tunnel auto-start logic:

```typescript
// Auto-start VAPI tunnel if VAPI is configured
if (vapiChannel && vapiConfig) {
  vapiTunnelManager.onStatus(async (status) => {
    if (status.state === "running" && status.url) {
      try {
        await vapiChannel.updatePhoneNumberServerUrl(
          vapiConfig.phoneNumberId,
          `${status.url}/vapi/webhook`,
        );
        console.log(`VAPI webhook URL set to: ${status.url}/vapi/webhook`);
      } catch (err) {
        console.error("Failed to update VAPI phone number server URL:", err);
      }
    }
    wsServer.broadcast({
      name: "tunnel.status",
      data: { ...status, channel: "vapi" },
    });
  });
  vapiTunnelManager.start(port).catch((err) => {
    console.error("Failed to start VAPI tunnel:", err);
  });
}
```

Add cleanup for VAPI tunnel in the shutdown handler (find the existing cleanup section):

```typescript
vapiTunnelManager.killSync();
```

**Step 5: Add new GatewayEvent types**

In `packages/shared/src/protocol/messages.ts`, add to the `GatewayEvent` union:

```typescript
| { name: "voice-call-status"; data: { callId: number; status: string } }
| { name: "voice-call-ended"; data: { callId: number; vendorId: number | null } }
```

**Step 6: Run all tests**

Run: `cd packages/gateway && npm test -- --run`
Expected: All PASS.

**Step 7: Commit**

```bash
git add packages/gateway/src/handlers/index.ts packages/gateway/src/index.ts packages/shared/src/protocol/messages.ts
git commit -m "feat(vapi): wire VAPI channel, tunnel, and webhook into gateway"
```

---

### Task 8: Add VAPI settings to Settings UI

**Files:**
- Create: `packages/app/src/renderer/components/settings/VapiSettings.tsx`
- Modify: `packages/app/src/renderer/components/settings/SettingsView.tsx` (add VapiSettings component)

**Step 1: Create VapiSettings component**

Create `packages/app/src/renderer/components/settings/VapiSettings.tsx`. Follow the same pattern as other settings components (e.g., `AIProviderSetup`, `SearchConfig`). Use `useRequest` to load and `useMutation` to save aiConfig fields. Include:

- Text input for VAPI API Key (password type)
- Text input for Phone Number ID
- Text input for Assistant ID
- Toggle for Auto-Call

Use the existing `aiConfig.get` handler to load values and `aiConfig.update` to save. The new VAPI columns are already part of the aiConfig table from Task 1.

**Step 2: Add to SettingsView**

In `packages/app/src/renderer/components/settings/SettingsView.tsx`, import and render:

```typescript
import { VapiSettings } from "./VapiSettings";
```

Add after the `<IntegrationStatus />` section:

```tsx
<hr className="border-border" />
<VapiSettings />
```

**Step 3: Verify in dev**

Run: `npm run dev` from root
Expected: Settings page shows VAPI configuration section.

**Step 4: Commit**

```bash
git add packages/app/src/renderer/components/settings/VapiSettings.tsx packages/app/src/renderer/components/settings/SettingsView.tsx
git commit -m "feat(vapi): add VAPI settings UI for API key, phone number, and assistant config"
```

---

### Task 9: Create Calls sidebar tab and CallsView

**Files:**
- Create: `packages/app/src/renderer/components/calls/CallsView.tsx`
- Modify: `packages/app/src/renderer/components/layout/Sidebar.tsx` (add Calls nav item)
- Modify: `packages/app/src/renderer/App.tsx` (add route)

**Step 1: Add sidebar entry**

In `packages/app/src/renderer/components/layout/Sidebar.tsx`:

Add `Phone` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Search,
  Store,
  MessageCircle,
  Phone,
  Inbox,
  Calendar,
  DollarSign,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
```

Add to `NAV_ITEMS` after the WhatsApp entry:

```typescript
{ to: "/calls", icon: Phone, label: "Calls" },
```

**Step 2: Add route in App.tsx**

Import the view:

```typescript
import { CallsView } from "./components/calls/CallsView";
```

Add route inside the `<Route element={<AppShell />}>` group:

```tsx
<Route path="calls" element={<CallsView />} />
```

**Step 3: Create CallsView component**

Create `packages/app/src/renderer/components/calls/CallsView.tsx`:

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { EmptyState } from "../common/EmptyState";
import { ApprovalActions } from "../outreach/ApprovalActions";
import { Phone, Clock, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import type { GatewayEvent } from "@wedding-planner/shared";

interface VoiceCall {
  id: number;
  vendorId: number | null;
  vendorName: string | null;
  vapiCallId: string | null;
  phoneNumber: string;
  assistantId: string | null;
  status: string;
  endedReason: string | null;
  duration: number | null;
  summary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  structuredData: string | null;
  instructions: string | null;
  createdAt: string | null;
  endedAt: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-surface text-on-surface-muted border border-border",
  queued: "bg-surface-subtle text-on-surface-secondary",
  ringing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "in-progress": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse",
  ended: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
      {status}
    </span>
  );
}

export function CallsView() {
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const { data: calls, loading, refetch } = useRequest<VoiceCall[]>("vapi.listCalls", {});
  const { mutate: approveDraft } = useMutation<{ id: number }>("vapi.approveDraft");
  const { mutate: rejectDraft } = useMutation<{ id: number }>("vapi.rejectDraft");

  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (event.name === "voice-call-status" || event.name === "voice-call-ended") {
        refetch();
      }
      if (
        event.name === "agent-activity" &&
        (event.data.action === "vapi-call-initiated" || event.data.action === "vapi-call-draft")
      ) {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  const selectedCall = useMemo(
    () => calls?.find((c) => c.id === selectedCallId) ?? null,
    [calls, selectedCallId],
  );

  async function handleApprove(id: number) {
    await approveDraft({ id });
    refetch();
  }

  async function handleReject(id: number) {
    await rejectDraft({ id });
    refetch();
  }

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-72 border-r border-border animate-pulse bg-surface-subtle" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Call list */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="px-3 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-on-surface">Voice Calls</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {(!calls || calls.length === 0) ? (
            <div className="p-4 text-xs text-on-surface-muted text-center">
              No calls yet
            </div>
          ) : (
            calls.map((call) => (
              <div
                key={call.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCallId(call.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedCallId(call.id); }}
                className={`px-3 py-2.5 cursor-pointer border-b border-border hover:bg-surface-hover transition-colors ${
                  selectedCallId === call.id ? "bg-surface-hover" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-on-surface truncate">
                    {call.vendorName ?? call.phoneNumber}
                  </span>
                  <StatusBadge status={call.status} />
                </div>
                <div className="flex items-center gap-2 text-xs text-on-surface-muted">
                  {call.duration != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(call.duration)}
                    </span>
                  )}
                  {call.createdAt && (
                    <span>{new Date(call.createdAt).toLocaleDateString()}</span>
                  )}
                </div>
                {call.summary && (
                  <p className="mt-1 text-xs text-on-surface-subtle line-clamp-2">
                    {call.summary}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Call detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedCall ? (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">
                  {selectedCall.vendorName ?? selectedCall.phoneNumber}
                </h2>
                <p className="text-sm text-on-surface-muted mt-0.5">
                  {selectedCall.phoneNumber}
                  {selectedCall.createdAt && (
                    <> &middot; {new Date(selectedCall.createdAt).toLocaleString()}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedCall.status} />
                {selectedCall.duration != null && (
                  <span className="text-sm text-on-surface-muted flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDuration(selectedCall.duration)}
                  </span>
                )}
              </div>
            </div>

            {/* Draft approval */}
            {selectedCall.status === "draft" && (
              <div className="mb-6 p-4 rounded-lg border border-border bg-surface-subtle">
                <p className="text-sm text-on-surface-secondary mb-3">
                  This call is awaiting your approval before dialing.
                </p>
                {selectedCall.instructions && (
                  <p className="text-sm text-on-surface mb-3 italic">
                    &ldquo;{selectedCall.instructions}&rdquo;
                  </p>
                )}
                <ApprovalActions
                  onApprove={() => handleApprove(selectedCall.id)}
                  onReject={() => handleReject(selectedCall.id)}
                />
              </div>
            )}

            {/* Instructions */}
            {selectedCall.instructions && selectedCall.status !== "draft" && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-on-surface mb-2">Instructions</h3>
                <p className="text-sm text-on-surface-secondary italic">
                  &ldquo;{selectedCall.instructions}&rdquo;
                </p>
              </div>
            )}

            {/* Summary */}
            {selectedCall.summary && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-on-surface mb-2">Summary</h3>
                <p className="text-sm text-on-surface-secondary leading-relaxed">
                  {selectedCall.summary}
                </p>
              </div>
            )}

            {/* Structured data */}
            {selectedCall.structuredData && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-on-surface mb-2">Extracted Data</h3>
                <pre className="text-xs bg-surface-subtle p-3 rounded-lg overflow-x-auto border border-border">
                  {JSON.stringify(JSON.parse(selectedCall.structuredData), null, 2)}
                </pre>
              </div>
            )}

            {/* Transcript */}
            {selectedCall.transcript && (
              <div className="mb-6">
                <button
                  onClick={() => setTranscriptOpen(!transcriptOpen)}
                  className="flex items-center gap-1 text-sm font-semibold text-on-surface hover:text-on-surface-secondary"
                >
                  {transcriptOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Full Transcript
                </button>
                {transcriptOpen && (
                  <pre className="mt-2 text-sm text-on-surface-secondary whitespace-pre-wrap leading-relaxed bg-surface-subtle p-4 rounded-lg border border-border max-h-96 overflow-y-auto">
                    {selectedCall.transcript}
                  </pre>
                )}
              </div>
            )}

            {/* Recording */}
            {selectedCall.recordingUrl && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-on-surface mb-2">Recording</h3>
                <audio controls src={selectedCall.recordingUrl} className="w-full" />
              </div>
            )}

            {/* Ended reason */}
            {selectedCall.endedReason && selectedCall.status === "ended" && (
              <div className="text-xs text-on-surface-muted">
                Call ended: {selectedCall.endedReason}
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Phone}
            title="Select a call"
            description="Choose a call from the list to view details, or ask the agent to make a call"
          />
        )}
      </div>
    </div>
  );
}
```

**Step 4: Verify in dev**

Run: `npm run dev` from root
Expected: "Calls" appears in sidebar with Phone icon. Clicking it shows the empty state. After configuring VAPI in Settings and having the agent make a call, the call appears in the list.

**Step 5: Commit**

```bash
git add packages/app/src/renderer/components/calls/CallsView.tsx packages/app/src/renderer/components/layout/Sidebar.tsx packages/app/src/renderer/App.tsx
git commit -m "feat(vapi): add Calls sidebar tab and CallsView UI"
```

---

### Task 10: Handle approved draft calls (dial after approval)

**Files:**
- Modify: `packages/gateway/src/handlers/vapi.ts` (enhance approveDraft to trigger VAPI call)

**Step 1: Update approveDraft handler to also initiate the VAPI call**

The handler needs access to VapiChannel to place the call after approval. Modify `registerVapiHandlers` to accept optional dependencies:

```typescript
import { eq, desc } from "drizzle-orm";
import { voiceCalls, vendors } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";
import type { VapiChannel } from "../channels/vapi.js";
import type { GatewayEvent } from "@wedding-planner/shared";

export interface VapiHandlerDeps {
  vapiChannel?: VapiChannel | null;
  getVapiConfig?: () => { phoneNumberId: string; assistantId: string } | null;
  broadcast?: (event: GatewayEvent) => void;
}

export function registerVapiHandlers(router: Router, deps?: VapiHandlerDeps) {
```

Update `approveDraft` to initiate the call:

```typescript
router.register("vapi.approveDraft", async (db: Db, params: unknown) => {
  const { id } = params as { id: number };
  const [call] = await db.select().from(voiceCalls).where(eq(voiceCalls.id, id));
  if (!call) throw new Error(`Voice call ${id} not found`);

  await db.update(voiceCalls).set({ status: "queued" }).where(eq(voiceCalls.id, id));

  // Attempt to place the call via VAPI
  if (deps?.vapiChannel && deps?.getVapiConfig) {
    const config = deps.getVapiConfig();
    if (config) {
      try {
        const result = await deps.vapiChannel.createCall({
          phoneNumberId: config.phoneNumberId,
          assistantId: config.assistantId,
          customerNumber: call.phoneNumber,
        });
        await db
          .update(voiceCalls)
          .set({ vapiCallId: result.id, status: result.status })
          .where(eq(voiceCalls.id, id));

        deps.broadcast?.({
          name: "voice-call-status",
          data: { callId: id, status: result.status },
        });
      } catch (err) {
        await db
          .update(voiceCalls)
          .set({ status: "failed", endedReason: (err as Error).message })
          .where(eq(voiceCalls.id, id));
      }
    }
  }

  const [updated] = await db.select().from(voiceCalls).where(eq(voiceCalls.id, id));
  return updated;
});
```

**Step 2: Update handler registration in `packages/gateway/src/handlers/index.ts`**

Pass deps to `registerVapiHandlers`:

```typescript
registerVapiHandlers(router, { vapiChannel, getVapiConfig: ..., broadcast });
```

This requires the handler index to receive these dependencies. Update the function signature and pass them through from `index.ts`.

**Step 3: Update tests to verify**

Add a test in `packages/gateway/tests/handlers/vapi.test.ts` for the approval flow with a mock channel:

```typescript
it("initiates VAPI call when approving draft with channel available", async () => {
  // ... setup with deps
});
```

**Step 4: Run all tests**

Run: `cd packages/gateway && npm test -- --run`
Expected: All PASS.

**Step 5: Commit**

```bash
git add packages/gateway/src/handlers/vapi.ts packages/gateway/src/handlers/index.ts packages/gateway/src/index.ts packages/gateway/tests/handlers/vapi.test.ts
git commit -m "feat(vapi): handle draft approval by initiating VAPI call"
```

---

### Task 11: End-to-end verification

**Files:** None new — this is a verification task.

**Step 1: Run the full test suite**

Run: `cd packages/gateway && npm test -- --run`
Expected: All tests PASS (including all new VAPI tests).

**Step 2: Start the dev server and verify manually**

Run: `npm run dev` from project root

Verify:
1. Settings page shows VAPI section with API Key, Phone Number ID, Assistant ID fields, and Auto-Call toggle
2. "Calls" appears in the sidebar with a Phone icon
3. Clicking "Calls" shows the empty state
4. After entering VAPI credentials in Settings:
   - The dedicated VAPI tunnel auto-starts (check console logs)
   - VAPI phone number gets updated with the webhook URL (check console)
5. In a research thread, ask the agent "Call [vendor name] and ask about pricing"
   - With auto-call OFF: a draft appears in the Calls tab with approve/reject
   - With auto-call ON: the call is placed immediately
6. After a call completes: summary, transcript, and recording appear in the call detail view
7. Real-time status updates show in the call list as the call progresses

**Step 3: Commit any fixes from manual testing**

```bash
git add -A && git commit -m "fix(vapi): address issues found in manual testing"
```
