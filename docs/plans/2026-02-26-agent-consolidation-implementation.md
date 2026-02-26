# Agent Consolidation & Tool Expansion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace separate agent classes with a single AgentRunner + task configs, and add cmd/dbQuery/dbSchema tools to all agents.

**Architecture:** One generic runner executes any task config (system prompt + tool list + step limit). New tools are registered in the shared ToolRegistry. The permission system gains a `context` param for blacklisted command details. Heartbeat agent stays unchanged.

**Tech Stack:** Vercel AI SDK (`ai` + `tool()` + `generateText`), Zod, better-sqlite3, child_process, vitest

**Design doc:** `docs/plans/2026-02-26-agent-consolidation-design.md`

**Note:** The app data dir is `~/.wedding-planner/` (see `src/config/paths.ts`). The cmd workspace will be `~/.wedding-planner/workspace/`.

---

## Phase 1: Permission System + New Tools

### Task 1: Add `context` param to permission system

**Files:**
- Modify: `packages/gateway/src/tools/permission-wrapper.ts`
- Test: `packages/gateway/tests/tools/permission-wrapper.test.ts`

**Step 1: Write the failing test**

Add to the end of the `wrapToolWithPermission` describe block in `permission-wrapper.test.ts`:

```typescript
it("passes context to requestPermission callback", async () => {
  const requestPermission = vi.fn().mockResolvedValue("allow");
  const wrapped = wrapToolWithPermission(testTool, "test", manager, {
    requestPermission,
  });
  await wrapped.execute!(
    { query: "hello" },
    { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
  );
  expect(requestPermission).toHaveBeenCalledWith("test", undefined);
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/permission-wrapper.test.ts`
Expected: FAIL — `requestPermission` called with 1 arg, test expects 2

**Step 3: Update PermissionCallbacks interface and wrapToolWithPermission**

In `permission-wrapper.ts`, update:

```typescript
export interface PermissionCallbacks {
  requestPermission: (toolName: string, context?: string) => Promise<UserResponse>;
}
```

Update the `wrapToolWithPermission` function's prompt branch to pass `undefined` as context:

```typescript
// decision === "prompt"
const response = await callbacks.requestPermission(toolName, undefined);
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/tools/permission-wrapper.test.ts`
Expected: PASS

**Step 5: Update orchestrator to forward context**

In `packages/gateway/src/agents/orchestrator.ts`, update the `requestPermission` callback in `execute()` (around line 120):

```typescript
requestPermission: async (toolName: string, context?: string): Promise<UserResponse> => {
  const requestId = randomUUID();
  const entry = this.toolRegistry.get(toolName);
  this.broadcast({
    name: "research.permissionRequest",
    data: {
      sessionKey,
      requestId,
      toolName,
      toolDescription: entry?.description ?? toolName,
      context,
    },
  });
  return new Promise<UserResponse>((resolve) => {
    this.pendingPermissions.set(requestId, { resolve });
  });
},
```

**Step 6: Run all tests to check for regressions**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add packages/gateway/src/tools/permission-wrapper.ts packages/gateway/src/agents/orchestrator.ts packages/gateway/tests/tools/permission-wrapper.test.ts
git commit -m "feat: add context param to permission system"
```

---

### Task 2: Add workspace path helper

**Files:**
- Modify: `packages/gateway/src/config/paths.ts`

**Step 1: Add getWorkspaceDir function**

```typescript
export function getWorkspaceDir(): string {
  const dir = path.join(getDataDir(), "workspace");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
```

**Step 2: Commit**

```bash
git add packages/gateway/src/config/paths.ts
git commit -m "feat: add workspace directory helper"
```

---

### Task 3: Create `cmd` tool

**Files:**
- Create: `packages/gateway/src/tools/cmd.ts`
- Test: `packages/gateway/tests/tools/cmd.test.ts`

**Step 1: Write the failing tests**

Create `packages/gateway/tests/tools/cmd.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCmdTool, isBlacklisted, CMD_BLACKLIST } from "../../src/tools/cmd.js";

describe("isBlacklisted", () => {
  it("detects blacklisted commands", () => {
    expect(isBlacklisted("rm")).toBe(true);
    expect(isBlacklisted("rmdir")).toBe(true);
    expect(isBlacklisted("kill")).toBe(true);
    expect(isBlacklisted("dd")).toBe(true);
  });

  it("allows safe commands", () => {
    expect(isBlacklisted("ls")).toBe(false);
    expect(isBlacklisted("echo")).toBe(false);
    expect(isBlacklisted("cat")).toBe(false);
    expect(isBlacklisted("node")).toBe(false);
  });
});

describe("cmd tool", () => {
  it("executes a simple command and returns output", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const cmdTool = createCmdTool("/tmp/wp-test-workspace", callbacks);
    const result = await cmdTool.execute!(
      { command: "echo", args: ["hello world"] },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ stdout: "hello world\n", stderr: "" });
  });

  it("returns error for failed commands", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const cmdTool = createCmdTool("/tmp/wp-test-workspace", callbacks);
    const result = await cmdTool.execute!(
      { command: "false" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("") });
  });

  it("prompts for blacklisted commands", async () => {
    const callbacks = { requestPermission: vi.fn().mockResolvedValue("allow") };
    const cmdTool = createCmdTool("/tmp/wp-test-workspace", callbacks);
    await cmdTool.execute!(
      { command: "rm", args: ["-rf", "somedir"] },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(callbacks.requestPermission).toHaveBeenCalledWith(
      "cmd:rm",
      expect.stringContaining("rm -rf somedir"),
    );
  });

  it("blocks blacklisted command when denied", async () => {
    const callbacks = { requestPermission: vi.fn().mockResolvedValue("deny") };
    const cmdTool = createCmdTool("/tmp/wp-test-workspace", callbacks);
    const result = await cmdTool.execute!(
      { command: "rm", args: ["file.txt"] },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("denied") });
  });

  it("truncates output exceeding limit", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const cmdTool = createCmdTool("/tmp/wp-test-workspace", callbacks);
    // Generate output > 50KB
    const result = await cmdTool.execute!(
      { command: "node", args: ["-e", "process.stdout.write('x'.repeat(60000))"] },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const r = result as { stdout: string };
    expect(r.stdout.length).toBeLessThanOrEqual(51200 + 100); // 50KB + truncation message
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/tools/cmd.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the cmd tool**

Create `packages/gateway/src/tools/cmd.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PermissionCallbacks } from "./permission-wrapper.js";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB

export const CMD_BLACKLIST = [
  "rm", "rmdir", "mv", "kill", "killall", "pkill",
  "chmod", "chown", "mkfs", "dd", "shred",
];

export function isBlacklisted(command: string): boolean {
  const base = command.split("/").pop() ?? command;
  return CMD_BLACKLIST.includes(base);
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_BYTES) return text;
  return text.slice(0, MAX_OUTPUT_BYTES) + "\n...[output truncated]";
}

export function createCmdTool(workspaceDir: string, permissionCallbacks: PermissionCallbacks) {
  return tool({
    description:
      "Execute a command-line program. The working directory is a fixed workspace. Use this for file operations, running scripts, data processing, or any CLI task.",
    inputSchema: z.object({
      command: z.string().describe("The program to execute (e.g. 'ls', 'node', 'python3')"),
      args: z.array(z.string()).optional().default([]).describe("Arguments to pass to the program"),
      timeout: z.number().optional().default(30000).describe("Timeout in milliseconds"),
    }),
    execute: async ({ command, args, timeout }) => {
      // Check blacklist
      if (isBlacklisted(command)) {
        const fullCmd = [command, ...args].join(" ");
        const response = await permissionCallbacks.requestPermission(`cmd:${command}`, fullCmd);
        if (response === "deny") {
          return { error: `Command "${command}" denied by user. Try an alternative approach.` };
        }
      }

      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          cwd: workspaceDir,
          timeout,
          maxBuffer: MAX_OUTPUT_BYTES * 2,
        });
        return { stdout: truncate(stdout), stderr: truncate(stderr) };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/tools/cmd.test.ts`
Expected: All pass

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/cmd.ts packages/gateway/tests/tools/cmd.test.ts
git commit -m "feat: add cmd tool with blacklist and output truncation"
```

---

### Task 4: Create `dbSchema` tool

**Files:**
- Create: `packages/gateway/src/tools/db-schema.ts`
- Test: `packages/gateway/tests/tools/db-schema.test.ts`

**Step 1: Write the failing tests**

Create `packages/gateway/tests/tools/db-schema.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { pushSchema } from "../../src/db/migrate.js";
import { createDbSchemaTool } from "../../src/tools/db-schema.js";

describe("dbSchema tool", () => {
  let sqlite: InstanceType<typeof Database>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
    pushSchema(sqlite);
  });

  it("returns all tables when no table param given", async () => {
    const schemaTool = createDbSchemaTool(sqlite);
    const result = await schemaTool.execute!(
      {},
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const tables = result as { tables: Array<{ name: string }> };
    const names = tables.tables.map((t) => t.name);
    expect(names).toContain("vendors");
    expect(names).toContain("categories");
    expect(names).toContain("communications");
  });

  it("returns columns for a specific table", async () => {
    const schemaTool = createDbSchemaTool(sqlite);
    const result = await schemaTool.execute!(
      { table: "vendors" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const schema = result as { tables: Array<{ name: string; columns: Array<{ name: string; type: string }> }> };
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].name).toBe("vendors");
    const colNames = schema.tables[0].columns.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("name");
    expect(colNames).toContain("contact_email");
  });

  it("returns error for unknown table", async () => {
    const schemaTool = createDbSchemaTool(sqlite);
    const result = await schemaTool.execute!(
      { table: "nonexistent" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("nonexistent") });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/tools/db-schema.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the dbSchema tool**

Create `packages/gateway/src/tools/db-schema.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import type Database from "better-sqlite3";

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyInfo {
  table: string;
  from: string;
  to: string;
}

interface TableSchema {
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean; primaryKey: boolean; defaultValue: string | null }>;
  foreignKeys: Array<{ column: string; references: string }>;
}

export function createDbSchemaTool(sqlite: Database.Database) {
  return tool({
    description:
      "Inspect the database schema. Returns table names, columns, types, and foreign keys. Call with no arguments to list all tables, or pass a table name to get details for one table.",
    inputSchema: z.object({
      table: z.string().optional().describe("Table name to inspect. Omit to list all tables."),
    }),
    execute: async ({ table }) => {
      if (table) {
        const columns = sqlite.pragma(`table_info("${table}")`) as ColumnInfo[];
        if (columns.length === 0) {
          return { error: `Table "${table}" not found` };
        }
        const fks = sqlite.pragma(`foreign_key_list("${table}")`) as ForeignKeyInfo[];
        return {
          tables: [{
            name: table,
            columns: columns.map((c) => ({
              name: c.name,
              type: c.type,
              nullable: c.notnull === 0,
              primaryKey: c.pk === 1,
              defaultValue: c.dflt_value,
            })),
            foreignKeys: fks.map((fk) => ({
              column: fk.from,
              references: `${fk.table}.${fk.to}`,
            })),
          }],
        };
      }

      // List all tables
      const rows = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tables: TableSchema[] = rows.map((row) => {
        const columns = sqlite.pragma(`table_info("${row.name}")`) as ColumnInfo[];
        const fks = sqlite.pragma(`foreign_key_list("${row.name}")`) as ForeignKeyInfo[];
        return {
          name: row.name,
          columns: columns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: c.notnull === 0,
            primaryKey: c.pk === 1,
            defaultValue: c.dflt_value,
          })),
          foreignKeys: fks.map((fk) => ({
            column: fk.from,
            references: `${fk.table}.${fk.to}`,
          })),
        };
      });

      return { tables };
    },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/tools/db-schema.test.ts`
Expected: All pass

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/db-schema.ts packages/gateway/tests/tools/db-schema.test.ts
git commit -m "feat: add dbSchema tool for runtime schema introspection"
```

---

### Task 5: Create `dbQuery` tool

**Files:**
- Create: `packages/gateway/src/tools/db-query.ts`
- Test: `packages/gateway/tests/tools/db-query.test.ts`

**Step 1: Write the failing tests**

Create `packages/gateway/tests/tools/db-query.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema.js";
import { createDbQueryTool, isBlacklistedSql } from "../../src/tools/db-query.js";

describe("isBlacklistedSql", () => {
  it("detects DROP statements", () => {
    expect(isBlacklistedSql("DROP TABLE vendors")).toBe(true);
    expect(isBlacklistedSql("  drop table vendors")).toBe(true);
  });

  it("detects ALTER statements", () => {
    expect(isBlacklistedSql("ALTER TABLE vendors ADD COLUMN foo TEXT")).toBe(true);
  });

  it("detects PRAGMA statements", () => {
    expect(isBlacklistedSql("PRAGMA table_info(vendors)")).toBe(true);
  });

  it("detects ATTACH statements", () => {
    expect(isBlacklistedSql("ATTACH DATABASE ':memory:' AS db2")).toBe(true);
  });

  it("allows SELECT statements", () => {
    expect(isBlacklistedSql("SELECT * FROM vendors")).toBe(false);
  });

  it("allows INSERT statements", () => {
    expect(isBlacklistedSql("INSERT INTO vendors (name) VALUES ('test')")).toBe(false);
  });

  it("allows UPDATE statements", () => {
    expect(isBlacklistedSql("UPDATE vendors SET name = 'test' WHERE id = 1")).toBe(false);
  });

  it("allows DELETE statements", () => {
    expect(isBlacklistedSql("DELETE FROM vendors WHERE id = 1")).toBe(false);
  });
});

describe("dbQuery tool", () => {
  let sqlite: InstanceType<typeof Database>;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
    pushSchema(sqlite);
    db = drizzle(sqlite, { schema });
    await seedCategories(db);
  });

  it("executes a SELECT query", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    const result = await queryTool.execute!(
      { sql: "SELECT name FROM categories LIMIT 3" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const r = result as { rows: unknown[]; rowCount: number };
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rowCount).toBeGreaterThan(0);
  });

  it("executes an INSERT and returns changes", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    const result = await queryTool.execute!(
      { sql: "INSERT INTO vendors (category_id, name, status) VALUES (1, 'Test Vendor', 'researched')" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const r = result as { changes: number };
    expect(r.changes).toBe(1);
  });

  it("truncates results to 100 rows", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    // Insert 150 vendors
    for (let i = 0; i < 150; i++) {
      sqlite.prepare("INSERT INTO vendors (category_id, name, status) VALUES (1, ?, 'researched')").run(`Vendor ${i}`);
    }
    const result = await queryTool.execute!(
      { sql: "SELECT * FROM vendors" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const r = result as { rows: unknown[]; truncated: boolean };
    expect(r.rows).toHaveLength(100);
    expect(r.truncated).toBe(true);
  });

  it("prompts for blacklisted SQL", async () => {
    const callbacks = { requestPermission: vi.fn().mockResolvedValue("deny") };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    const result = await queryTool.execute!(
      { sql: "DROP TABLE vendors" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(callbacks.requestPermission).toHaveBeenCalledWith(
      "dbQuery:DROP",
      expect.stringContaining("DROP TABLE vendors"),
    );
    expect(result).toMatchObject({ error: expect.stringContaining("denied") });
  });

  it("returns error for invalid SQL", async () => {
    const callbacks = { requestPermission: vi.fn() };
    const queryTool = createDbQueryTool(sqlite, callbacks);
    const result = await queryTool.execute!(
      { sql: "SELECTT * FROM nonexistent" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.any(String) });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/tools/db-query.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the dbQuery tool**

Create `packages/gateway/src/tools/db-query.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import type Database from "better-sqlite3";
import type { PermissionCallbacks } from "./permission-wrapper.js";

const MAX_ROWS = 100;
const SQL_BLACKLIST = ["DROP", "ALTER", "PRAGMA", "ATTACH", "DETACH"];

export function isBlacklistedSql(sql: string): boolean {
  const trimmed = sql.trimStart().toUpperCase();
  return SQL_BLACKLIST.some((keyword) => trimmed.startsWith(keyword));
}

function getBlacklistedKeyword(sql: string): string {
  const trimmed = sql.trimStart().toUpperCase();
  return SQL_BLACKLIST.find((keyword) => trimmed.startsWith(keyword)) ?? "UNKNOWN";
}

export function createDbQueryTool(sqlite: Database.Database, permissionCallbacks: PermissionCallbacks) {
  return tool({
    description:
      "Execute a SQL query against the application database. Use the dbSchema tool first to understand the table structure. Supports SELECT, INSERT, UPDATE, DELETE. Destructive DDL (DROP, ALTER) requires explicit permission.",
    inputSchema: z.object({
      sql: z.string().describe("The SQL query to execute"),
      params: z.array(z.unknown()).optional().default([]).describe("Bind parameters for the query"),
    }),
    execute: async ({ sql: query, params }) => {
      // Check blacklist
      if (isBlacklistedSql(query)) {
        const keyword = getBlacklistedKeyword(query);
        const response = await permissionCallbacks.requestPermission(`dbQuery:${keyword}`, query);
        if (response === "deny") {
          return { error: `SQL "${keyword}" denied by user. Try an alternative approach.` };
        }
      }

      try {
        const trimmed = query.trimStart().toUpperCase();
        const isRead = trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("EXPLAIN");

        if (isRead) {
          const stmt = sqlite.prepare(query);
          const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
          const truncated = rows.length > MAX_ROWS;
          return {
            rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
            rowCount: rows.length,
            truncated,
          };
        } else {
          const stmt = sqlite.prepare(query);
          const info = params.length > 0 ? stmt.run(...params) : stmt.run();
          return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/tools/db-query.test.ts`
Expected: All pass

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/db-query.ts packages/gateway/tests/tools/db-query.test.ts
git commit -m "feat: add dbQuery tool with SQL blacklist"
```

---

### Task 6: Extract `createVendor` to registry

**Files:**
- Create: `packages/gateway/src/tools/create-vendor.ts`
- Modify: `packages/gateway/src/tools/index.ts`

**Step 1: Create the factory tool**

Create `packages/gateway/src/tools/create-vendor.ts`. Extract the `makeCreateVendorTool` function from `packages/gateway/src/agents/research.ts` (lines 11-57). The function needs `AgentContext` for DB access, so register it as a factory:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendors, categories } from "../db/schema.js";
import type { Db } from "../infra/router.js";

interface CreateVendorContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
}

export function makeCreateVendorTool(ctx: CreateVendorContext) {
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
      imageUrl: z
        .string()
        .nullable()
        .describe("URL of a representative image (e.g. from og:image meta tag)"),
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
          imageUrl: params.imageUrl,
          status: "researched",
        })
        .returning();

      return { vendorId: vendor.id, name: vendor.name };
    },
  });
}
```

**Step 2: Register in tool index**

In `packages/gateway/src/tools/index.ts`, add the factory registration:

```typescript
import { makeCreateVendorTool } from "./create-vendor.js";

// Inside createToolRegistry(), after existing registrations:
registry.registerFactory("createVendor", {
  description: "Create a new vendor record in the database",
  category: "database",
  create: (ctx: unknown) => makeCreateVendorTool(ctx as any),
});
```

**Step 3: Run existing tests to check for regressions**

Run: `cd packages/gateway && npx vitest run tests/tools/registry.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/gateway/src/tools/create-vendor.ts packages/gateway/src/tools/index.ts
git commit -m "feat: extract createVendor to registry as factory tool"
```

---

### Task 7: Register cmd, dbQuery, dbSchema in tool index

**Files:**
- Modify: `packages/gateway/src/tools/index.ts`

**Step 1: Add registrations**

The cmd and dbQuery tools need runtime context (workspace dir, sqlite instance, permission callbacks), so they'll be registered as factories. The dbSchema tool needs the sqlite instance.

Update `packages/gateway/src/tools/index.ts`:

```typescript
import { createCmdTool } from "./cmd.js";
import { createDbQueryTool } from "./db-query.js";
import { createDbSchemaTool } from "./db-schema.js";

// Add factory registrations inside createToolRegistry():

registry.registerFactory("cmd", {
  description: "Execute a command-line program in the workspace directory",
  category: "system",
  create: (ctx: unknown) => {
    const { workspaceDir, permissionCallbacks } = ctx as any;
    return createCmdTool(workspaceDir, permissionCallbacks);
  },
});

registry.registerFactory("dbQuery", {
  description: "Execute a SQL query against the application database",
  category: "database",
  create: (ctx: unknown) => {
    const { sqlite, permissionCallbacks } = ctx as any;
    return createDbQueryTool(sqlite, permissionCallbacks);
  },
});

registry.registerFactory("dbSchema", {
  description: "Inspect the database schema (tables, columns, foreign keys)",
  category: "database",
  create: (ctx: unknown) => {
    const { sqlite } = ctx as any;
    return createDbSchemaTool(sqlite);
  },
});
```

**Step 2: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add packages/gateway/src/tools/index.ts
git commit -m "feat: register cmd, dbQuery, dbSchema tools in registry"
```

---

## Phase 2: Agent Consolidation

### Task 8: Create TaskConfig type and AgentRunner

**Files:**
- Modify: `packages/gateway/src/agents/base-agent.ts`
- Create: `packages/gateway/src/agents/runner.ts`
- Test: `packages/gateway/tests/agents/runner.test.ts`

**Step 1: Add TaskConfig to base-agent.ts**

Add to `packages/gateway/src/agents/base-agent.ts`:

```typescript
export interface TaskConfig {
  name: string;
  systemPrompt: string;
  tools: string[];
  maxSteps?: number;
}
```

Keep the existing `BaseAgent`, `AgentContext`, and `AgentResult` interfaces — heartbeat still uses them.

**Step 2: Write the failing test for AgentRunner**

Create `packages/gateway/tests/agents/runner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { AgentRunner } from "../../src/agents/runner.js";
import type { TaskConfig, AgentContext } from "../../src/agents/base-agent.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { PermissionManager } from "../../src/tools/permission-wrapper.js";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";

// Mock the AI model
vi.mock("../../src/agents/model-provider.js", () => ({
  getModel: vi.fn().mockResolvedValue({
    specificationVersion: "v1",
    provider: "test",
    modelId: "test",
    doGenerate: vi.fn().mockResolvedValue({
      text: "Test response",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 5 },
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  }),
}));

function setupDb() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

describe("AgentRunner", () => {
  let runner: AgentRunner;
  let ctx: AgentContext;

  beforeEach(() => {
    const { sqlite, db } = setupDb();
    const registry = new ToolRegistry();

    // Register a simple test tool
    const echoTool = tool({
      description: "Echo input",
      inputSchema: z.object({ message: z.string() }),
      execute: async ({ message }) => ({ echo: message }),
    });
    registry.register({ name: "echo", description: "Echo", category: "test", tool: echoTool });

    runner = new AgentRunner();
    ctx = {
      db,
      sessionKey: "test-session",
      emit: vi.fn(),
      signal: AbortSignal.timeout(30_000),
      toolRegistry: registry,
      permissionManager: new PermissionManager(db),
      permissionCallbacks: { requestPermission: vi.fn().mockResolvedValue("allow") },
    };
  });

  it("returns a result with summary", async () => {
    const config: TaskConfig = {
      name: "test",
      systemPrompt: "You are a test assistant.",
      tools: [],
      maxSteps: 3,
    };
    const result = await runner.run(config, ctx, [{ role: "user", content: "Hello" }]);
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe("string");
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/agents/runner.test.ts`
Expected: FAIL — module not found

**Step 4: Implement the AgentRunner**

Create `packages/gateway/src/agents/runner.ts`:

```typescript
import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import type { TaskConfig, AgentContext, AgentResult } from "./base-agent.js";
import { getModel } from "./model-provider.js";
import { wrapToolWithPermission } from "../tools/permission-wrapper.js";

export class AgentRunner {
  async run(config: TaskConfig, ctx: AgentContext, messages: ModelMessage[]): Promise<AgentResult> {
    ctx.emit("starting", `Running ${config.name}...`);

    // Build wrapped tool set from config
    const tools: Record<string, any> = {};
    if (config.tools.length > 0) {
      const toolCtx = { db: ctx.db, emit: ctx.emit, sqlite: undefined, workspaceDir: undefined, permissionCallbacks: ctx.permissionCallbacks };
      const rawTools = ctx.toolRegistry.getToolSetWithContext(config.tools, toolCtx);
      for (const [name, t] of Object.entries(rawTools)) {
        tools[name] = wrapToolWithPermission(t, name, ctx.permissionManager, ctx.permissionCallbacks);
      }
    }

    const model = await getModel();
    const maxSteps = config.maxSteps ?? 15;

    const { text, steps } = await generateText({
      model,
      system: config.systemPrompt,
      messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: ctx.signal,
      onStepFinish: ({ toolCalls: stepToolCalls }) => {
        for (const tc of stepToolCalls) {
          ctx.emit("tool-call", `${tc.toolName}: ${JSON.stringify(tc.input).slice(0, 100)}`);
        }
      },
    });

    // Collect all tool calls from steps
    const allToolCalls: Array<{ toolName: string; args: unknown; result: unknown }> = [];
    for (const step of steps) {
      for (const tc of step.toolCalls) {
        const tr = step.toolResults.find((r: any) => r.toolCallId === tc.toolCallId);
        allToolCalls.push({ toolName: tc.toolName, args: tc.input, result: tr?.output });
      }
    }

    ctx.emit("complete", `${config.name} finished`);

    return {
      summary: text ?? `${config.name} completed`,
      data: { toolCalls: allToolCalls },
    };
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/agents/runner.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/agents/base-agent.ts packages/gateway/src/agents/runner.ts packages/gateway/tests/agents/runner.test.ts
git commit -m "feat: add AgentRunner and TaskConfig type"
```

---

### Task 9: Create task configs

**Files:**
- Create: `packages/gateway/src/agents/task-configs.ts`

**Step 1: Create task configs with system prompts**

Create `packages/gateway/src/agents/task-configs.ts`. Move system prompts from the old agent files:

```typescript
import type { TaskConfig } from "./base-agent.js";

const RESEARCH_PROMPT = `You are a wedding vendor research assistant. Your job is to find and document wedding vendors matching the user's queries.

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
- When scraping a vendor's website, note the image URL from the scrape results (meta.imageUrl) and pass it to createVendor
- If a page is JavaScript-heavy and the scraper returns little content, try the browser tool
- If you find a PDF (menu, brochure, price list), parse it for details
- Do not create duplicate vendors
- When comparing vendors, always lead with pricing information — it's the #1 thing users care about
- After finding multiple vendors, provide a brief comparison summary highlighting key differences
- You can use the cmd tool to run scripts for data processing
- You can use dbQuery and dbSchema to inspect or modify the database directly

## Categories
Venue/Food/Beverage, Ceremony, Photography/Videography, Decor, Stationery, Attire, Entertainment, Planner/Coordinator, Miscellaneous, Contingency`;

const OUTREACH_PROMPT = `You are drafting outreach messages to wedding vendors.
You have access to the database to look up vendor details and wedding configuration.

## Process
1. Use dbSchema to understand the database structure
2. Use dbQuery to fetch vendor details and wedding configuration
3. Draft a professional, warm message appropriate for the channel (email or WhatsApp)
4. Use dbQuery to save the draft as a communication record

## Guidelines
- Be warm but professional
- Include relevant wedding details (date, guest count, budget context)
- Respect the couple's language preferences
- Create the communication record with status "draft"`;

const PARSER_PROMPT = `You are analyzing incoming vendor responses for a wedding planning app.

## Process
1. Use dbSchema to understand the database structure
2. Use dbQuery to fetch the communication and vendor details
3. Extract structured data: pricing, availability, conditions
4. If pricing is found, create a quote record with line items
5. Update the communication status to "received"

## Output
Provide a brief summary of what the vendor said, including key pricing and availability details.`;

const TRANSLATION_PROMPT = `You are a professional translator for wedding planning communications.
Translate the provided text accurately. Only output the translated text, nothing else.
If you need to process or format the text, you can use the cmd tool.`;

export const TASK_CONFIGS: TaskConfig[] = [
  {
    name: "research",
    systemPrompt: RESEARCH_PROMPT,
    tools: ["search", "scrape", "browse", "parsePdf", "createVendor", "cmd", "dbQuery", "dbSchema"],
    maxSteps: 15,
  },
  {
    name: "outreach",
    systemPrompt: OUTREACH_PROMPT,
    tools: ["cmd", "dbQuery", "dbSchema"],
    maxSteps: 5,
  },
  {
    name: "parse",
    systemPrompt: PARSER_PROMPT,
    tools: ["cmd", "dbQuery", "dbSchema"],
    maxSteps: 5,
  },
  {
    name: "translation",
    systemPrompt: TRANSLATION_PROMPT,
    tools: ["cmd"],
    maxSteps: 3,
  },
];

export function getTaskConfig(name: string): TaskConfig | undefined {
  return TASK_CONFIGS.find((c) => c.name === name);
}
```

**Step 2: Commit**

```bash
git add packages/gateway/src/agents/task-configs.ts
git commit -m "feat: add task configs with system prompts"
```

---

### Task 10: Refactor Orchestrator to use AgentRunner + TaskConfigs

**Files:**
- Modify: `packages/gateway/src/agents/orchestrator.ts`

**Step 1: Update orchestrator**

Key changes to `orchestrator.ts`:
1. Import `AgentRunner`, `TaskConfig`, `getTaskConfig`
2. Add a `configs` map alongside `agents` (for heartbeat)
3. Add `registerConfig(config: TaskConfig)` method
4. In `dispatch()`: try `configs` first, fall back to `agents` (for heartbeat)
5. In `execute()`: if dispatching a config, use `AgentRunner.run()` with messages from input
6. Pass `sqlite` and `workspaceDir` in the factory context for tools that need them

The orchestrator needs access to the raw `sqlite` instance (for dbQuery/dbSchema) and the workspace dir (for cmd). These should be passed to the constructor:

```typescript
constructor(
  db: Db,
  broadcast: (event: GatewayEvent) => void,
  toolRegistry: ToolRegistry,
  config?: OrchestratorConfig,
  sqlite?: Database.Database,  // raw sqlite for dbQuery/dbSchema
) {
```

In `execute()`, when running a TaskConfig, build the tool factory context:

```typescript
import { getWorkspaceDir } from "../config/paths.js";

// Inside execute(), when using AgentRunner:
const toolCtx = {
  db: this.db,
  emit,
  sqlite: this.sqlite,
  workspaceDir: getWorkspaceDir(),
  permissionCallbacks,
};
```

The AgentRunner needs to accept this context and pass it to `getToolSetWithContext()`. Update the runner's `run()` method signature to accept a `toolCtx` parameter:

```typescript
async run(config: TaskConfig, ctx: AgentContext, messages: ModelMessage[], toolCtx: unknown): Promise<AgentResult> {
  // ...
  const rawTools = ctx.toolRegistry.getToolSetWithContext(config.tools, toolCtx);
  // ...
}
```

**Step 2: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All pass (existing tests may need mock updates for new constructor param)

**Step 3: Commit**

```bash
git add packages/gateway/src/agents/orchestrator.ts packages/gateway/src/agents/runner.ts
git commit -m "refactor: orchestrator uses AgentRunner + TaskConfigs"
```

---

### Task 11: Update index.ts to register task configs

**Files:**
- Modify: `packages/gateway/src/index.ts`

**Step 1: Replace agent registrations with config registrations**

In `packages/gateway/src/index.ts`, replace lines 14-18 (agent imports) and lines 109-113 (agent registrations):

```typescript
// Remove these imports:
// import { researchAgent } from "./agents/research.js";
// import { outreachAgent } from "./agents/outreach.js";
// import { parserAgent } from "./agents/parser.js";
// import { translationAgent } from "./agents/translation.js";

// Add these imports:
import { TASK_CONFIGS } from "./agents/task-configs.js";
import { heartbeatAgent } from "./agents/heartbeat.js";

// Replace agent registrations (lines 109-113) with:
const orchestrator = new Orchestrator(db, (event) => {
  wsServer.broadcast(event);
}, toolRegistry, undefined, sqlite);

for (const config of TASK_CONFIGS) {
  orchestrator.registerConfig(config);
}
orchestrator.registerAgent(heartbeatAgent);
```

**Step 2: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add packages/gateway/src/index.ts
git commit -m "refactor: register task configs instead of individual agents"
```

---

### Task 12: Delete old agent files

**Files:**
- Delete: `packages/gateway/src/agents/research.ts`
- Delete: `packages/gateway/src/agents/outreach.ts`
- Delete: `packages/gateway/src/agents/parser.ts`
- Delete: `packages/gateway/src/agents/translation.ts`

**Step 1: Remove old files**

```bash
git rm packages/gateway/src/agents/research.ts packages/gateway/src/agents/outreach.ts packages/gateway/src/agents/parser.ts packages/gateway/src/agents/translation.ts
```

**Step 2: Check for remaining imports**

Search for any remaining imports of the deleted files and update them:

```bash
grep -r "from.*agents/research" packages/gateway/src/
grep -r "from.*agents/outreach" packages/gateway/src/
grep -r "from.*agents/parser" packages/gateway/src/
grep -r "from.*agents/translation" packages/gateway/src/
```

Fix any remaining references.

**Step 3: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All pass. Some tests may import mock agents — update those to use the new task config pattern.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old agent files, consolidation complete"
```

---

### Task 13: Update tests that reference old agents

**Files:**
- Modify: any test files that import from deleted agent modules

**Step 1: Find and fix broken test imports**

Search for test files importing old agents:

```bash
grep -r "from.*agents/research\|from.*agents/outreach\|from.*agents/parser\|from.*agents/translation" packages/gateway/tests/
```

Update these to use the new `TASK_CONFIGS` or mock the `AgentRunner` directly.

For tests that use `mockOutreachAgent`, `mockParserAgent`, etc.: these are no longer needed since the orchestrator uses configs, not agent instances. Update handler tests to mock the orchestrator's `dispatch()` method directly.

**Step 2: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All 75+ tests pass

**Step 3: Commit**

```bash
git add -A
git commit -m "test: update tests for consolidated agent architecture"
```

---

### Task 14: Final validation

**Step 1: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 2: Run the gateway in dev mode**

Run: `cd packages/gateway && npm run dev`
Expected: Gateway starts, prints ready signal

**Step 3: Verify tool listing**

Connect via WebSocket or use the app to call `tools.list`. Should now show: search, scrape, browse, parsePdf, createVendor, cmd, dbQuery, dbSchema.

**Step 4: Test the research chat**

Open the app, start a research thread, verify the agent can use all tools including the new cmd/dbQuery/dbSchema.
