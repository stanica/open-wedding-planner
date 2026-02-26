# Research Chat & Tool Permissions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the research tab from a one-shot search into a persistent threaded chat with inline tool cards, vendor result cards, and a runtime tool permission system.

**Architecture:** New DB tables for threads, messages, and tool permissions. A central tool registry wraps tools with permission checks and serves curated sets to agents. The research agent gains conversation context and cross-tab tools. The frontend replaces the current ResearchView with a chat UI: thread list sidebar, message thread, inline tool/vendor/permission cards, and compose box.

**Tech Stack:** drizzle-orm (SQLite schema), Vercel AI SDK (`generateText`, `tool`), React 19, zustand (if needed), framer-motion, tailwindcss v4, WebSocket events, vitest

---

### Task 1: Add DB Schema — Research Threads, Messages, Tool Permissions

**Files:**
- Modify: `packages/gateway/src/db/schema.ts:179` (append new tables after `aiConfig`)

**Step 1: Add the three new tables to the schema**

Append after the `aiConfig` table (line 184):

```typescript
export const researchThreads = sqliteTable("research_threads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  categoryTags: text("category_tags"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const researchMessages = sqliteTable("research_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: integer("thread_id")
    .notNull()
    .references(() => researchThreads.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  vendorIds: text("vendor_ids"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const toolPermissions = sqliteTable("tool_permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolName: text("tool_name").notNull().unique(),
  decision: text("decision").notNull().default("prompt"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

**Step 2: Add `threadId` column to vendors table**

In the `vendors` table definition (around line 27-48), add after `sourceUrl`:

```typescript
  threadId: integer("thread_id").references(() => researchThreads.id),
```

**Step 3: Run tests to verify schema still loads**

Run: `cd packages/gateway && npx vitest run tests/db.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/gateway/src/db/schema.ts
git commit -m "feat: add research threads, messages, and tool permissions tables"
```

---

### Task 2: Tool Registry

**Files:**
- Create: `packages/gateway/src/tools/registry.ts`
- Test: `packages/gateway/tests/tools/registry.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";

const fakeTool = tool({
  description: "A test tool",
  inputSchema: z.object({ input: z.string() }),
  execute: async ({ input }) => ({ result: input }),
});

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers and retrieves a tool", () => {
    registry.register({
      name: "test",
      description: "A test tool",
      category: "utility",
      tool: fakeTool,
    });
    const reg = registry.get("test");
    expect(reg).toBeDefined();
    expect(reg!.name).toBe("test");
    expect(reg!.category).toBe("utility");
  });

  it("returns undefined for unknown tool", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("lists all registered tools", () => {
    registry.register({ name: "a", description: "A", category: "web", tool: fakeTool });
    registry.register({ name: "b", description: "B", category: "database", tool: fakeTool });
    expect(registry.listAll()).toHaveLength(2);
  });

  it("gets tools by category", () => {
    registry.register({ name: "a", description: "A", category: "web", tool: fakeTool });
    registry.register({ name: "b", description: "B", category: "web", tool: fakeTool });
    registry.register({ name: "c", description: "C", category: "database", tool: fakeTool });
    expect(registry.getByCategory("web")).toHaveLength(2);
    expect(registry.getByCategory("database")).toHaveLength(1);
  });

  it("returns a tool set by names", () => {
    registry.register({ name: "a", description: "A", category: "web", tool: fakeTool });
    registry.register({ name: "b", description: "B", category: "web", tool: fakeTool });
    registry.register({ name: "c", description: "C", category: "database", tool: fakeTool });
    const set = registry.getToolSet(["a", "c"]);
    expect(Object.keys(set)).toEqual(["a", "c"]);
  });

  it("throws when requesting unknown tool in set", () => {
    expect(() => registry.getToolSet(["unknown"])).toThrow("Unknown tool: unknown");
  });

  it("supports factory tools with context", () => {
    registry.registerFactory("dynamic", {
      description: "Dynamic tool",
      category: "database",
      create: (ctx: unknown) =>
        tool({
          description: "Dynamic",
          inputSchema: z.object({}),
          execute: async () => ctx,
        }),
    });
    const factories = registry.listAll();
    expect(factories).toHaveLength(1);
    expect(factories[0].name).toBe("dynamic");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/registry.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// packages/gateway/src/tools/registry.ts
import type { Tool } from "ai";

export interface ToolRegistration {
  name: string;
  description: string;
  category: string;
  tool: Tool;
}

export interface ToolFactoryRegistration {
  description: string;
  category: string;
  create: (ctx: unknown) => Tool;
}

interface RegistryEntry {
  name: string;
  description: string;
  category: string;
  tool?: Tool;
  factory?: (ctx: unknown) => Tool;
}

export class ToolRegistry {
  private entries = new Map<string, RegistryEntry>();

  register(reg: ToolRegistration): void {
    this.entries.set(reg.name, {
      name: reg.name,
      description: reg.description,
      category: reg.category,
      tool: reg.tool,
    });
  }

  registerFactory(name: string, reg: ToolFactoryRegistration): void {
    this.entries.set(name, {
      name,
      description: reg.description,
      category: reg.category,
      factory: reg.create,
    });
  }

  get(name: string): RegistryEntry | undefined {
    return this.entries.get(name);
  }

  getByCategory(category: string): RegistryEntry[] {
    return [...this.entries.values()].filter((e) => e.category === category);
  }

  getToolSet(names: string[]): Record<string, Tool> {
    const set: Record<string, Tool> = {};
    for (const name of names) {
      const entry = this.entries.get(name);
      if (!entry) throw new Error(`Unknown tool: ${name}`);
      if (!entry.tool) throw new Error(`Tool ${name} is a factory — use getToolSetWithContext`);
      set[name] = entry.tool;
    }
    return set;
  }

  getToolSetWithContext(names: string[], ctx: unknown): Record<string, Tool> {
    const set: Record<string, Tool> = {};
    for (const name of names) {
      const entry = this.entries.get(name);
      if (!entry) throw new Error(`Unknown tool: ${name}`);
      if (entry.factory) {
        set[name] = entry.factory(ctx);
      } else if (entry.tool) {
        set[name] = entry.tool;
      }
    }
    return set;
  }

  listAll(): Array<{ name: string; description: string; category: string }> {
    return [...this.entries.values()].map(({ name, description, category }) => ({
      name,
      description,
      category,
    }));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/tools/registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/registry.ts packages/gateway/tests/tools/registry.test.ts
git commit -m "feat: add tool registry with static and factory tool support"
```

---

### Task 3: Register Existing Tools in the Registry

**Files:**
- Create: `packages/gateway/src/tools/index.ts`
- Modify: `packages/gateway/src/agents/research.ts` (use registry instead of direct imports)

**Step 1: Create the tools index that builds a populated registry**

```typescript
// packages/gateway/src/tools/index.ts
import { ToolRegistry } from "./registry.js";
import { searchTool } from "./search.js";
import { scraperTool } from "./scraper.js";
import { browserTool } from "./browser.js";
import { pdfTool } from "./pdf.js";

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "search",
    description: "Search the web for wedding venues and vendor information",
    category: "web",
    tool: searchTool,
  });

  registry.register({
    name: "scrape",
    description: "Extract text and contact info from a web page",
    category: "web",
    tool: scraperTool,
  });

  registry.register({
    name: "browse",
    description: "Load a JavaScript-heavy web page using a headless browser",
    category: "web",
    tool: browserTool,
  });

  registry.register({
    name: "parsePdf",
    description: "Download and extract text from a PDF document",
    category: "web",
    tool: pdfTool,
  });

  return registry;
}

export { ToolRegistry } from "./registry.js";
```

Note: `createVendor` is a factory tool registered by the research agent at runtime (Task 5). Cross-tab tools (`draftOutreach`, `updateVendorStatus`, `addBudgetEntry`) are added in Task 6.

**Step 2: Run existing tests to verify nothing breaks**

Run: `cd packages/gateway && npx vitest run`
Expected: All 75 tests PASS

**Step 3: Commit**

```bash
git add packages/gateway/src/tools/index.ts
git commit -m "feat: create tool registry index with existing tools registered"
```

---

### Task 4: Tool Permission Handlers

**Files:**
- Create: `packages/gateway/src/handlers/tool-permissions.ts`
- Modify: `packages/gateway/src/handlers/index.ts` (register new handlers)
- Test: `packages/gateway/tests/handlers/tool-permissions.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerToolPermissionHandlers } from "../../src/handlers/tool-permissions.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerToolPermissionHandlers(router);
  return { db, router };
}

describe("tool permission handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    ({ db, router } = setup());
  });

  it("lists permissions (empty initially)", async () => {
    const result = await router.handle(db, "tools.permissions.list", {});
    expect(result).toEqual([]);
  });

  it("updates a permission to allow", async () => {
    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "allow",
    });
    const list = (await router.handle(db, "tools.permissions.list", {})) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0].toolName).toBe("search");
    expect(list[0].decision).toBe("allow");
  });

  it("upserts on repeated updates", async () => {
    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "allow",
    });
    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "deny",
    });
    const list = (await router.handle(db, "tools.permissions.list", {})) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0].decision).toBe("deny");
  });

  it("gets a single permission", async () => {
    await router.handle(db, "tools.permissions.update", {
      toolName: "scrape",
      decision: "allow",
    });
    const result = await router.handle(db, "tools.permissions.get", { toolName: "scrape" });
    expect(result).toMatchObject({ toolName: "scrape", decision: "allow" });
  });

  it("returns null for unknown tool permission", async () => {
    const result = await router.handle(db, "tools.permissions.get", { toolName: "unknown" });
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/tool-permissions.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/gateway/src/handlers/tool-permissions.ts
import { eq, sql } from "drizzle-orm";
import { toolPermissions } from "../db/schema.js";
import type { Router } from "../infra/router.js";

export function registerToolPermissionHandlers(router: Router) {
  router.register("tools.permissions.list", async (db) => {
    return db.select().from(toolPermissions).all();
  });

  router.register("tools.permissions.get", async (db, params) => {
    const { toolName } = params as { toolName: string };
    const [row] = await db
      .select()
      .from(toolPermissions)
      .where(eq(toolPermissions.toolName, toolName));
    return row ?? null;
  });

  router.register("tools.permissions.update", async (db, params) => {
    const { toolName, decision } = params as {
      toolName: string;
      decision: "allow" | "deny" | "prompt";
    };
    await db
      .insert(toolPermissions)
      .values({ toolName, decision, updatedAt: sql`datetime('now')` })
      .onConflictDoUpdate({
        target: toolPermissions.toolName,
        set: { decision, updatedAt: sql`datetime('now')` },
      });
    const [row] = await db
      .select()
      .from(toolPermissions)
      .where(eq(toolPermissions.toolName, toolName));
    return row;
  });
}
```

**Step 4: Register in handler index**

In `packages/gateway/src/handlers/index.ts`, add import and call:

```typescript
import { registerToolPermissionHandlers } from "./tool-permissions.js";
```

Add inside `registerAllHandlers()`:

```typescript
  registerToolPermissionHandlers(router);
```

**Step 5: Run tests**

Run: `cd packages/gateway && npx vitest run tests/handlers/tool-permissions.test.ts`
Expected: PASS

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/handlers/tool-permissions.ts packages/gateway/src/handlers/index.ts packages/gateway/tests/handlers/tool-permissions.test.ts
git commit -m "feat: add tool permissions CRUD handlers"
```

---

### Task 5: Research Thread & Message Handlers

**Files:**
- Create: `packages/gateway/src/handlers/research-threads.ts`
- Modify: `packages/gateway/src/handlers/index.ts`
- Test: `packages/gateway/tests/handlers/research-threads.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerResearchThreadHandlers } from "../../src/handlers/research-threads.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerResearchThreadHandlers(router);
  return { db, router };
}

describe("research thread handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    ({ db, router } = setup());
  });

  it("creates a thread", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Villas in Ischia",
    })) as Record<string, unknown>;
    expect(thread.id).toBe(1);
    expect(thread.title).toBe("Villas in Ischia");
  });

  it("lists threads sorted by updatedAt desc", async () => {
    await router.handle(db, "research.threads.create", { title: "Thread 1" });
    await router.handle(db, "research.threads.create", { title: "Thread 2" });
    const list = (await router.handle(db, "research.threads.list", {})) as unknown[];
    expect(list).toHaveLength(2);
    // Most recent first
    expect((list[0] as Record<string, unknown>).title).toBe("Thread 2");
  });

  it("deletes a thread and its messages", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Thread 1",
    })) as Record<string, unknown>;
    await router.handle(db, "research.messages.create", {
      threadId: thread.id,
      role: "user",
      content: "Hello",
    });
    await router.handle(db, "research.threads.delete", { id: thread.id });
    const list = (await router.handle(db, "research.threads.list", {})) as unknown[];
    expect(list).toHaveLength(0);
  });

  it("creates and lists messages for a thread", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Test",
    })) as Record<string, unknown>;
    await router.handle(db, "research.messages.create", {
      threadId: thread.id,
      role: "user",
      content: "Find villas",
    });
    await router.handle(db, "research.messages.create", {
      threadId: thread.id,
      role: "assistant",
      content: "I found 3 villas.",
      toolCalls: JSON.stringify([{ toolName: "search", args: {}, result: {} }]),
      vendorIds: JSON.stringify([1, 2]),
    });
    const messages = (await router.handle(db, "research.messages.list", {
      threadId: thread.id,
    })) as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(JSON.parse(messages[1].vendorIds as string)).toEqual([1, 2]);
  });

  it("updates thread title and categoryTags", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Initial",
    })) as Record<string, unknown>;
    const updated = (await router.handle(db, "research.threads.update", {
      id: thread.id,
      title: "Updated Title",
      categoryTags: JSON.stringify(["Venue/Food/Beverage"]),
    })) as Record<string, unknown>;
    expect(updated.title).toBe("Updated Title");
    expect(updated.categoryTags).toBe(JSON.stringify(["Venue/Food/Beverage"]));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/research-threads.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/gateway/src/handlers/research-threads.ts
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
```

**Step 4: Register in handler index**

In `packages/gateway/src/handlers/index.ts`, add import and call:

```typescript
import { registerResearchThreadHandlers } from "./research-threads.js";
```

Add inside `registerAllHandlers()`:

```typescript
  registerResearchThreadHandlers(router);
```

**Step 5: Run tests**

Run: `cd packages/gateway && npx vitest run tests/handlers/research-threads.test.ts`
Expected: PASS

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/handlers/research-threads.ts packages/gateway/src/handlers/index.ts packages/gateway/tests/handlers/research-threads.test.ts
git commit -m "feat: add research thread and message CRUD handlers"
```

---

### Task 6: Add Shared Protocol Types for New Events

**Files:**
- Modify: `packages/shared/src/protocol/messages.ts:29-36` (extend `GatewayEvent` union)

**Step 1: Add new event types to `GatewayEvent`**

In `packages/shared/src/protocol/messages.ts`, extend the `GatewayEvent` union (after line 35):

```typescript
  | { name: "research.messageComplete"; data: { threadId: number; message: unknown } }
  | { name: "research.toolActivity"; data: { threadId: number; sessionKey: string; toolName: string; phase: "start" | "result"; detail?: string; result?: unknown } }
  | { name: "research.permissionRequest"; data: { sessionKey: string; requestId: string; toolName: string; toolDescription: string } }
```

**Step 2: Rebuild shared package**

Run: `cd packages/shared && npm run build`
Expected: SUCCESS

**Step 3: Run gateway tests to ensure nothing breaks**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/shared/src/protocol/messages.ts
git commit -m "feat: add research chat and permission request event types"
```

---

### Task 7: Permission-Aware Tool Execution in Orchestrator

This is the core change. The orchestrator needs to pause agent execution when a tool requires permission, emit a WebSocket event, and wait for the user's response.

**Files:**
- Create: `packages/gateway/src/tools/permission-wrapper.ts`
- Test: `packages/gateway/tests/tools/permission-wrapper.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { wrapToolWithPermission, PermissionManager } from "../../src/tools/permission-wrapper.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return drizzle(sqlite, { schema });
}

const testTool = tool({
  description: "Test tool",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ result: query }),
});

describe("PermissionManager", () => {
  let db: ReturnType<typeof setupDb>;
  let manager: PermissionManager;

  beforeEach(() => {
    db = setupDb();
    manager = new PermissionManager(db);
  });

  it("returns 'prompt' for unknown tools", async () => {
    const decision = await manager.getDecision("search");
    expect(decision).toBe("prompt");
  });

  it("returns stored decision", async () => {
    await manager.setDecision("search", "allow");
    const decision = await manager.getDecision("search");
    expect(decision).toBe("allow");
  });
});

describe("wrapToolWithPermission", () => {
  let db: ReturnType<typeof setupDb>;
  let manager: PermissionManager;

  beforeEach(() => {
    db = setupDb();
    manager = new PermissionManager(db);
  });

  it("executes tool when permission is allow", async () => {
    await manager.setDecision("test", "allow");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission: vi.fn(),
    });
    const result = await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toEqual({ result: "hello" });
  });

  it("returns error when permission is deny", async () => {
    await manager.setDecision("test", "deny");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission: vi.fn(),
    });
    const result = await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("not permitted") });
  });

  it("requests permission and proceeds on allow", async () => {
    const requestPermission = vi.fn().mockResolvedValue("allow");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission,
    });
    const result = await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(requestPermission).toHaveBeenCalledWith("test");
    expect(result).toEqual({ result: "hello" });
  });

  it("requests permission and blocks on deny", async () => {
    const requestPermission = vi.fn().mockResolvedValue("deny");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission,
    });
    const result = await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("not permitted") });
  });

  it("persists always-allow decisions", async () => {
    const requestPermission = vi.fn().mockResolvedValue("always-allow");
    const wrapped = wrapToolWithPermission(testTool, "test", manager, {
      requestPermission,
    });
    await wrapped.execute!(
      { query: "hello" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const decision = await manager.getDecision("test");
    expect(decision).toBe("allow");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/permission-wrapper.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/gateway/src/tools/permission-wrapper.ts
import { tool as createTool } from "ai";
import type { Tool } from "ai";
import { eq, sql } from "drizzle-orm";
import { toolPermissions } from "../db/schema.js";
import type { Db } from "../infra/router.js";

export type PermissionDecision = "allow" | "deny" | "prompt";
export type UserResponse = "allow" | "always-allow" | "deny";

export interface PermissionCallbacks {
  requestPermission: (toolName: string) => Promise<UserResponse>;
}

export class PermissionManager {
  // In-memory cache so we don't hit DB on every tool call
  private cache = new Map<string, PermissionDecision>();

  constructor(private db: Db) {}

  async getDecision(toolName: string): Promise<PermissionDecision> {
    if (this.cache.has(toolName)) return this.cache.get(toolName)!;
    const [row] = await this.db
      .select()
      .from(toolPermissions)
      .where(eq(toolPermissions.toolName, toolName));
    const decision = (row?.decision as PermissionDecision) ?? "prompt";
    this.cache.set(toolName, decision);
    return decision;
  }

  async setDecision(toolName: string, decision: PermissionDecision): Promise<void> {
    await this.db
      .insert(toolPermissions)
      .values({ toolName, decision, updatedAt: sql`datetime('now')` })
      .onConflictDoUpdate({
        target: toolPermissions.toolName,
        set: { decision, updatedAt: sql`datetime('now')` },
      });
    this.cache.set(toolName, decision);
  }

  /** Grant for this session only (not persisted) */
  allowOnce(toolName: string): void {
    this.cache.set(toolName, "allow");
  }
}

export function wrapToolWithPermission(
  originalTool: Tool,
  toolName: string,
  manager: PermissionManager,
  callbacks: PermissionCallbacks,
): Tool {
  const orig = originalTool as { description?: string; parameters?: unknown; execute?: Function };
  return createTool({
    description: orig.description ?? "",
    inputSchema: (originalTool as any).inputSchema ?? (originalTool as any).parameters,
    execute: async (params: any, context: any) => {
      const decision = await manager.getDecision(toolName);

      if (decision === "allow") {
        return orig.execute!(params, context);
      }

      if (decision === "deny") {
        return { error: `Tool "${toolName}" is not permitted. Try an alternative approach.` };
      }

      // decision === "prompt" — ask the user
      const response = await callbacks.requestPermission(toolName);

      if (response === "always-allow") {
        await manager.setDecision(toolName, "allow");
        return orig.execute!(params, context);
      }

      if (response === "allow") {
        manager.allowOnce(toolName);
        return orig.execute!(params, context);
      }

      // response === "deny"
      return { error: `Tool "${toolName}" is not permitted. Try an alternative approach.` };
    },
  });
}
```

**Step 4: Run tests**

Run: `cd packages/gateway && npx vitest run tests/tools/permission-wrapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/permission-wrapper.ts packages/gateway/tests/tools/permission-wrapper.test.ts
git commit -m "feat: permission manager and tool wrapper for runtime approval"
```

---

### Task 8: Refactor Research Agent for Conversation Context

The research agent needs to accept conversation history (not just a single query) and use the tool registry.

**Files:**
- Modify: `packages/gateway/src/agents/research.ts`
- Modify: `packages/gateway/src/agents/base-agent.ts` (expand `AgentContext`)
- Modify: `packages/gateway/src/agents/orchestrator.ts` (pass registry + permission callbacks)
- Modify: `packages/gateway/src/index.ts` (wire registry into orchestrator)

**Step 1: Expand AgentContext to include tool registry and permission support**

In `packages/gateway/src/agents/base-agent.ts`, update `AgentContext`:

```typescript
import type { Db } from "../infra/router.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { PermissionManager, PermissionCallbacks } from "../tools/permission-wrapper.js";

export interface AgentContext {
  db: Db;
  sessionKey: string;
  emit: (action: string, detail?: string) => void;
  signal: AbortSignal;
  toolRegistry: ToolRegistry;
  permissionManager: PermissionManager;
  permissionCallbacks: PermissionCallbacks;
}

export interface AgentResult {
  summary: string;
  data?: unknown;
}

export interface BaseAgent {
  readonly name: string;
  readonly tools?: string[];
  run(ctx: AgentContext, input: unknown): Promise<AgentResult>;
}
```

**Step 2: Update the research agent to use conversation messages**

Rewrite `packages/gateway/src/agents/research.ts`:

The key changes:
- Accept `{ threadId, messages }` instead of `{ query }`
- Use `toolRegistry.getToolSetWithContext()` for tools
- Wrap tools with `wrapToolWithPermission()`
- Pass conversation history to `generateText()` via `messages` parameter
- Track created vendor IDs for the response

```typescript
import { generateText, stepCountIs } from "ai";
import type { CoreMessage } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { vendors, categories } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { BaseAgent, AgentContext, AgentResult } from "./base-agent.js";
import { getModel } from "./model-provider.js";
import { wrapToolWithPermission } from "../tools/permission-wrapper.js";

function makeCreateVendorTool(ctx: AgentContext) {
  return tool({
    description:
      "Create a new vendor record in the database. Use this after gathering sufficient information about a vendor. Avoid creating duplicates.",
    inputSchema: z.object({
      name: z.string().describe("The vendor's business name"),
      categoryName: z
        .string()
        .describe(
          "Category: Venue/Food/Beverage, Ceremony, Photography/Videography, Decor, Stationery, Attire, Entertainment, Planner/Coordinator, Miscellaneous, or Contingency",
        ),
      location: z.string().nullable().describe("Vendor location"),
      websiteUrl: z.string().nullable().describe("Vendor website URL"),
      contactEmail: z.string().nullable().describe("Contact email"),
      contactPhone: z.string().nullable().describe("Contact phone number"),
      description: z
        .string()
        .nullable()
        .describe("Brief description of services and what was found"),
    }),
    execute: async (params) => {
      ctx.emit("creating-vendor", `Adding vendor: ${params.name}`);

      const [cat] = await ctx.db
        .select()
        .from(categories)
        .where(eq(categories.name, params.categoryName));
      const categoryId = cat?.id ?? 9;

      const [vendor] = await ctx.db
        .insert(vendors)
        .values({
          categoryId,
          name: params.name,
          location: params.location,
          websiteUrl: params.websiteUrl,
          contactEmail: params.contactEmail,
          contactPhone: params.contactPhone,
          description: params.description,
          status: "researched",
        })
        .returning();

      return { vendorId: vendor.id, name: vendor.name };
    },
  });
}

const SYSTEM_PROMPT = `You are a wedding vendor research assistant. Your job is to find and document wedding vendors matching the user's queries.

## Process
1. Search the web for vendors matching the query
2. For promising results, scrape or browse the page to get details
3. Extract: business name, location, contact info, services offered, pricing hints
4. Create vendor records for each viable option found

## Guidelines
- Focus on quality over quantity — 2-5 well-researched vendors is better than 10 stubs
- Extract real contact information when available (email, phone, website)
- Write clear descriptions summarizing what the vendor offers
- Pick the most appropriate category for each vendor
- If a page is JavaScript-heavy and the scraper returns little content, try the browser tool
- If you find a PDF (menu, brochure, price list), parse it for details
- Do not create duplicate vendors
- When comparing vendors, always lead with pricing information — it's the #1 thing users care about
- After finding multiple vendors, provide a brief comparison summary highlighting key differences

## Categories
Venue/Food/Beverage, Ceremony, Photography/Videography, Decor, Stationery, Attire, Entertainment, Planner/Coordinator, Miscellaneous, Contingency`;

/** Tool names the research agent uses */
const RESEARCH_TOOLS = ["search", "scrape", "browse", "parsePdf"];

export const researchAgent: BaseAgent = {
  name: "research",
  tools: RESEARCH_TOOLS,

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { messages } = input as { messages: CoreMessage[] };
    ctx.emit("starting", "Researching...");

    // Build tool set: static tools from registry + dynamic createVendor
    const staticTools = ctx.toolRegistry.getToolSet(RESEARCH_TOOLS);
    const createVendorTool = makeCreateVendorTool(ctx);

    // Wrap all tools with permission checks
    const tools: Record<string, any> = {};
    for (const [name, t] of Object.entries(staticTools)) {
      tools[name] = wrapToolWithPermission(t, name, ctx.permissionManager, ctx.permissionCallbacks);
    }
    tools.createVendor = wrapToolWithPermission(
      createVendorTool,
      "createVendor",
      ctx.permissionManager,
      ctx.permissionCallbacks,
    );

    const model = await getModel();
    const { text, steps } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(15),
      abortSignal: ctx.signal,
      onStepFinish: ({ toolCalls: stepTools }) => {
        for (const tc of stepTools) {
          ctx.emit("tool-call", `${tc.toolName}: ${JSON.stringify(tc.input).slice(0, 100)}`);
        }
      },
    });

    // Collect all tool calls and vendor IDs from steps
    const allToolCalls: Array<{ toolName: string; args: unknown; result: unknown }> = [];
    const vendorIds: number[] = [];
    for (const step of steps) {
      for (const tc of step.toolCalls) {
        allToolCalls.push({ toolName: tc.toolName, args: tc.input, result: tc.result });
        if (tc.toolName === "createVendor" && tc.result && typeof tc.result === "object") {
          const r = tc.result as { vendorId?: number };
          if (r.vendorId) vendorIds.push(r.vendorId);
        }
      }
    }

    const vendorsCreated = vendorIds.length;
    ctx.emit("complete", `Created ${vendorsCreated} vendors`);

    return {
      summary: text ?? `Created ${vendorsCreated} vendor(s)`,
      data: { vendorsCreated, vendorIds, toolCalls: allToolCalls },
    };
  },
};
```

**Step 3: Update Orchestrator to provide registry and permissions in AgentContext**

In `packages/gateway/src/agents/orchestrator.ts`, add registry and permission manager fields:

Add imports:
```typescript
import type { ToolRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission-wrapper.js";
import type { UserResponse } from "../tools/permission-wrapper.js";
import { randomUUID } from "crypto";
```

Update `Orchestrator` class:
- Constructor takes `toolRegistry: ToolRegistry` as a new parameter
- Creates a `PermissionManager` from the DB
- The `execute()` method builds `permissionCallbacks` that emit WebSocket events and wait for responses

Add to the class fields:
```typescript
  private toolRegistry: ToolRegistry;
  private permissionManager: PermissionManager;
  private pendingPermissions = new Map<string, { resolve: (response: UserResponse) => void }>();
```

Update constructor signature:
```typescript
  constructor(
    db: Db,
    broadcast: (event: GatewayEvent) => void,
    toolRegistry: ToolRegistry,
    config?: OrchestratorConfig,
  )
```

In the constructor body, add:
```typescript
    this.toolRegistry = toolRegistry;
    this.permissionManager = new PermissionManager(db);
```

In `execute()`, update the ctx creation to include:
```typescript
    const permissionCallbacks = {
      requestPermission: async (toolName: string): Promise<UserResponse> => {
        const requestId = randomUUID();
        const entry = this.toolRegistry.get(toolName);
        this.broadcast({
          name: "research.permissionRequest",
          data: {
            sessionKey,
            requestId,
            toolName,
            toolDescription: entry?.description ?? toolName,
          },
        });
        return new Promise<UserResponse>((resolve) => {
          this.pendingPermissions.set(requestId, { resolve });
        });
      },
    };

    const ctx: AgentContext = {
      db: this.db,
      sessionKey,
      emit,
      signal,
      toolRegistry: this.toolRegistry,
      permissionManager: this.permissionManager,
      permissionCallbacks,
    };
```

Add a public method:
```typescript
  resolvePermission(requestId: string, response: UserResponse): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve(response);
      this.pendingPermissions.delete(requestId);
    }
  }
```

**Step 4: Update gateway index.ts to pass registry to orchestrator**

In `packages/gateway/src/index.ts`:

Add import:
```typescript
import { createToolRegistry } from "./tools/index.js";
```

Before orchestrator creation (around line 94), create the registry:
```typescript
    const toolRegistry = createToolRegistry();
```

Update orchestrator constructor call:
```typescript
    const orchestrator = new Orchestrator(db, (event) => wsServer.broadcast(event), toolRegistry);
```

**Step 5: Update agent handlers to support new research flow**

In `packages/gateway/src/handlers/agents.ts`, update the `agent.research` handler and add a permission response handler:

```typescript
  router.register("agent.research", async (_db, params) => {
    const { threadId, messages } = params as { threadId: number; messages: unknown[] };
    if (!threadId || !messages) {
      throw new Error("threadId and messages are required");
    }
    const { taskId, sessionKey } = await orchestrator.dispatch("research", { messages });
    return { taskId, sessionKey };
  });

  router.register("research.permissionResponse", async (_db, params) => {
    const { requestId, response } = params as { requestId: string; response: string };
    orchestrator.resolvePermission(requestId, response as any);
    return { ok: true };
  });
```

**Step 6: Update other agents to handle the expanded AgentContext**

The outreach, parser, translation, and heartbeat agents receive `AgentContext` but don't use `toolRegistry`/`permissionManager`. They need to accept the new fields without breaking. Since TypeScript interfaces are structural, they'll work as long as they don't destructure unknown fields. Verify by running:

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS (some may need minor adjustments for the new constructor signature)

**Step 7: Commit**

```bash
git add packages/gateway/src/agents/base-agent.ts packages/gateway/src/agents/research.ts packages/gateway/src/agents/orchestrator.ts packages/gateway/src/index.ts packages/gateway/src/handlers/agents.ts packages/gateway/src/tools/index.ts
git commit -m "feat: research agent with conversation context, registry, and permissions"
```

---

### Task 9: Frontend — Thread List Sidebar

**Files:**
- Create: `packages/app/src/renderer/components/research/ThreadList.tsx`

**Step 1: Create the ThreadList component**

```tsx
import { useState } from "react";
import { Plus, MessageSquare } from "lucide-react";

interface Thread {
  id: number;
  title: string;
  categoryTags: string | null;
  updatedAt: string;
}

interface ThreadListProps {
  threads: Thread[];
  activeThreadId: number | null;
  onSelect: (threadId: number) => void;
  onCreate: () => void;
}

export function ThreadList({ threads, activeThreadId, onSelect, onCreate }: ThreadListProps) {
  return (
    <div className="flex flex-col h-full border-r border-white/10">
      <div className="p-3 border-b border-white/10">
        <button
          onClick={onCreate}
          className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New thread
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => {
          const tags: string[] = thread.categoryTags ? JSON.parse(thread.categoryTags) : [];
          const isActive = thread.id === activeThreadId;
          return (
            <button
              key={thread.id}
              onClick={() => onSelect(thread.id)}
              className={`w-full text-left px-3 py-3 border-b border-white/5 transition-colors ${
                isActive ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{thread.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </p>
                  {tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/app/src/renderer/components/research/ThreadList.tsx
git commit -m "feat: add ThreadList sidebar component"
```

---

### Task 10: Frontend — Chat Message Components

**Files:**
- Create: `packages/app/src/renderer/components/research/ChatMessage.tsx`
- Create: `packages/app/src/renderer/components/research/ToolActivityCard.tsx`
- Create: `packages/app/src/renderer/components/research/VendorResultCard.tsx`
- Create: `packages/app/src/renderer/components/research/PermissionRequestCard.tsx`
- Create: `packages/app/src/renderer/components/research/ComposeBox.tsx`

**Step 1: Create ToolActivityCard**

```tsx
// packages/app/src/renderer/components/research/ToolActivityCard.tsx
import { useState } from "react";
import { Search, Globe, Monitor, FileText, ChevronDown, ChevronRight } from "lucide-react";

const TOOL_ICONS: Record<string, { icon: typeof Search; label: string }> = {
  search: { icon: Search, label: "Searching" },
  scrape: { icon: Globe, label: "Scraping" },
  browse: { icon: Monitor, label: "Browsing" },
  parsePdf: { icon: FileText, label: "Parsing PDF" },
};

interface ToolActivityCardProps {
  toolName: string;
  args: unknown;
  result?: unknown;
}

export function ToolActivityCard({ toolName, args, result }: ToolActivityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = TOOL_ICONS[toolName] ?? { icon: Search, label: toolName };
  const Icon = config.icon;

  const detail =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>).query?.toString() ??
        (args as Record<string, unknown>).url?.toString() ??
        JSON.stringify(args).slice(0, 80)
      : String(args);

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className="h-3 w-3" />
        <span className="font-medium">{config.label}</span>
        <span className="truncate max-w-[300px]">{detail}</span>
      </button>
      {expanded && result && (
        <pre className="mt-1 ml-6 p-2 rounded bg-white/5 text-[11px] text-gray-400 overflow-x-auto max-h-40">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

**Step 2: Create VendorResultCard**

```tsx
// packages/app/src/renderer/components/research/VendorResultCard.tsx
import { MapPin, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface VendorResultCardProps {
  vendorId: number;
  name: string;
  location?: string | null;
  description?: string | null;
  price?: string | null;
}

export function VendorResultCard({ vendorId, name, location, description, price }: VendorResultCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/vendors/${vendorId}`)}
      className="flex items-start justify-between gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-white">{name}</span>
          {price && (
            <span className="text-sm font-semibold text-emerald-400">{price}</span>
          )}
        </div>
        {location && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
            <MapPin className="h-3 w-3" />
            <span>{location}</span>
          </div>
        )}
        {description && (
          <p className="mt-1 text-xs text-gray-500 line-clamp-1">{description}</p>
        )}
      </div>
      <ExternalLink className="h-4 w-4 text-gray-600 shrink-0 mt-0.5" />
    </div>
  );
}
```

**Step 3: Create PermissionRequestCard**

```tsx
// packages/app/src/renderer/components/research/PermissionRequestCard.tsx
import { Shield } from "lucide-react";

interface PermissionRequestCardProps {
  toolName: string;
  toolDescription: string;
  onDecision: (decision: "allow" | "always-allow" | "deny") => void;
  resolved?: string | null;
}

export function PermissionRequestCard({
  toolName,
  toolDescription,
  onDecision,
  resolved,
}: PermissionRequestCardProps) {
  if (resolved) {
    const label = resolved === "deny" ? "Denied" : "Allowed";
    const color = resolved === "deny" ? "text-red-400" : "text-emerald-400";
    return (
      <div className="flex items-center gap-2 my-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-xs">
        <Shield className="h-3.5 w-3.5 text-gray-500" />
        <span className="text-gray-400">{toolName}</span>
        <span className={color}>{label}</span>
      </div>
    );
  }

  return (
    <div className="my-2 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-medium text-amber-300">Permission Required</span>
      </div>
      <p className="text-sm text-white font-medium">{toolName}</p>
      <p className="text-xs text-gray-400 mt-0.5">{toolDescription}</p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onDecision("allow")}
          className="px-3 py-1.5 text-xs rounded-md bg-white/10 text-white hover:bg-white/15 transition-colors"
        >
          Allow once
        </button>
        <button
          onClick={() => onDecision("always-allow")}
          className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
        >
          Always allow
        </button>
        <button
          onClick={() => onDecision("deny")}
          className="px-3 py-1.5 text-xs rounded-md bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Create ComposeBox**

```tsx
// packages/app/src/renderer/components/research/ComposeBox.tsx
import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface ComposeBoxProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ComposeBox({
  onSend,
  disabled = false,
  placeholder = "Ask about vendors, venues, pricing...",
}: ComposeBoxProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [value]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/20 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="shrink-0 rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

**Step 5: Create ChatMessage**

```tsx
// packages/app/src/renderer/components/research/ChatMessage.tsx
import { ToolActivityCard } from "./ToolActivityCard";
import { VendorResultCard } from "./VendorResultCard";
import { PermissionRequestCard } from "./PermissionRequestCard";

interface ToolCall {
  toolName: string;
  args: unknown;
  result: unknown;
}

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  vendors?: Array<{
    id: number;
    name: string;
    location?: string | null;
    description?: string | null;
  }>;
}

export function ChatMessage({ role, content, toolCalls, vendors }: MessageProps) {
  const isUser = role === "user";

  return (
    <div className={`py-4 ${isUser ? "" : ""}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-medium ${isUser ? "text-blue-400" : "text-purple-400"}`}>
          {isUser ? "You" : "Assistant"}
        </span>
      </div>

      {/* Tool activity cards (before main text for assistant) */}
      {!isUser && toolCalls && toolCalls.length > 0 && (
        <div className="mb-2">
          {toolCalls
            .filter((tc) => tc.toolName !== "createVendor")
            .map((tc, i) => (
              <ToolActivityCard key={i} toolName={tc.toolName} args={tc.args} result={tc.result} />
            ))}
        </div>
      )}

      {/* Message text */}
      {content && (
        <div className="text-sm text-gray-200 whitespace-pre-wrap">{content}</div>
      )}

      {/* Vendor result cards */}
      {vendors && vendors.length > 0 && (
        <div className="mt-3 space-y-2">
          {vendors.map((v) => (
            <VendorResultCard key={v.id} vendorId={v.id} name={v.name} location={v.location} description={v.description} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add packages/app/src/renderer/components/research/ChatMessage.tsx packages/app/src/renderer/components/research/ToolActivityCard.tsx packages/app/src/renderer/components/research/VendorResultCard.tsx packages/app/src/renderer/components/research/PermissionRequestCard.tsx packages/app/src/renderer/components/research/ComposeBox.tsx
git commit -m "feat: add chat message components — tool cards, vendor cards, permission cards, compose box"
```

---

### Task 11: Frontend — ResearchChatView (Main Container)

This replaces the current `ResearchView`. It wires together the thread list, message thread, compose box, and handles WebSocket events.

**Files:**
- Rewrite: `packages/app/src/renderer/components/research/ResearchView.tsx`

**Step 1: Rewrite ResearchView as a chat interface**

```tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { wsClient } from "../../lib/ws-client";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { useVendors } from "../../hooks/useVendors";
import { ThreadList } from "./ThreadList";
import { ChatMessage } from "./ChatMessage";
import { ComposeBox } from "./ComposeBox";
import { PermissionRequestCard } from "./PermissionRequestCard";
import type { GatewayEvent } from "@wedding-planner/shared";

interface Thread {
  id: number;
  title: string;
  categoryTags: string | null;
  updatedAt: string;
}

interface Message {
  id: number;
  threadId: number;
  role: string;
  content: string;
  toolCalls: string | null;
  vendorIds: string | null;
  createdAt: string;
}

interface PendingPermission {
  requestId: string;
  toolName: string;
  toolDescription: string;
  resolved: string | null;
}

export function ResearchView() {
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<Array<{ toolName: string; detail: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Data fetching
  const { data: threads, refetch: refetchThreads } = useRequest<Thread[]>("research.threads.list");
  const { data: messages, refetch: refetchMessages } = useRequest<Message[]>(
    activeThreadId ? "research.messages.list" : null,
    activeThreadId ? { threadId: activeThreadId } : undefined,
  );
  const { data: allVendors } = useVendors();

  // Mutations
  const { mutate: createThread } = useMutation<{ title: string }, Thread>("research.threads.create");
  const { mutate: createMessage } = useMutation<
    { threadId: number; role: string; content: string },
    Message
  >("research.messages.create");
  const { mutate: startResearch, loading: researching } = useMutation<
    { threadId: number; messages: unknown[] },
    { taskId: string; sessionKey: string }
  >("agent.research");
  const { mutate: respondPermission } = useMutation<
    { requestId: string; response: string },
    unknown
  >("research.permissionResponse");

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveToolCalls, pendingPermissions]);

  // WebSocket event handler
  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (event.name === "agent-activity" && event.data.sessionKey === activeSession) {
        if (event.data.action === "tool-call" && event.data.detail) {
          setLiveToolCalls((prev) => [
            ...prev,
            { toolName: event.data.detail!.split(":")[0], detail: event.data.detail! },
          ]);
        }
      }

      if (event.name === "agent-complete" && activeSession) {
        setActiveSession(null);
        setLiveToolCalls([]);
        refetchMessages();
        refetchThreads();
      }

      if (event.name === "research.permissionRequest" as any) {
        const data = (event as any).data as {
          sessionKey: string;
          requestId: string;
          toolName: string;
          toolDescription: string;
        };
        if (data.sessionKey === activeSession) {
          setPendingPermissions((prev) => [
            ...prev,
            {
              requestId: data.requestId,
              toolName: data.toolName,
              toolDescription: data.toolDescription,
              resolved: null,
            },
          ]);
        }
      }
    },
    [activeSession, refetchMessages, refetchThreads],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  // Handlers
  async function handleCreateThread() {
    const thread = await createThread({ title: "New research" });
    setActiveThreadId(thread.id);
    refetchThreads();
  }

  async function handleSend(content: string) {
    if (!activeThreadId) {
      // Auto-create thread with first message as title
      const title = content.length > 50 ? content.slice(0, 50) + "..." : content;
      const thread = await createThread({ title });
      setActiveThreadId(thread.id);
      await createMessage({ threadId: thread.id, role: "user", content });
      refetchMessages();
      refetchThreads();

      // Build messages array for the agent
      const agentMessages = [{ role: "user" as const, content }];
      const result = await startResearch({ threadId: thread.id, messages: agentMessages });
      setActiveSession(result.sessionKey);
      return;
    }

    // Add user message
    await createMessage({ threadId: activeThreadId, role: "user", content });
    refetchMessages();

    // Build full conversation history for the agent
    const currentMessages = messages ?? [];
    const agentMessages = [
      ...currentMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content },
    ];

    const result = await startResearch({ threadId: activeThreadId, messages: agentMessages });
    setActiveSession(result.sessionKey);
  }

  async function handlePermissionDecision(requestId: string, decision: "allow" | "always-allow" | "deny") {
    await respondPermission({ requestId, response: decision });
    setPendingPermissions((prev) =>
      prev.map((p) => (p.requestId === requestId ? { ...p, resolved: decision } : p)),
    );
  }

  // Build vendor lookup for enriching messages
  const vendorMap = new Map((allVendors ?? []).map((v) => [v.id, v]));

  function getVendorsForMessage(msg: Message) {
    if (!msg.vendorIds) return [];
    const ids: number[] = JSON.parse(msg.vendorIds);
    return ids.map((id) => vendorMap.get(id)).filter(Boolean) as Array<{
      id: number;
      name: string;
      location: string | null;
      description: string | null;
    }>;
  }

  function getToolCallsForMessage(msg: Message) {
    if (!msg.toolCalls) return [];
    return JSON.parse(msg.toolCalls) as Array<{
      toolName: string;
      args: unknown;
      result: unknown;
    }>;
  }

  return (
    <div className="flex h-full">
      {/* Thread sidebar */}
      <div className="w-64 shrink-0">
        <ThreadList
          threads={threads ?? []}
          activeThreadId={activeThreadId}
          onSelect={(id) => {
            setActiveThreadId(id);
            setActiveSession(null);
            setLiveToolCalls([]);
            setPendingPermissions([]);
          }}
          onCreate={handleCreateThread}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6">
          {activeThreadId && messages ? (
            <>
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as "user" | "assistant"}
                  content={msg.content}
                  toolCalls={getToolCallsForMessage(msg)}
                  vendors={getVendorsForMessage(msg)}
                />
              ))}

              {/* Live tool activity while agent is running */}
              {activeSession && liveToolCalls.length > 0 && (
                <div className="py-4">
                  <span className="text-xs font-medium text-purple-400">Assistant</span>
                  <div className="mt-1">
                    {liveToolCalls.map((tc, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-500 my-0.5">
                        <span className="animate-pulse">*</span>
                        <span>{tc.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending permission requests */}
              {pendingPermissions.map((p) => (
                <PermissionRequestCard
                  key={p.requestId}
                  toolName={p.toolName}
                  toolDescription={p.toolDescription}
                  resolved={p.resolved}
                  onDecision={(decision) => handlePermissionDecision(p.requestId, decision)}
                />
              ))}

              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p className="text-sm">Start a new research thread or select one from the sidebar.</p>
            </div>
          )}
        </div>

        {/* Compose box */}
        <ComposeBox
          onSend={handleSend}
          disabled={!!activeSession}
        />
      </div>
    </div>
  );
}
```

**Step 2: Verify the app compiles**

Run: `cd packages/app && npx electron-vite build 2>&1 | head -20`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/research/ResearchView.tsx
git commit -m "feat: rewrite ResearchView as persistent threaded chat"
```

---

### Task 12: Frontend — Tool Permissions in Settings

**Files:**
- Create: `packages/app/src/renderer/components/settings/ToolPermissions.tsx`
- Modify: `packages/app/src/renderer/components/settings/SettingsView.tsx` (add section)

**Step 1: Create ToolPermissions component**

```tsx
// packages/app/src/renderer/components/settings/ToolPermissions.tsx
import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";
import { Shield, Check, X, HelpCircle } from "lucide-react";

interface ToolPermission {
  id: number;
  toolName: string;
  decision: string;
  updatedAt: string;
}

interface ToolInfo {
  name: string;
  description: string;
  category: string;
}

export function ToolPermissions() {
  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);

  useEffect(() => {
    wsClient.request<ToolPermission[]>("tools.permissions.list").then(setPermissions);
    wsClient.request<ToolInfo[]>("tools.list").then(setTools);
  }, []);

  async function handleChange(toolName: string, decision: string) {
    await wsClient.request("tools.permissions.update", { toolName, decision });
    const updated = await wsClient.request<ToolPermission[]>("tools.permissions.list");
    setPermissions(updated);
  }

  const permissionMap = new Map(permissions.map((p) => [p.toolName, p.decision]));

  const DECISION_ICONS = {
    allow: { icon: Check, color: "text-emerald-400", label: "Allowed" },
    deny: { icon: X, color: "text-red-400", label: "Denied" },
    prompt: { icon: HelpCircle, color: "text-amber-400", label: "Ask each time" },
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-5 w-5 text-gray-400" />
        <h2 className="text-lg font-semibold">Tool Permissions</h2>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Control which tools the research agent can use. "Ask each time" will prompt you during research.
      </p>
      <div className="space-y-2">
        {tools.map((tool) => {
          const current = permissionMap.get(tool.name) ?? "prompt";
          return (
            <div
              key={tool.name}
              className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/[0.02]"
            >
              <div>
                <p className="text-sm font-medium text-white">{tool.name}</p>
                <p className="text-xs text-gray-500">{tool.description}</p>
              </div>
              <select
                value={current}
                onChange={(e) => handleChange(tool.name, e.target.value)}
                className="text-xs rounded-md border border-white/10 bg-white/5 px-2 py-1 text-gray-300"
              >
                <option value="prompt">Ask each time</option>
                <option value="allow">Always allow</option>
                <option value="deny">Always deny</option>
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Add `tools.list` handler to the gateway**

In `packages/gateway/src/handlers/tool-permissions.ts`, add (requires the registry to be passed in):

Update the function signature to accept the registry:

```typescript
import type { ToolRegistry } from "../tools/registry.js";

export function registerToolPermissionHandlers(router: Router, toolRegistry?: ToolRegistry) {
  // ... existing handlers ...

  router.register("tools.list", async () => {
    return toolRegistry?.listAll() ?? [];
  });
}
```

Update the call in `packages/gateway/src/handlers/index.ts` to pass the registry (or defer to a later wiring step — the registry is created in `index.ts`). A simpler approach: register `tools.list` in `index.ts` directly after the registry is created:

In `packages/gateway/src/index.ts`, after creating the tool registry, add:

```typescript
    router.register("tools.list", async () => {
      return toolRegistry.listAll();
    });
```

**Step 3: Add ToolPermissions to SettingsView**

Read the current SettingsView to find where to add the section, then import and render `<ToolPermissions />` after the AI Provider section.

**Step 4: Commit**

```bash
git add packages/app/src/renderer/components/settings/ToolPermissions.tsx packages/gateway/src/index.ts
git commit -m "feat: add tool permissions settings UI and tools.list endpoint"
```

---

### Task 13: Wire Up Agent Response Saving

After the research agent completes, the assistant message (including tool calls and vendor IDs) needs to be saved to the `researchMessages` table.

**Files:**
- Modify: `packages/gateway/src/handlers/agents.ts`

**Step 1: Update the research handler to save the response**

The `agent.research` handler should listen for the `agent-complete` event and save the assistant message. A cleaner approach: have the orchestrator's `execute()` method save the message after agent completion.

In `packages/gateway/src/agents/orchestrator.ts`, update the `execute()` method's success path. After line 131 (the `agent-complete` broadcast), add message saving:

```typescript
      // Save assistant message to thread if this was a research chat
      const researchInput = input as { threadId?: number; messages?: unknown[] };
      if (researchInput.threadId) {
        const resultData = result.data as {
          toolCalls?: unknown[];
          vendorIds?: number[];
        } | undefined;
        await this.db.insert(researchMessages).values({
          threadId: researchInput.threadId,
          role: "assistant",
          content: result.summary,
          toolCalls: resultData?.toolCalls ? JSON.stringify(resultData.toolCalls) : null,
          vendorIds: resultData?.vendorIds ? JSON.stringify(resultData.vendorIds) : null,
        });
        // Broadcast that a new message was saved
        this.broadcast({
          name: "research.messageComplete" as any,
          data: { threadId: researchInput.threadId },
        });
      }
```

Add import at top of orchestrator:
```typescript
import { researchMessages } from "../db/schema.js";
```

**Step 2: Run tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/gateway/src/agents/orchestrator.ts
git commit -m "feat: save assistant messages to research thread on completion"
```

---

### Task 14: Clean Up Old Components

**Files:**
- Delete or keep for reference: `packages/app/src/renderer/components/research/ResearchInput.tsx`
- Delete or keep for reference: `packages/app/src/renderer/components/research/AgentActivityStream.tsx`

**Step 1: Remove old imports from ResearchView**

The new `ResearchView.tsx` (Task 11) no longer imports `ResearchInput` or `AgentActivityStream`. Verify these files are not imported elsewhere.

Run: `grep -r "ResearchInput\|AgentActivityStream" packages/app/src/ --include="*.tsx" --include="*.ts"`

If only the old files reference themselves, delete them:

```bash
rm packages/app/src/renderer/components/research/ResearchInput.tsx
rm packages/app/src/renderer/components/research/AgentActivityStream.tsx
```

**Step 2: Verify app still compiles**

Run: `cd packages/app && npx electron-vite build 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add -A packages/app/src/renderer/components/research/
git commit -m "refactor: remove old ResearchInput and AgentActivityStream components"
```

---

### Task 15: Integration Test — Full Research Chat Flow

**Files:**
- Create: `packages/gateway/tests/handlers/research-chat-flow.test.ts`

**Step 1: Write an integration test for the full flow**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { Router } from "../../src/infra/router.js";
import { registerAllHandlers } from "../../src/handlers/index.js";
import { registerResearchThreadHandlers } from "../../src/handlers/research-threads.js";
import { registerToolPermissionHandlers } from "../../src/handlers/tool-permissions.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAllHandlers(router);
  return { db, router };
}

describe("research chat flow", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
  });

  it("creates a thread, adds messages, and retrieves history", async () => {
    // Create thread
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Villas in Ischia",
    })) as Record<string, unknown>;
    expect(thread.id).toBe(1);

    // Add user message
    await router.handle(db, "research.messages.create", {
      threadId: 1,
      role: "user",
      content: "Find me villas in Ischia for 80 guests",
    });

    // Add assistant response with tool calls and vendors
    await router.handle(db, "research.messages.create", {
      threadId: 1,
      role: "assistant",
      content: "I found 2 villas in Ischia.",
      toolCalls: JSON.stringify([
        { toolName: "search", args: { query: "villas Ischia" }, result: [] },
      ]),
      vendorIds: JSON.stringify([1, 2]),
    });

    // Retrieve messages
    const messages = (await router.handle(db, "research.messages.list", {
      threadId: 1,
    })) as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(JSON.parse(messages[1].toolCalls as string)).toHaveLength(1);
  });

  it("manages tool permissions end-to-end", async () => {
    // Default: no permissions set
    const initial = await router.handle(db, "tools.permissions.get", { toolName: "search" });
    expect(initial).toBeNull();

    // Set to allow
    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "allow",
    });

    const after = (await router.handle(db, "tools.permissions.get", {
      toolName: "search",
    })) as Record<string, unknown>;
    expect(after.decision).toBe("allow");

    // Revoke back to prompt
    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "prompt",
    });

    const revoked = (await router.handle(db, "tools.permissions.get", {
      toolName: "search",
    })) as Record<string, unknown>;
    expect(revoked.decision).toBe("prompt");
  });

  it("lists threads sorted by most recent", async () => {
    await router.handle(db, "research.threads.create", { title: "Thread A" });
    await router.handle(db, "research.threads.create", { title: "Thread B" });

    // Add a message to Thread A to update its timestamp
    await router.handle(db, "research.messages.create", {
      threadId: 1,
      role: "user",
      content: "Update",
    });

    const threads = (await router.handle(db, "research.threads.list", {})) as Array<
      Record<string, unknown>
    >;
    expect(threads).toHaveLength(2);
    // Thread A should be first since its updatedAt was touched
    expect(threads[0].title).toBe("Thread A");
  });
});
```

**Step 2: Run the integration test**

Run: `cd packages/gateway && npx vitest run tests/handlers/research-chat-flow.test.ts`
Expected: PASS

**Step 3: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/gateway/tests/handlers/research-chat-flow.test.ts
git commit -m "test: add integration tests for research chat flow"
```

---

### Task 16: Manual Smoke Test

**Step 1: Start the app**

Run: `npm run dev` from the project root

**Step 2: Verify the research tab**

- Navigate to the Research tab
- Verify the thread sidebar appears on the left
- Click "New thread" — a thread should appear in the sidebar
- Type a message and press Enter
- If AI provider is configured: agent should run, permission cards should appear for web tools
- If no AI provider: verify the error is handled gracefully
- After completion, assistant message should appear with tool cards and vendor cards
- Navigate away and back — thread should persist
- Click vendor cards — should navigate to `/vendors/:id`

**Step 3: Verify tool permissions in Settings**

- Navigate to Settings
- Scroll to Tool Permissions section
- Verify all registered tools appear
- Change a permission and verify it persists after page reload

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes for research chat"
```
