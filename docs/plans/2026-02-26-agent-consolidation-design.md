# Agent Consolidation & Tool Expansion

## Goal

Replace the current multi-agent architecture (research, outreach, parser, translation) with a single generic `AgentRunner` driven by task configs. Add three new tools: `cmd` (shell execution), `dbQuery` (raw SQL), and `dbSchema` (schema introspection).

## Current State

- 5 agents: research (multi-step with tools), outreach/parser/translation (single-shot `generateText`, no tools), heartbeat (no LLM, just DB checks)
- Tools registered centrally in `ToolRegistry`, only used by research agent
- Permission system wraps tools with allow/deny/prompt flow via WebSocket

## Design

### AgentRunner

A single generic runner replaces all LLM-based agents. It takes a `TaskConfig` and executes it:

```typescript
interface TaskConfig {
  name: string;           // "research", "outreach", "parse", "translate"
  systemPrompt: string;   // task-specific system prompt
  tools: string[];        // tool names from registry
  maxSteps?: number;      // default 15
}
```

The orchestrator:
1. Looks up `TaskConfig` by name (instead of a `BaseAgent` instance)
2. Builds the wrapped tool set from `config.tools` using the registry + permission wrapper
3. Passes the tools via `AgentContext`
4. Calls `runner.run(config, ctx, messages)`

The runner calls `generateText({ model, system, messages, tools, stopWhen })` and collects tool calls/results from steps.

Heartbeat stays as-is — it's not an LLM task.

### Task Configs

```typescript
const TASK_CONFIGS: TaskConfig[] = [
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
    name: "translate",
    systemPrompt: TRANSLATION_PROMPT,
    tools: ["cmd"],
    maxSteps: 3,
  },
];
```

All tasks are conversational (message history). System prompts stay as constants in `task-configs.ts`.

### New Tools

#### `cmd` — Shell Command Execution

- Uses `child_process.execFile` (avoids shell injection)
- Fixed `cwd`: `~/Library/Application Support/wedding-planner/workspace/` (created on first use)
- Params: `{ command: string, args?: string[], timeout?: number }`
- Output truncated to 50KB, default timeout 30s
- **Destructive command blacklist** (always forces permission prompt regardless of stored permission):
  `rm`, `rmdir`, `mv`, `kill`, `killall`, `pkill`, `chmod`, `chown`, `mkfs`, `dd`, `shred`
- Blacklist check happens inside `execute`, uses `ctx.permissionCallbacks.requestPermission("cmd:<command>", context)` with the actual command string so the user sees what will run

#### `dbQuery` — Raw SQL Execution

- Executes SQL via `better-sqlite3` directly
- Params: `{ sql: string, params?: unknown[] }`
- Results truncated to 100 rows
- **DDL blacklist** (always forces permission prompt):
  `DROP`, `ALTER`, `PRAGMA`, `ATTACH`, `DETACH`
- Same permission callback pattern as cmd — user sees the actual SQL

#### `dbSchema` — Schema Introspection

- Params: `{ table?: string }` (optional, omit for all tables)
- Returns table names, columns, types, foreign keys
- Generated from drizzle schema at runtime
- No permission needed — read-only metadata

#### `createVendor` — Extracted from research.ts

- Moves to `tools/create-vendor.ts`, registered as a factory tool (needs `AgentContext` for DB access)
- Same schema as current: name, categoryName, location, websiteUrl, contactEmail, contactPhone, description, imageUrl
- Available to any task that includes it in its tool list

### Permission System Changes

The `requestPermission` callback gains an optional `context` parameter:

```typescript
requestPermission: (toolName: string, context?: string) => Promise<UserResponse>;
```

The orchestrator's permission request event includes this context so the frontend can display it:

```typescript
this.broadcast({
  name: "research.permissionRequest",
  data: { sessionKey, requestId, toolName, toolDescription, context },
});
```

Blacklisted commands use a more specific tool name key (e.g. `"cmd:rm"`) so that "always-allow" on `cmd` doesn't bypass the blacklist. The user always sees the exact command/SQL before approving.

## File Changes

### New Files
- `tools/cmd.ts` — shell execution tool
- `tools/db-query.ts` — raw SQL tool
- `tools/db-schema.ts` — schema introspection tool
- `tools/create-vendor.ts` — extracted from research.ts
- `agents/runner.ts` — generic AgentRunner
- `agents/task-configs.ts` — task config definitions + system prompts

### Modified Files
- `tools/index.ts` — register cmd, dbQuery, dbSchema, createVendor
- `tools/permission-wrapper.ts` — add optional `context` param to `requestPermission`
- `agents/base-agent.ts` — add `TaskConfig` type (keep `BaseAgent` for heartbeat)
- `agents/orchestrator.ts` — build wrapped tool set from config, pass via context
- `index.ts` — register task configs instead of individual agents

### Deleted Files
- `agents/research.ts`
- `agents/outreach.ts`
- `agents/parser.ts`
- `agents/translation.ts`

### Not Touched
- `agents/heartbeat.ts` — stays as-is
- All frontend code — handler API unchanged
- DB schema — no migrations needed
- Existing tools (search, scrape, browse, parsePdf) — unchanged
