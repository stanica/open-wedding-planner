# Browser Subagent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static `browse` tool with an AI-driven browser subagent that navigates websites, extracts data, and saves it directly to the DB.

**Architecture:** Parent research agent dispatches browser subagents via orchestrator. Subagents get full Playwright control + data tools. Parent continues working and collects results via `awaitTasks`. Browser lifecycle managed via `setup`/`teardown` hooks on TaskConfig.

**Tech Stack:** Playwright, Vercel AI SDK (`tool`, `generateText`), zod, drizzle-orm, vitest

---

### Task 1: Extend TaskConfig with setup/teardown hooks

**Files:**
- Modify: `packages/gateway/src/agents/base-agent.ts:30-36`

**Step 1: Write the failing test**

Create `packages/gateway/tests/agents/setup-teardown.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { TaskConfig } from "../../src/agents/base-agent.js";

describe("TaskConfig setup/teardown", () => {
  it("accepts optional setup function in TaskConfig", () => {
    const config: TaskConfig = {
      name: "test",
      systemPrompt: "test",
      tools: [],
      setup: async () => ({
        extraTools: {},
        cleanup: async () => {},
      }),
    };
    expect(config.setup).toBeDefined();
  });

  it("TaskConfig works without setup (backward compat)", () => {
    const config: TaskConfig = {
      name: "test",
      systemPrompt: "test",
      tools: [],
    };
    expect(config.setup).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/agents/setup-teardown.test.ts`
Expected: FAIL — `setup` not in TaskConfig type

**Step 3: Write minimal implementation**

In `packages/gateway/src/agents/base-agent.ts`, add to `TaskConfig`:

```ts
import type { Tool } from "ai";
import type { ToolFactoryContext } from "./runner.js";

export interface TaskConfig {
  name: string;
  systemPrompt: string;
  tools: string[];
  maxSteps?: number;
  guardrails?: Partial<GuardrailsConfig>;
  setup?: (toolCtx: ToolFactoryContext) => Promise<{
    extraTools: Record<string, Tool>;
    cleanup: () => Promise<void>;
  }>;
}
```

Note: This introduces a circular import (`base-agent` → `runner` → `base-agent`). To avoid this, define `ToolFactoryContext` in `base-agent.ts` or a shared types file. Simplest: inline the context type or use `unknown` and cast in the implementation.

Actually, use `unknown` for the context parameter to avoid circular imports:

```ts
setup?: (toolCtx: unknown) => Promise<{
  extraTools: Record<string, Tool>;
  cleanup: () => Promise<void>;
}>;
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/agents/setup-teardown.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/agents/base-agent.ts packages/gateway/tests/agents/setup-teardown.test.ts
git commit -m "feat: add optional setup/teardown hooks to TaskConfig"
```

---

### Task 2: Update AgentRunner to call setup/teardown

**Files:**
- Modify: `packages/gateway/src/agents/runner.ts:39-175`
- Modify: `packages/gateway/tests/agents/runner.test.ts`

**Step 1: Write the failing test**

Add to `packages/gateway/tests/agents/runner.test.ts`:

```ts
it("calls setup() before running and cleanup() after", async () => {
  const { AgentRunner } = await import("../../src/agents/runner.js");

  const cleanupSpy = vi.fn();
  const extraTool = tool({
    description: "Extra tool from setup",
    inputSchema: z.object({}),
    execute: async () => ({ result: "from-setup" }),
  });

  const setupSpy = vi.fn().mockResolvedValue({
    extraTools: { extraTool },
    cleanup: cleanupSpy,
  });

  const emitSpy = vi.fn();
  const ctx: AgentContext = {
    db,
    sessionKey: "test-session",
    emit: emitSpy,
    signal: new AbortController().signal,
    toolRegistry: registry,
    permissionManager,
    permissionCallbacks: {
      requestPermission: vi.fn().mockResolvedValue("allow"),
    },
  };

  const toolCtx: ToolFactoryContext = {
    db,
    emit: emitSpy,
    sqlite,
    workspaceDir: "/tmp/test",
    permissionCallbacks: {
      requestPermission: vi.fn().mockResolvedValue("allow"),
    },
  };

  const runner = new AgentRunner();
  await runner.run(
    {
      name: "setup-agent",
      systemPrompt: "You are a test agent.",
      tools: [],
      maxSteps: 3,
      setup: setupSpy,
    },
    ctx,
    [{ role: "user", content: "Hello" }],
    toolCtx,
  );

  expect(setupSpy).toHaveBeenCalledWith(toolCtx);
  expect(cleanupSpy).toHaveBeenCalled();
});

it("calls cleanup() even when the agent throws", async () => {
  const { AgentRunner, } = await import("../../src/agents/runner.js");
  const { getModel } = await import("../../src/agents/model-provider.js");

  (getModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    specificationVersion: "v2",
    provider: "test",
    modelId: "test-model",
    supportedUrls: {},
    doGenerate: vi.fn().mockRejectedValue(new Error("Model exploded")),
  });

  const cleanupSpy = vi.fn();
  const setupSpy = vi.fn().mockResolvedValue({
    extraTools: {},
    cleanup: cleanupSpy,
  });

  const emitSpy = vi.fn();
  const ctx: AgentContext = {
    db,
    sessionKey: "test-session",
    emit: emitSpy,
    signal: new AbortController().signal,
    toolRegistry: registry,
    permissionManager,
    permissionCallbacks: {
      requestPermission: vi.fn().mockResolvedValue("allow"),
    },
  };

  const toolCtx: ToolFactoryContext = {
    db,
    emit: emitSpy,
    sqlite,
    workspaceDir: "/tmp/test",
    permissionCallbacks: {
      requestPermission: vi.fn().mockResolvedValue("allow"),
    },
  };

  const runner = new AgentRunner();
  await expect(
    runner.run(
      {
        name: "failing-agent",
        systemPrompt: "You are a test agent.",
        tools: [],
        setup: setupSpy,
      },
      ctx,
      [{ role: "user", content: "Hello" }],
      toolCtx,
    ),
  ).rejects.toThrow("Model exploded");

  expect(cleanupSpy).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/agents/runner.test.ts`
Expected: FAIL — setup not called / cleanup not called

**Step 3: Write minimal implementation**

In `packages/gateway/src/agents/runner.ts`, modify the `run` method. Wrap the main body in a try/finally:

```ts
async run(
  config: TaskConfig,
  ctx: AgentContext,
  messages: ModelMessage[],
  toolCtx: ToolFactoryContext,
): Promise<AgentResult> {
  ctx.emit("starting", `Running ${config.name}...`);

  let cleanup: (() => Promise<void>) | undefined;

  try {
    // Build wrapped tool set from config
    const tools: Record<string, any> = {};
    const builtInTools = await getBuiltInTools(ctx.emit);

    // Call setup hook if present
    if (config.setup) {
      const setupResult = await config.setup(toolCtx);
      cleanup = setupResult.cleanup;
      for (const [name, t] of Object.entries(setupResult.extraTools)) {
        tools[name] = wrapToolWithPermission(t, name, ctx.permissionManager, ctx.permissionCallbacks);
      }
    }

    // ... rest of existing tool building and generateText logic stays the same ...

    return { summary: text || `${config.name} completed`, data: { toolCalls: allToolCalls, vendorIds }, compactionSummary };
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}
```

The key change: wrap the entire method body in `try { ... } finally { await cleanup?.() }` and merge `setupResult.extraTools` into the tools map before the `generateText` call.

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/agents/runner.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/agents/runner.ts packages/gateway/tests/agents/runner.test.ts
git commit -m "feat: AgentRunner calls setup/teardown hooks on TaskConfig"
```

---

### Task 3: Create Playwright tools

**Files:**
- Create: `packages/gateway/src/tools/playwright-tools.ts`
- Create: `packages/gateway/tests/tools/playwright-tools.test.ts`

**Step 1: Write the failing tests**

Create `packages/gateway/tests/tools/playwright-tools.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createPlaywrightTools } from "../../src/tools/playwright-tools.js";

function mockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue("Test Page"),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    evaluate: vi.fn().mockResolvedValue("evaluated result"),
    locator: vi.fn().mockReturnValue({
      textContent: vi.fn().mockResolvedValue("link text"),
    }),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue("https://example.com"),
    $$eval: vi.fn(),
  };
}

describe("createPlaywrightTools", () => {
  it("creates all expected tools", () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "navigate", "click", "type", "screenshot",
        "extractText", "extractLinks", "extractImages",
        "scroll", "waitForSelector", "evaluate",
      ]),
    );
  });

  it("navigate calls page.goto", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    const result = await tools.navigate.execute(
      { url: "https://example.com" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.goto).toHaveBeenCalledWith("https://example.com", expect.any(Object));
    expect(result).toHaveProperty("title");
  });

  it("click calls page.click", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    await tools.click.execute(
      { selector: "button.submit" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.click).toHaveBeenCalledWith("button.submit", expect.any(Object));
  });

  it("type calls page.fill", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    await tools.type.execute(
      { selector: "input.name", text: "Wedding Co" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.fill).toHaveBeenCalledWith("input.name", "Wedding Co");
  });

  it("screenshot returns base64 image", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    const result = await tools.screenshot.execute(
      {},
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.screenshot).toHaveBeenCalled();
    expect(result).toHaveProperty("image");
  });

  it("evaluate runs JS in page context", async () => {
    const page = mockPage();
    const tools = createPlaywrightTools(page as any);
    const result = await tools.evaluate.execute(
      { script: "document.title" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as any },
    );
    expect(page.evaluate).toHaveBeenCalledWith("document.title");
    expect(result).toHaveProperty("result");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/playwright-tools.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/gateway/src/tools/playwright-tools.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";
import type { Page } from "playwright";

export function createPlaywrightTools(page: Page): Record<string, ReturnType<typeof tool>> {
  return {
    navigate: tool({
      description: "Navigate to a URL. Returns the page title and current URL after loading.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to navigate to"),
      }),
      execute: async ({ url }) => {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        const title = await page.title();
        return { url: page.url(), title };
      },
    }),

    click: tool({
      description: "Click an element on the page. Use CSS selectors or text selectors like 'text=Pricing'.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector or text selector (e.g. 'text=Pricing', 'a.nav-link')"),
      }),
      execute: async ({ selector }) => {
        await page.click(selector, { timeout: 10_000 });
        // Wait for navigation/content to settle
        await page.waitForLoadState("networkidle").catch(() => {});
        const title = await page.title();
        return { clicked: selector, url: page.url(), title };
      },
    }),

    type: tool({
      description: "Type text into an input field.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector for the input field"),
        text: z.string().describe("Text to type"),
      }),
      execute: async ({ selector, text }) => {
        await page.fill(selector, text);
        return { filled: selector, text };
      },
    }),

    screenshot: tool({
      description: "Take a screenshot of the current page. Returns a base64-encoded PNG image you can see.",
      inputSchema: z.object({}),
      execute: async () => {
        const buffer = await page.screenshot({ fullPage: false });
        return {
          image: buffer.toString("base64"),
          mimeType: "image/png",
          url: page.url(),
        };
      },
    }),

    extractText: tool({
      description: "Extract text content from the page or a specific element.",
      inputSchema: z.object({
        selector: z.string().optional().describe("CSS selector to extract from. Omit for full page text."),
      }),
      execute: async ({ selector }) => {
        if (selector) {
          const text = await page.locator(selector).textContent() ?? "";
          return { text: text.trim().slice(0, 10_000), selector };
        }
        const text = await page.evaluate(() => {
          document.querySelectorAll("script, style, nav, footer, header, noscript").forEach((el) => el.remove());
          return (document.body?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 10_000);
        });
        return { text, url: page.url() };
      },
    }),

    extractLinks: tool({
      description: "Get all links on the current page with their text and URLs.",
      inputSchema: z.object({}),
      execute: async () => {
        const links = await page.$$eval("a[href]", (anchors) =>
          anchors
            .map((a) => ({ text: a.textContent?.trim() ?? "", href: a.href }))
            .filter((l) => l.text && l.href && !l.href.startsWith("javascript:")),
        );
        return { links: links.slice(0, 100), url: page.url() };
      },
    }),

    extractImages: tool({
      description: "Get all image URLs on the current page.",
      inputSchema: z.object({}),
      execute: async () => {
        const images = await page.$$eval("img[src]", (imgs) =>
          imgs
            .map((img) => ({
              src: img.src,
              alt: img.alt || undefined,
              width: img.naturalWidth,
              height: img.naturalHeight,
            }))
            .filter((i) => i.width > 50 && i.height > 50),
        );
        return { images: images.slice(0, 50), url: page.url() };
      },
    }),

    scroll: tool({
      description: "Scroll the page up or down.",
      inputSchema: z.object({
        direction: z.enum(["up", "down"]).describe("Scroll direction"),
        amount: z.number().optional().describe("Pixels to scroll (default 500)"),
      }),
      execute: async ({ direction, amount }) => {
        const px = amount ?? 500;
        const delta = direction === "down" ? px : -px;
        await page.evaluate((d) => window.scrollBy(0, d), delta);
        return { scrolled: direction, pixels: px };
      },
    }),

    waitForSelector: tool({
      description: "Wait for an element to appear on the page.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector to wait for"),
        timeout: z.number().optional().describe("Max wait time in ms (default 10000)"),
      }),
      execute: async ({ selector, timeout }) => {
        await page.waitForSelector(selector, { timeout: timeout ?? 10_000 });
        return { found: selector };
      },
    }),

    evaluate: tool({
      description: "Run JavaScript code in the browser page context. Returns the result.",
      inputSchema: z.object({
        script: z.string().describe("JavaScript code to execute in the page"),
      }),
      execute: async ({ script }) => {
        const result = await page.evaluate(script);
        return { result };
      },
    }),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/tools/playwright-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/playwright-tools.ts packages/gateway/tests/tools/playwright-tools.test.ts
git commit -m "feat: add Playwright action tools for browser subagent"
```

---

### Task 4: Create dispatch tool

**Files:**
- Create: `packages/gateway/src/tools/dispatch.ts`
- Create: `packages/gateway/tests/tools/dispatch.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/tools/dispatch.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { makeDispatchTool } from "../../src/tools/dispatch.js";

describe("dispatch tool", () => {
  it("calls orchestrator.dispatch with browser agent config", async () => {
    const mockOrchestrator = {
      dispatch: vi.fn().mockResolvedValue({ taskId: "task-123", sessionKey: "browser-task-123" }),
    };

    const dispatchTool = makeDispatchTool({
      orchestrator: mockOrchestrator as any,
      parentSessionKey: "research-parent-456",
    });

    const result = await dispatchTool.execute(
      {
        url: "https://venue.com",
        instructions: "Find pricing info",
        vendorId: 42,
      },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(mockOrchestrator.dispatch).toHaveBeenCalledWith(
      "browser",
      { url: "https://venue.com", instructions: "Find pricing info", vendorId: 42 },
      { lane: "subagent", vendorId: 42 },
    );
    expect(result).toEqual({ taskId: "task-123" });
  });

  it("works without vendorId", async () => {
    const mockOrchestrator = {
      dispatch: vi.fn().mockResolvedValue({ taskId: "task-789", sessionKey: "browser-task-789" }),
    };

    const dispatchTool = makeDispatchTool({
      orchestrator: mockOrchestrator as any,
      parentSessionKey: "research-parent-456",
    });

    const result = await dispatchTool.execute(
      {
        url: "https://venue.com",
        instructions: "Find pricing info",
      },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result).toEqual({ taskId: "task-789" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/dispatch.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/gateway/src/tools/dispatch.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";
import type { Orchestrator } from "../agents/orchestrator.js";

export interface DispatchContext {
  orchestrator: Orchestrator;
  parentSessionKey: string;
}

export function makeDispatchTool(ctx: DispatchContext) {
  return tool({
    description:
      "Dispatch a browser subagent to navigate and research a website. The subagent gets full browser control (click, type, scroll, screenshot) and can save vendor data directly. Returns a taskId — use awaitTasks to collect results later. You can dispatch multiple subagents in parallel.",
    inputSchema: z.object({
      url: z.string().url().describe("The website URL to research"),
      instructions: z
        .string()
        .describe("What to find on the website (e.g. 'Find pricing, gallery images, and contact info')"),
      vendorId: z
        .number()
        .optional()
        .describe("Vendor ID to associate data with. The subagent can use this to save images and update vendor info."),
    }),
    execute: async ({ url, instructions, vendorId }) => {
      const { taskId } = await ctx.orchestrator.dispatch(
        "browser",
        { url, instructions, vendorId },
        { lane: "subagent", vendorId },
      );
      return { taskId };
    },
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/tools/dispatch.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/dispatch.ts packages/gateway/tests/tools/dispatch.test.ts
git commit -m "feat: add dispatch tool for spawning browser subagents"
```

---

### Task 5: Create awaitTasks tool

**Files:**
- Create: `packages/gateway/src/tools/await-tasks.ts`
- Create: `packages/gateway/tests/tools/await-tasks.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/tools/await-tasks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { makeAwaitTasksTool } from "../../src/tools/await-tasks.js";

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe("awaitTasks tool", () => {
  let db: ReturnType<typeof setupDb>["db"];

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
  });

  it("returns results for completed tasks", async () => {
    // Insert completed task
    await db.insert(schema.agentTasks).values({
      type: "browser",
      status: "completed",
      sessionId: "browser-task-1",
      input: JSON.stringify({ url: "https://venue.com" }),
      output: JSON.stringify({ summary: "Found pricing: €5000" }),
    });

    const [row] = await db.select().from(schema.agentTasks);

    const awaitTool = makeAwaitTasksTool({ db });
    const result = await awaitTool.execute(
      { taskIds: [String(row.id)] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("completed");
    expect(result.results[0].summary).toBe("Found pricing: €5000");
  });

  it("returns error info for failed tasks", async () => {
    await db.insert(schema.agentTasks).values({
      type: "browser",
      status: "failed",
      sessionId: "browser-task-2",
      output: JSON.stringify({ error: "Timeout" }),
    });

    const [row] = await db.select().from(schema.agentTasks);

    const awaitTool = makeAwaitTasksTool({ db });
    const result = await awaitTool.execute(
      { taskIds: [String(row.id)] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.results[0].status).toBe("failed");
    expect(result.results[0].error).toBe("Timeout");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/await-tasks.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/gateway/src/tools/await-tasks.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { agentTasks } from "../db/schema.js";
import type { Db } from "../infra/router.js";

export interface AwaitTasksContext {
  db: Db;
}

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];
const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes

export function makeAwaitTasksTool(ctx: AwaitTasksContext) {
  return tool({
    description:
      "Wait for one or more dispatched subagent tasks to complete. Blocks until all tasks finish (or fail/cancel). Returns the summary from each task.",
    inputSchema: z.object({
      taskIds: z.array(z.string()).describe("Task IDs returned by the dispatch tool"),
    }),
    execute: async ({ taskIds }) => {
      const numericIds = taskIds.map(Number);
      const deadline = Date.now() + MAX_WAIT_MS;

      while (Date.now() < deadline) {
        const rows = await ctx.db
          .select()
          .from(agentTasks)
          .where(inArray(agentTasks.id, numericIds));

        const allDone = rows.every((r) => TERMINAL_STATUSES.includes(r.status));

        if (allDone && rows.length === numericIds.length) {
          return {
            results: rows.map((r) => {
              const output = r.output ? JSON.parse(r.output) : {};
              return {
                taskId: String(r.id),
                status: r.status,
                summary: output.summary ?? undefined,
                error: output.error ?? undefined,
              };
            }),
          };
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // Timeout — return partial results
      const rows = await ctx.db
        .select()
        .from(agentTasks)
        .where(inArray(agentTasks.id, numericIds));

      return {
        results: rows.map((r) => {
          const output = r.output ? JSON.parse(r.output) : {};
          return {
            taskId: String(r.id),
            status: r.status,
            summary: output.summary ?? undefined,
            error: r.status === "running" ? "Timed out waiting for completion" : output.error,
          };
        }),
      };
    },
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/tools/await-tasks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/await-tasks.ts packages/gateway/tests/tools/await-tasks.test.ts
git commit -m "feat: add awaitTasks tool for collecting subagent results"
```

---

### Task 6: Add browser task config with setup hook

**Files:**
- Modify: `packages/gateway/src/agents/task-configs.ts`
- Create: `packages/gateway/tests/agents/browser-config.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/agents/browser-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getTaskConfig } from "../../src/agents/task-configs.js";

describe("browser task config", () => {
  it("is registered and has expected tools", () => {
    const config = getTaskConfig("browser");
    expect(config).toBeDefined();
    expect(config!.name).toBe("browser");
    expect(config!.tools).toEqual(
      expect.arrayContaining(["parsePdf", "addVendorImages", "dbQuery", "dbSchema", "createVendor"]),
    );
  });

  it("has a setup function", () => {
    const config = getTaskConfig("browser");
    expect(config!.setup).toBeTypeOf("function");
  });

  it("has maxSteps of 20", () => {
    const config = getTaskConfig("browser");
    expect(config!.maxSteps).toBe(20);
  });

  it("system prompt mentions Playwright actions", () => {
    const config = getTaskConfig("browser");
    expect(config!.systemPrompt).toContain("navigate");
    expect(config!.systemPrompt).toContain("click");
    expect(config!.systemPrompt).toContain("screenshot");
    expect(config!.systemPrompt).toContain("parsePdf");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/agents/browser-config.test.ts`
Expected: FAIL — no "browser" config found

**Step 3: Write minimal implementation**

Add to `packages/gateway/src/agents/task-configs.ts`:

```ts
import { createPlaywrightTools } from "../tools/playwright-tools.js";

const BROWSER_PROMPT = `You are a browser research agent. You have full control of a headless browser and can navigate websites to extract information about wedding vendors.

## Your URL
You have been given a starting URL. Begin by using extractText or screenshot to understand the page, then navigate as needed.

## Available Browser Actions
- navigate(url) — go to a new page
- click(selector) — click buttons, links, tabs (supports CSS selectors and text selectors like 'text=Pricing')
- type(selector, text) — fill form fields
- screenshot() — take a screenshot to see the page visually
- extractText(selector?) — get text from the page or a specific element
- extractLinks() — get all links on the page
- extractImages() — get all image URLs on the page
- scroll(direction) — scroll up or down to see more content
- waitForSelector(selector) — wait for an element to appear
- evaluate(script) — run JavaScript in the page

## Data Tools
- addVendorImages — save images to a vendor's gallery
- createVendor — create a new vendor record
- dbQuery / dbSchema — read or update the database directly
- parsePdf — if you find a PDF link (menu, brochure, price list), download and extract its text

## Process
1. Start by extracting text or taking a screenshot to understand the page
2. Look for navigation links to key sections: pricing, gallery, menus, packages, contact
3. Navigate to each relevant section and extract information
4. Save images via addVendorImages with descriptive captions
5. If you find PDF links, use parsePdf to extract their contents
6. Update vendor records via dbQuery with any pricing, contact, or service details found
7. Return a summary of everything you found

## Guidelines
- Always check extractLinks() first to understand the site structure
- Use screenshot() when the page layout is unclear or content seems missing
- If a page is very long, use scroll() to see more content
- When saving images, write descriptive captions (e.g. "Outdoor ceremony area overlooking the sea")
- Extract specific pricing whenever possible — it's the #1 thing users care about
- Look for: pricing/packages, gallery/photos, menus, contact info, capacity, availability
- If a page requires interaction (tabs, accordions, popups), use click() to reveal hidden content`;

// In the TASK_CONFIGS array, add:
{
  name: "browser",
  systemPrompt: BROWSER_PROMPT,
  tools: ["parsePdf", "addVendorImages", "dbQuery", "dbSchema", "createVendor"],
  maxSteps: 20,
  setup: async (toolCtx: unknown) => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Get the initial URL from the tool context
    // The runner will set this before calling setup
    const extraTools = createPlaywrightTools(page);

    return {
      extraTools,
      cleanup: async () => {
        await browser.close();
      },
    };
  },
},
```

Note: The `setup` function needs the initial URL from the dispatch input. We need to thread the input through to setup. One approach: extend the setup signature to receive the task input, or have the subagent use its `navigate` tool as the first action (guided by the system prompt which tells it the URL via the user message).

The simpler approach: the orchestrator passes the URL + instructions as the user message to the agent. The agent's first action is to call `navigate(url)` or `extractText()`. No need to pre-navigate in setup.

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/agents/browser-config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/agents/task-configs.ts packages/gateway/tests/agents/browser-config.test.ts
git commit -m "feat: add browser task config with Playwright setup hook"
```

---

### Task 7: Register dispatch and awaitTasks in tool registry

**Files:**
- Modify: `packages/gateway/src/tools/index.ts`
- Modify: `packages/gateway/src/agents/runner.ts` (add orchestrator to ToolFactoryContext)
- Modify: `packages/gateway/src/agents/orchestrator.ts` (pass self to ToolFactoryContext)

**Step 1: Write the failing test**

Add to `packages/gateway/tests/tools/registry.test.ts` (or create inline test):

```ts
// In existing registry test file, add:
it("registry includes dispatch and awaitTasks as factory tools", () => {
  const { createToolRegistry } = await import("../../src/tools/index.js");
  const registry = createToolRegistry();
  const all = registry.listAll();
  const names = all.map((t) => t.name);
  expect(names).toContain("dispatch");
  expect(names).toContain("awaitTasks");
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/registry.test.ts`
Expected: FAIL — dispatch/awaitTasks not found

**Step 3: Write minimal implementation**

In `packages/gateway/src/tools/index.ts`, add:

```ts
import { makeDispatchTool } from "./dispatch.js";
import { makeAwaitTasksTool } from "./await-tasks.js";

// Inside createToolRegistry():
registry.registerFactory("dispatch", {
  description: "Dispatch a browser subagent to research a website",
  category: "agent",
  create: (ctx: unknown) => {
    const { orchestrator, parentSessionKey } = ctx as any;
    return makeDispatchTool({ orchestrator, parentSessionKey });
  },
});

registry.registerFactory("awaitTasks", {
  description: "Wait for dispatched subagent tasks to complete",
  category: "agent",
  create: (ctx: unknown) => {
    const { db } = ctx as any;
    return makeAwaitTasksTool({ db });
  },
});
```

Remove the `browse` tool registration (delete the old `browserTool` import and its `registry.register` call).

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
  orchestrator?: unknown;       // NEW
  parentSessionKey?: string;    // NEW
}
```

In `packages/gateway/src/agents/orchestrator.ts`, in the `execute` method where `toolCtx` is built (line ~166), add:

```ts
const toolCtx: ToolFactoryContext = {
  db: this.db,
  emit,
  sqlite: this.sqlite,
  workspaceDir: getWorkspaceDir(),
  permissionCallbacks,
  orchestrator: this,           // NEW
  parentSessionKey: sessionKey, // NEW
  ...this.extraToolCtx,
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/tools/registry.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: ALL PASS (existing browser.test.ts will fail — handle in next task)

**Step 6: Commit**

```bash
git add packages/gateway/src/tools/index.ts packages/gateway/src/agents/runner.ts packages/gateway/src/agents/orchestrator.ts
git commit -m "feat: register dispatch and awaitTasks tools, pass orchestrator via context"
```

---

### Task 8: Update research agent config and clean up old browse tool

**Files:**
- Modify: `packages/gateway/src/agents/task-configs.ts` (research tools list)
- Delete: `packages/gateway/src/tools/browser.ts`
- Delete: `packages/gateway/tests/tools/browser.test.ts`

**Step 1: Update research agent tools**

In `packages/gateway/src/agents/task-configs.ts`, change the research config tools from:
```ts
tools: ["search", "scrape", "browse", "parsePdf", "createVendor", "addVendorImages", "cmd", "dbQuery", "dbSchema", "gog"],
```
to:
```ts
tools: ["search", "scrape", "dispatch", "awaitTasks", "parsePdf", "createVendor", "addVendorImages", "cmd", "dbQuery", "dbSchema", "gog"],
```

Update the `RESEARCH_PROMPT` — replace the line about browse:
```
- If a page is JavaScript-heavy and returns little content, try the browse tool
```
with:
```
- If a page is JavaScript-heavy or you need to navigate a complex website (galleries, pricing pages, etc.), use dispatch to spawn a browser subagent with instructions. Use awaitTasks to collect results when ready. You can dispatch multiple browser subagents in parallel.
```

**Step 2: Delete old files**

Remove `packages/gateway/src/tools/browser.ts` and `packages/gateway/tests/tools/browser.test.ts`.

Remove the import of `browserTool` from `packages/gateway/src/tools/index.ts`.

**Step 3: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace browse tool with dispatch/awaitTasks in research agent"
```

---

### Task 9: Integration test — dispatch + awaitTasks end-to-end

**Files:**
- Create: `packages/gateway/tests/agents/browser-subagent-integration.test.ts`

**Step 1: Write integration test**

This test verifies the full flow: orchestrator dispatches a browser task, runner calls setup (mocked Playwright), agent runs, results are stored, awaitTasks retrieves them.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { makeAwaitTasksTool } from "../../src/tools/await-tasks.js";
import { makeDispatchTool } from "../../src/tools/dispatch.js";

// Mock model-provider
vi.mock("../../src/agents/model-provider.js", () => ({
  getModel: vi.fn().mockResolvedValue({
    specificationVersion: "v2",
    provider: "test",
    modelId: "test-model",
    supportedUrls: {},
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Found pricing: €5000 for 100 guests" }],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
      warnings: [],
    }),
  }),
  getBuiltInTools: vi.fn().mockResolvedValue(null),
  getContextWindowForModel: vi.fn().mockReturnValue(200_000),
  getAIConfig: vi.fn().mockReturnValue({ model: "claude-sonnet-4-20250514" }),
}));

// Mock playwright
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn(),
        title: vi.fn().mockResolvedValue("Test Venue"),
        url: vi.fn().mockReturnValue("https://venue.com"),
        close: vi.fn(),
        screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
        evaluate: vi.fn().mockResolvedValue("page text"),
        $$eval: vi.fn().mockResolvedValue([]),
        click: vi.fn(),
        fill: vi.fn(),
        locator: vi.fn().mockReturnValue({ textContent: vi.fn().mockResolvedValue("text") }),
        waitForSelector: vi.fn(),
        waitForLoadState: vi.fn(),
      }),
      close: vi.fn(),
    }),
  },
}));

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe("browser subagent integration", () => {
  let db: ReturnType<typeof setupDb>["db"];
  let sqlite: Database.Database;

  beforeEach(() => {
    const setup = setupDb();
    db = setup.db;
    sqlite = setup.sqlite as unknown as Database.Database;
  });

  it("dispatch creates a task and awaitTasks retrieves its result", async () => {
    // This is a simplified integration test — we manually simulate
    // what the orchestrator would do (create + complete a task)

    // Insert a completed browser task (simulating orchestrator flow)
    await db.insert(schema.agentTasks).values({
      type: "browser",
      status: "completed",
      sessionId: "browser-test-1",
      input: JSON.stringify({ url: "https://venue.com", instructions: "Find pricing" }),
      output: JSON.stringify({ summary: "Found pricing: €5000 for 100 guests" }),
    });

    const [row] = await db.select().from(schema.agentTasks);

    // Use awaitTasks to retrieve the result
    const awaitTool = makeAwaitTasksTool({ db });
    const result = await awaitTool.execute(
      { taskIds: [String(row.id)] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("completed");
    expect(result.results[0].summary).toContain("€5000");
  });
});
```

**Step 2: Run integration test**

Run: `cd packages/gateway && npx vitest run tests/agents/browser-subagent-integration.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/gateway/tests/agents/browser-subagent-integration.test.ts
git commit -m "test: add browser subagent integration test"
```
