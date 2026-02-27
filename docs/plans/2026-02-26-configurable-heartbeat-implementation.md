# Configurable Heartbeat Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the heartbeat system into a user-configurable LLM-powered agent that can autonomously research vendors, draft outreach, and report activity on a dashboard.

**Architecture:** Two-phase heartbeat: Phase 1 runs existing DB health checks (always). Phase 2 dispatches an LLM agent via `AgentRunner` using the user's custom prompt (if enabled). Results appear in a "While You Were Gone" dashboard section. WhatsApp/email messages are always created as drafts unless the user has enabled auto-send.

**Tech Stack:** drizzle-orm + better-sqlite3 (DB), Vercel AI SDK (LLM), React 19 + Tailwind v4 (UI), vitest (tests)

---

### Task 1: Add `heartbeat_config` DB table

**Files:**
- Modify: `packages/gateway/src/db/schema.ts` (add table definition after `searchConfig`, ~line 231)
- Modify: `packages/gateway/src/db/migrate.ts` (add CREATE TABLE, ~line 213)

**Step 1: Add drizzle schema definition**

In `packages/gateway/src/db/schema.ts`, add after the `searchConfig` table (after line 231):

```ts
export const heartbeatConfig = sqliteTable("heartbeat_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  enabled: integer("enabled").notNull().default(0),
  prompt: text("prompt"),
  intervalMinutes: integer("interval_minutes").notNull().default(30),
  lastRunAt: text("last_run_at"),
});
```

**Step 2: Add CREATE TABLE to migrate.ts**

In `packages/gateway/src/db/migrate.ts`, add inside the main `sqlite.exec()` template literal block, after the `search_config` table (before line 214's closing `\``):

```sql
    CREATE TABLE IF NOT EXISTS heartbeat_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled INTEGER NOT NULL DEFAULT 0,
      prompt TEXT,
      interval_minutes INTEGER NOT NULL DEFAULT 30,
      last_run_at TEXT
    );
```

**Step 3: Run tests to verify schema change doesn't break anything**

Run: `cd packages/gateway && npx vitest run`
Expected: All existing tests pass (the new table is additive)

**Step 4: Commit**

```bash
git add packages/gateway/src/db/schema.ts packages/gateway/src/db/migrate.ts
git commit -m "feat: add heartbeat_config DB table"
```

---

### Task 2: Add heartbeat-config handlers

**Files:**
- Create: `packages/gateway/src/handlers/heartbeat-config.ts`
- Modify: `packages/gateway/src/handlers/index.ts` (register new handlers)

**Step 1: Create the handler file**

Create `packages/gateway/src/handlers/heartbeat-config.ts`:

```ts
import { heartbeatConfig } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerHeartbeatConfigHandlers(router: Router) {
  router.register("heartbeat-config.get", async (db: Db) => {
    const [row] = await db.select().from(heartbeatConfig).limit(1);
    return row ?? { enabled: 0, prompt: null, intervalMinutes: 30, lastRunAt: null };
  });

  router.register("heartbeat-config.update", async (db: Db, params: unknown) => {
    const { enabled, prompt, intervalMinutes } = params as {
      enabled?: boolean;
      prompt?: string | null;
      intervalMinutes?: number;
    };

    const [existing] = await db.select().from(heartbeatConfig).limit(1);

    const values: Record<string, unknown> = {};
    if (enabled !== undefined) values.enabled = enabled ? 1 : 0;
    if (prompt !== undefined) values.prompt = prompt;
    if (intervalMinutes !== undefined) values.intervalMinutes = intervalMinutes;

    if (existing) {
      await db.update(heartbeatConfig).set(values).where(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (heartbeatConfig as any).id.equals(existing.id),
      );
    } else {
      await db.insert(heartbeatConfig).values({
        enabled: enabled ? 1 : 0,
        prompt: prompt ?? null,
        intervalMinutes: intervalMinutes ?? 30,
      });
    }

    const [updated] = await db.select().from(heartbeatConfig).limit(1);
    return updated;
  });
}
```

Wait — the drizzle pattern for updates uses `eq` from drizzle-orm, not `.equals()`. Let me fix that. Looking at the existing handler patterns (e.g., `communications.ts` line 70), the update pattern is:

```ts
import { eq } from "drizzle-orm";
// ...
await db.update(heartbeatConfig).set(values).where(eq(heartbeatConfig.id, existing.id));
```

Create `packages/gateway/src/handlers/heartbeat-config.ts`:

```ts
import { eq } from "drizzle-orm";
import { heartbeatConfig } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerHeartbeatConfigHandlers(router: Router) {
  router.register("heartbeat-config.get", async (db: Db) => {
    const [row] = await db.select().from(heartbeatConfig).limit(1);
    return row ?? { enabled: 0, prompt: null, intervalMinutes: 30, lastRunAt: null };
  });

  router.register("heartbeat-config.update", async (db: Db, params: unknown) => {
    const { enabled, prompt, intervalMinutes } = params as {
      enabled?: boolean;
      prompt?: string | null;
      intervalMinutes?: number;
    };

    const [existing] = await db.select().from(heartbeatConfig).limit(1);

    const values: Record<string, unknown> = {};
    if (enabled !== undefined) values.enabled = enabled ? 1 : 0;
    if (prompt !== undefined) values.prompt = prompt;
    if (intervalMinutes !== undefined) values.intervalMinutes = intervalMinutes;

    if (existing) {
      await db.update(heartbeatConfig).set(values).where(eq(heartbeatConfig.id, existing.id));
    } else {
      await db.insert(heartbeatConfig).values({
        enabled: enabled ? 1 : 0,
        prompt: prompt ?? null,
        intervalMinutes: intervalMinutes ?? 30,
      });
    }

    const [updated] = await db.select().from(heartbeatConfig).limit(1);
    return updated;
  });
}
```

**Step 2: Register in handlers/index.ts**

Add import at top of `packages/gateway/src/handlers/index.ts`:

```ts
import { registerHeartbeatConfigHandlers } from "./heartbeat-config.js";
```

Add call inside `registerAllHandlers()`, after `registerSearchConfigHandlers(router)` (after line 34):

```ts
  registerHeartbeatConfigHandlers(router);
```

**Step 3: Run tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All existing tests pass

**Step 4: Commit**

```bash
git add packages/gateway/src/handlers/heartbeat-config.ts packages/gateway/src/handlers/index.ts
git commit -m "feat: add heartbeat-config.get and heartbeat-config.update handlers"
```

---

### Task 3: Update HeartbeatScheduler to read config and dispatch LLM agent

**Files:**
- Modify: `packages/gateway/src/infra/heartbeat-scheduler.ts`
- Modify: `packages/gateway/src/index.ts` (pass DB to scheduler)

**Step 1: Rewrite HeartbeatScheduler**

Replace the contents of `packages/gateway/src/infra/heartbeat-scheduler.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { heartbeatConfig } from "../db/schema.js";
import type { Orchestrator } from "../agents/orchestrator.js";
import type { GatewayEvent } from "@wedding-planner/shared";
import type { Db } from "../infra/router.js";

export class HeartbeatScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private orchestrator: Orchestrator;
  private broadcast: (event: GatewayEvent) => void;
  private db: Db;
  private currentIntervalMs: number = 30 * 60 * 1000;

  constructor(
    orchestrator: Orchestrator,
    broadcast: (event: GatewayEvent) => void,
    db: Db,
  ) {
    this.orchestrator = orchestrator;
    this.broadcast = broadcast;
    this.db = db;
  }

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.currentIntervalMs);

    this.broadcast({
      name: "agent-activity",
      data: {
        sessionKey: "heartbeat",
        action: "scheduled",
        detail: `Heartbeat scheduled every ${Math.round(this.currentIntervalMs / 60_000)} minutes`,
      },
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      // Phase 1: Health checks (always)
      await this.orchestrator.dispatch("heartbeat", {}, { lane: "heartbeat" });

      // Phase 2: LLM research (if configured)
      const [config] = await this.db.select().from(heartbeatConfig).limit(1);

      if (config?.enabled && config.prompt) {
        this.broadcast({
          name: "agent-activity",
          data: {
            sessionKey: "heartbeat-research",
            action: "starting",
            detail: "Running scheduled research...",
          },
        });

        await this.orchestrator.dispatch(
          "heartbeat-research",
          { messages: [{ role: "user" as const, content: config.prompt }] },
          { lane: "heartbeat" },
        );

        // Update last_run_at
        await this.db
          .update(heartbeatConfig)
          .set({ lastRunAt: sql`datetime('now')` })
          .where(eq(heartbeatConfig.id, config.id));
      }

      // Check if interval changed and restart timer
      if (config?.intervalMinutes) {
        const newIntervalMs = config.intervalMinutes * 60 * 1000;
        if (newIntervalMs !== this.currentIntervalMs) {
          this.currentIntervalMs = newIntervalMs;
          this.stop();
          this.timer = setInterval(() => this.tick(), this.currentIntervalMs);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.broadcast({
        name: "agent-activity",
        data: {
          sessionKey: "heartbeat",
          action: "error",
          detail: `Heartbeat failed: ${message}`,
        },
      });
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
```

**Step 2: Register heartbeat-research TaskConfig in orchestrator**

In `packages/gateway/src/index.ts`, after registering TASK_CONFIGS and the heartbeat agent (~line 146), register the dynamic heartbeat-research config:

```ts
  orchestrator.registerConfig({
    name: "heartbeat-research",
    systemPrompt: "", // placeholder — HeartbeatScheduler overrides via dispatch input
    tools: ["search", "scrape", "browse", "parsePdf", "createVendor", "cmd", "dbQuery", "dbSchema", "sendWhatsApp"],
    maxSteps: 15,
  });
```

Wait — the orchestrator dispatches by looking up the config by name and uses its `systemPrompt`. But we want the prompt to come from the DB at dispatch time. Let me check how the orchestrator passes input to AgentRunner...

Looking at `orchestrator.ts` lines 172-176: the `input` is cast to `{ messages?: ModelMessage[] }` and messages are extracted. The `taskConfig.systemPrompt` is used as the system prompt in `runner.ts` line 47. So the static `systemPrompt` in the registered config would be used, not the one from the DB.

**Better approach:** Instead of registering a static config, have the HeartbeatScheduler construct a `TaskConfig` dynamically and register it before each dispatch. Or better yet, register once with a placeholder and update it before dispatch.

Actually, the simplest approach: register the config once at startup, and have the scheduler update the config's `systemPrompt` field before dispatching. But `TaskConfig` is a plain object in the map, so mutating it is fine:

In `packages/gateway/src/index.ts`, after the orchestrator is created:

```ts
  // Register heartbeat-research config (prompt will be set dynamically by scheduler)
  const heartbeatResearchConfig = {
    name: "heartbeat-research",
    systemPrompt: "",
    tools: ["search", "scrape", "browse", "parsePdf", "createVendor", "cmd", "dbQuery", "dbSchema", "sendWhatsApp"],
    maxSteps: 15,
  };
  orchestrator.registerConfig(heartbeatResearchConfig);
```

Then in the scheduler, before dispatching, update the system prompt:

Actually, re-reading the orchestrator code more carefully — `orchestrator.dispatch()` gets the config from the map, then passes it to `execute()` which passes it to `AgentRunner.run()`. If we mutate the object's `systemPrompt` before calling dispatch, it'll use the new value. But that's a race condition if two dispatches happen close together.

**Cleanest approach:** Add a method to Orchestrator to re-register a config, or just have the scheduler call `registerConfig()` again before dispatch (it's a Map.set, so it overwrites). Let's do that.

In the scheduler's `tick()`, before dispatching:

```ts
this.orchestrator.registerConfig({
  name: "heartbeat-research",
  systemPrompt: config.prompt,
  tools: ["search", "scrape", "browse", "parsePdf", "createVendor", "cmd", "dbQuery", "dbSchema", "sendWhatsApp"],
  maxSteps: 15,
});
```

This is clean and avoids mutation races. The scheduler already has access to the orchestrator. No changes to the Orchestrator class needed.

Let me update the scheduler code above to include this. Here's the revised `tick()` Phase 2:

```ts
      if (config?.enabled && config.prompt) {
        // Register/update the heartbeat-research config with user's prompt
        this.orchestrator.registerConfig({
          name: "heartbeat-research",
          systemPrompt: config.prompt,
          tools: ["search", "scrape", "browse", "parsePdf", "createVendor", "cmd", "dbQuery", "dbSchema", "sendWhatsApp"],
          maxSteps: 15,
        });

        this.broadcast({
          name: "agent-activity",
          data: {
            sessionKey: "heartbeat-research",
            action: "starting",
            detail: "Running scheduled research...",
          },
        });

        await this.orchestrator.dispatch(
          "heartbeat-research",
          { messages: [{ role: "user" as const, content: config.prompt }] },
          { lane: "heartbeat" },
        );

        await this.db
          .update(heartbeatConfig)
          .set({ lastRunAt: sql`datetime('now')` })
          .where(eq(heartbeatConfig.id, config.id));
      }
```

**Step 3: Update index.ts to pass DB to HeartbeatScheduler**

In `packages/gateway/src/index.ts`, update the HeartbeatScheduler instantiation (~line 196-199):

Replace:
```ts
  const heartbeat = new HeartbeatScheduler(
    orchestrator,
    (event) => wsServer.broadcast(event),
  );
```

With:
```ts
  const heartbeat = new HeartbeatScheduler(
    orchestrator,
    (event) => wsServer.broadcast(event),
    db,
  );
```

**Step 4: Run tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/gateway/src/infra/heartbeat-scheduler.ts packages/gateway/src/index.ts
git commit -m "feat: heartbeat scheduler reads config from DB and dispatches LLM research"
```

---

### Task 4: Write tests for HeartbeatScheduler config-driven behavior

**Files:**
- Create: `packages/gateway/tests/infra/heartbeat-scheduler.test.ts`

**Step 1: Write the test file**

Create `packages/gateway/tests/infra/heartbeat-scheduler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { HeartbeatScheduler } from "../../src/infra/heartbeat-scheduler.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

function createMockOrchestrator() {
  return {
    dispatch: vi.fn().mockResolvedValue({ taskId: "t1", sessionKey: "s1" }),
    registerConfig: vi.fn(),
  };
}

describe("HeartbeatScheduler", () => {
  let db: ReturnType<typeof drizzle>;
  let orchestrator: ReturnType<typeof createMockOrchestrator>;
  let broadcast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
    orchestrator = createMockOrchestrator();
    broadcast = vi.fn();
  });

  it("dispatches only health checks when heartbeat is disabled", async () => {
    const scheduler = new HeartbeatScheduler(
      orchestrator as any,
      broadcast,
      db,
    );

    // tick() is private — call start() which runs tick() immediately
    // Then immediately stop to prevent interval from firing
    scheduler.start();
    scheduler.stop();

    // Wait for async tick to complete
    await new Promise((r) => setTimeout(r, 50));

    // Should have dispatched heartbeat health checks
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      "heartbeat",
      {},
      { lane: "heartbeat" },
    );

    // Should NOT have dispatched heartbeat-research
    expect(orchestrator.dispatch).not.toHaveBeenCalledWith(
      "heartbeat-research",
      expect.anything(),
      expect.anything(),
    );
  });

  it("dispatches LLM research when enabled with a prompt", async () => {
    // Insert heartbeat config
    await db.insert(schema.heartbeatConfig).values({
      enabled: 1,
      prompt: "Find florists in Tuscany",
      intervalMinutes: 30,
    });

    const scheduler = new HeartbeatScheduler(
      orchestrator as any,
      broadcast,
      db,
    );

    scheduler.start();
    scheduler.stop();
    await new Promise((r) => setTimeout(r, 50));

    // Should have dispatched both
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      "heartbeat",
      {},
      { lane: "heartbeat" },
    );

    expect(orchestrator.registerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "heartbeat-research",
        systemPrompt: "Find florists in Tuscany",
      }),
    );

    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      "heartbeat-research",
      { messages: [{ role: "user", content: "Find florists in Tuscany" }] },
      { lane: "heartbeat" },
    );
  });

  it("does not dispatch LLM research when enabled but no prompt", async () => {
    await db.insert(schema.heartbeatConfig).values({
      enabled: 1,
      prompt: null,
      intervalMinutes: 30,
    });

    const scheduler = new HeartbeatScheduler(
      orchestrator as any,
      broadcast,
      db,
    );

    scheduler.start();
    scheduler.stop();
    await new Promise((r) => setTimeout(r, 50));

    expect(orchestrator.dispatch).toHaveBeenCalledTimes(1);
    expect(orchestrator.dispatch).toHaveBeenCalledWith(
      "heartbeat",
      {},
      { lane: "heartbeat" },
    );
  });

  it("updates last_run_at after successful LLM dispatch", async () => {
    await db.insert(schema.heartbeatConfig).values({
      enabled: 1,
      prompt: "Research DJs",
      intervalMinutes: 15,
    });

    const scheduler = new HeartbeatScheduler(
      orchestrator as any,
      broadcast,
      db,
    );

    scheduler.start();
    scheduler.stop();
    await new Promise((r) => setTimeout(r, 50));

    const [config] = await db.select().from(schema.heartbeatConfig).limit(1);
    expect(config?.lastRunAt).toBeTruthy();
  });
});
```

**Step 2: Run the new tests**

Run: `cd packages/gateway && npx vitest run tests/infra/heartbeat-scheduler.test.ts`
Expected: All 4 tests pass

**Step 3: Commit**

```bash
git add packages/gateway/tests/infra/heartbeat-scheduler.test.ts
git commit -m "test: add HeartbeatScheduler config-driven behavior tests"
```

---

### Task 5: Add "While You Were Gone" dashboard handler

**Files:**
- Modify: `packages/gateway/src/handlers/dashboard.ts`

**Step 1: Add the handler**

In `packages/gateway/src/handlers/dashboard.ts`, add a new handler inside `registerDashboardHandlers()` (after the `dashboard.stats` handler, before the closing `}`):

Add `heartbeatConfig` to the imports at the top:

```ts
import {
  vendors,
  categories,
  budgetEntries,
  communications,
  agentTasks,
  weddingConfig,
  heartbeatConfig,
} from "../db/schema.js";
```

Add the new handler:

```ts
  router.register("dashboard.heartbeat-activity", async (db: Db, params: unknown) => {
    const { since } = (params as { since?: string } | undefined) ?? {};

    // Default to last 24 hours if no timestamp provided
    const sinceDate = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get heartbeat-research tasks since the given time
    const tasks = await db
      .select()
      .from(agentTasks)
      .where(sql`${agentTasks.type} = 'heartbeat-research' AND ${agentTasks.completedAt} > ${sinceDate}`)
      .orderBy(sql`${agentTasks.completedAt} desc`);

    // Get vendors created since the given time
    const newVendors = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        categoryName: categories.name,
        status: vendors.status,
        createdAt: vendors.createdAt,
      })
      .from(vendors)
      .leftJoin(categories, sql`${vendors.categoryId} = ${categories.id}`)
      .where(sql`${vendors.createdAt} > ${sinceDate}`)
      .orderBy(sql`${vendors.createdAt} desc`);

    // Get draft communications (awaiting review)
    const drafts = await db
      .select({
        id: communications.id,
        vendorId: communications.vendorId,
        vendorName: vendors.name,
        channel: communications.channel,
        subject: communications.subject,
        bodyOriginal: communications.bodyOriginal,
        status: communications.status,
      })
      .from(communications)
      .leftJoin(vendors, sql`${communications.vendorId} = ${vendors.id}`)
      .where(sql`${communications.direction} = 'out' AND ${communications.status} = 'draft'`)
      .orderBy(sql`${communications.id} desc`);

    // Get sent communications since the given time
    const sent = await db
      .select({
        id: communications.id,
        vendorId: communications.vendorId,
        vendorName: vendors.name,
        channel: communications.channel,
        subject: communications.subject,
        sentAt: communications.sentAt,
      })
      .from(communications)
      .leftJoin(vendors, sql`${communications.vendorId} = ${vendors.id}`)
      .where(sql`${communications.direction} = 'out' AND ${communications.status} = 'sent' AND ${communications.sentAt} > ${sinceDate}`)
      .orderBy(sql`${communications.sentAt} desc`);

    // Get heartbeat config for display
    const [config] = await db.select().from(heartbeatConfig).limit(1);

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        status: t.status,
        summary: t.output ? JSON.parse(t.output).summary ?? null : null,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      newVendors,
      drafts,
      sent,
      heartbeatEnabled: !!config?.enabled,
      lastRunAt: config?.lastRunAt ?? null,
    };
  });
```

**Step 2: Run tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/gateway/src/handlers/dashboard.ts
git commit -m "feat: add dashboard.heartbeat-activity handler"
```

---

### Task 6: Add HeartbeatSettings UI component

**Files:**
- Create: `packages/app/src/renderer/components/settings/HeartbeatSettings.tsx`
- Modify: `packages/app/src/renderer/components/settings/SettingsView.tsx`

**Step 1: Create HeartbeatSettings component**

Create `packages/app/src/renderer/components/settings/HeartbeatSettings.tsx`:

```tsx
import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface HeartbeatConfig {
  enabled: number;
  prompt: string | null;
  intervalMinutes: number;
  lastRunAt: string | null;
}

const INTERVAL_OPTIONS = [
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
];

export function HeartbeatSettings() {
  const [config, setConfig] = useState<HeartbeatConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wsClient
      .request<HeartbeatConfig>("heartbeat-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setEnabled(!!cfg.enabled);
        setPrompt(cfg.prompt ?? "");
        setIntervalMinutes(cfg.intervalMinutes);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await wsClient.request<HeartbeatConfig>(
        "heartbeat-config.update",
        { enabled, prompt: prompt || null, intervalMinutes },
      );
      setConfig(updated);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;

  const dirty =
    enabled !== !!config.enabled ||
    (prompt || null) !== config.prompt ||
    intervalMinutes !== config.intervalMinutes;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Scheduled Research</h2>
      <div className="space-y-4">
        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded accent-indigo-500"
          />
          <div>
            <p className="text-sm font-medium text-white">
              Enable scheduled research
            </p>
            <p className="text-xs text-gray-400">
              An AI agent will automatically run on a timer to research vendors
            </p>
          </div>
        </label>

        {/* Prompt */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-400">Research prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Find florists in Tuscany under €3,000. Check for availability on our wedding date."
            rows={4}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-y"
          />
        </div>

        {/* Interval */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-400">Run frequency</label>
          <select
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Last run info */}
        {config.lastRunAt && (
          <p className="text-xs text-gray-500">
            Last run: {new Date(config.lastRunAt).toLocaleString()}
          </p>
        )}

        {/* Save button */}
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add to SettingsView**

In `packages/app/src/renderer/components/settings/SettingsView.tsx`:

Add import:
```ts
import { HeartbeatSettings } from "./HeartbeatSettings";
```

Add after the `<SearchConfig />` section and its `<hr />` (after line 16):
```tsx
      <HeartbeatSettings />
      <hr className="border-white/10" />
```

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/settings/HeartbeatSettings.tsx packages/app/src/renderer/components/settings/SettingsView.tsx
git commit -m "feat: add HeartbeatSettings UI component in settings"
```

---

### Task 7: Add "While You Were Gone" dashboard section

**Files:**
- Create: `packages/app/src/renderer/components/dashboard/WhileYouWereGone.tsx`
- Modify: `packages/app/src/renderer/components/dashboard/DashboardView.tsx`

**Step 1: Create WhileYouWereGone component**

Create `packages/app/src/renderer/components/dashboard/WhileYouWereGone.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { Card, CardContent } from "../common/Card";
import { Badge } from "../common/Badge";
import {
  Bot,
  UserPlus,
  MessageSquare,
  Send,
  Check,
  X,
  Pencil,
} from "lucide-react";

interface HeartbeatActivity {
  tasks: Array<{
    id: number;
    status: string;
    summary: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  newVendors: Array<{
    id: number;
    name: string;
    categoryName: string | null;
    status: string;
    createdAt: string;
  }>;
  drafts: Array<{
    id: number;
    vendorId: number;
    vendorName: string | null;
    channel: string;
    subject: string | null;
    bodyOriginal: string;
    status: string;
  }>;
  sent: Array<{
    id: number;
    vendorId: number;
    vendorName: string | null;
    channel: string;
    subject: string | null;
    sentAt: string | null;
  }>;
  heartbeatEnabled: boolean;
  lastRunAt: string | null;
}

export function WhileYouWereGone() {
  const navigate = useNavigate();
  const { data, refetch } = useRequest<HeartbeatActivity>("dashboard.heartbeat-activity");
  const { mutate: approve } = useMutation<{ id: number }, unknown>("communications.approve");
  const { mutate: reject } = useMutation<{ id: number }, unknown>("communications.reject");

  if (!data) return null;

  const hasActivity =
    data.tasks.length > 0 ||
    data.newVendors.length > 0 ||
    data.drafts.length > 0 ||
    data.sent.length > 0;

  if (!hasActivity) return null;

  async function handleApprove(id: number) {
    await approve({ id });
    refetch();
  }

  async function handleReject(id: number) {
    await reject({ id });
    refetch();
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Bot className="h-5 w-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">While You Were Gone</h2>
        {data.lastRunAt && (
          <span className="text-xs text-gray-500 ml-auto">
            Last run: {new Date(data.lastRunAt).toLocaleString()}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* Research summaries */}
        {data.tasks.length > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Research completed
              </p>
              <div className="space-y-2">
                {data.tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-2">
                    <Badge
                      variant={task.status === "completed" ? "success" : "danger"}
                    >
                      {task.status}
                    </Badge>
                    <p className="text-sm text-gray-300 flex-1">
                      {task.summary ?? "No summary available"}
                    </p>
                    <span className="text-xs text-gray-500 shrink-0">
                      {task.completedAt
                        ? new Date(task.completedAt).toLocaleTimeString()
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* New vendors */}
        {data.newVendors.length > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Vendors found
              </p>
              <div className="space-y-1">
                {data.newVendors.map((vendor) => (
                  <button
                    key={vendor.id}
                    onClick={() => navigate(`/vendors/${vendor.id}`)}
                    className="flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
                  >
                    <UserPlus className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-gray-200 truncate">
                      {vendor.name}
                    </span>
                    {vendor.categoryName && (
                      <Badge variant="default">{vendor.categoryName}</Badge>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Draft messages awaiting review */}
        {data.drafts.length > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Drafts awaiting review
              </p>
              <div className="space-y-3 divide-y divide-white/5">
                {data.drafts.map((draft) => (
                  <div key={draft.id} className="pt-2 first:pt-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-4 w-4 text-purple-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-200">
                        {draft.vendorName ?? `Vendor #${draft.vendorId}`}
                      </span>
                      <Badge variant="info">{draft.channel}</Badge>
                    </div>
                    {draft.subject && (
                      <p className="text-xs text-gray-400 mb-1 ml-6">
                        {draft.subject}
                      </p>
                    )}
                    <p className="text-sm text-gray-400 ml-6 line-clamp-2">
                      {draft.bodyOriginal}
                    </p>
                    <div className="flex gap-2 ml-6 mt-2">
                      <button
                        onClick={() => handleApprove(draft.id)}
                        className="flex items-center gap-1 rounded-md bg-green-600/20 px-2.5 py-1 text-xs font-medium text-green-400 hover:bg-green-600/30 transition-colors"
                      >
                        <Check className="h-3 w-3" />
                        Send
                      </button>
                      <button
                        onClick={() => navigate(`/inbox`)}
                        className="flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-400 hover:bg-white/10 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleReject(draft.id)}
                        className="flex items-center gap-1 rounded-md bg-red-600/20 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-600/30 transition-colors"
                      >
                        <X className="h-3 w-3" />
                        Discard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sent messages */}
        {data.sent.length > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Messages sent
              </p>
              <div className="space-y-1">
                {data.sent.map((msg) => (
                  <div key={msg.id} className="flex items-center gap-2 py-1">
                    <Send className="h-4 w-4 text-green-400 shrink-0" />
                    <span className="text-sm text-gray-300">
                      {msg.vendorName ?? `Vendor #${msg.vendorId}`}
                    </span>
                    <Badge variant="default">{msg.channel}</Badge>
                    <span className="text-xs text-gray-500 ml-auto">
                      {msg.sentAt
                        ? new Date(msg.sentAt).toLocaleTimeString()
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add WhileYouWereGone to DashboardView**

In `packages/app/src/renderer/components/dashboard/DashboardView.tsx`:

Add import at top:
```ts
import { WhileYouWereGone } from "./WhileYouWereGone";
```

Add the component after the quick research form and before the loading/stats section. Insert after line 102 (closing `</form>`):

```tsx
      <WhileYouWereGone />
```

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/dashboard/WhileYouWereGone.tsx packages/app/src/renderer/components/dashboard/DashboardView.tsx
git commit -m "feat: add While You Were Gone dashboard section"
```

---

### Task 8: Write test for heartbeat-config handlers

**Files:**
- Create: `packages/gateway/tests/handlers/heartbeat-config.test.ts`

**Step 1: Write the test**

Create `packages/gateway/tests/handlers/heartbeat-config.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerHeartbeatConfigHandlers } from "../../src/handlers/heartbeat-config.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe("heartbeat-config handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
    router = new Router();
    registerHeartbeatConfigHandlers(router);
  });

  it("returns defaults when no config exists", async () => {
    const result = await router.handle(db, "heartbeat-config.get", {});
    expect(result).toEqual({
      enabled: 0,
      prompt: null,
      intervalMinutes: 30,
      lastRunAt: null,
    });
  });

  it("creates config on first update", async () => {
    await router.handle(db, "heartbeat-config.update", {
      enabled: true,
      prompt: "Find caterers",
      intervalMinutes: 60,
    });

    const result = await router.handle(db, "heartbeat-config.get", {});
    expect(result).toMatchObject({
      enabled: 1,
      prompt: "Find caterers",
      intervalMinutes: 60,
    });
  });

  it("updates existing config", async () => {
    await router.handle(db, "heartbeat-config.update", {
      enabled: true,
      prompt: "Find florists",
    });

    await router.handle(db, "heartbeat-config.update", {
      prompt: "Find DJs instead",
    });

    const result = await router.handle(db, "heartbeat-config.get", {});
    expect(result).toMatchObject({
      enabled: 1,
      prompt: "Find DJs instead",
    });
  });

  it("can disable the heartbeat", async () => {
    await router.handle(db, "heartbeat-config.update", {
      enabled: true,
      prompt: "Research",
    });

    await router.handle(db, "heartbeat-config.update", {
      enabled: false,
    });

    const result = await router.handle(db, "heartbeat-config.get", {});
    expect(result).toMatchObject({ enabled: 0 });
  });
});
```

**Step 2: Verify Router.handle() signature**

The Router's `handle` method signature is `handle(db, method, params)` — db first, then method, then params. The tests above use this order.

**Step 3: Run tests**

Run: `cd packages/gateway && npx vitest run tests/handlers/heartbeat-config.test.ts`
Expected: All 4 tests pass

**Step 4: Commit**

```bash
git add packages/gateway/tests/handlers/heartbeat-config.test.ts
git commit -m "test: add heartbeat-config handler tests"
```

---

### Task 9: Run full test suite and verify

**Step 1: Run all gateway tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass (previous tests + new tests)

**Step 2: Build the app to verify no TS errors**

Run: `cd packages/app && npx electron-vite build`
Expected: Build succeeds

**Step 3: If any test or build failures, fix them**

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address test/build issues from heartbeat feature"
```
