# Context Compaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically summarize long research conversations when token usage exceeds 80% of the model's context window, preventing context overflow errors.

**Architecture:** After each `generateText()` call, check `usage.promptTokens`. If over threshold, call Sonnet to summarize, insert a system marker in the DB, and on subsequent calls build messages as `[summary] + [post-marker messages]`. The unused `context/` module is deleted.

**Tech Stack:** Vercel AI SDK (`generateText`, `usage`), @ai-sdk/anthropic, React, WebSocket events

---

### Task 1: Add context window lookup and summarization model to model-provider

**Files:**
- Modify: `packages/gateway/src/agents/model-provider.ts:47-63`
- Test: `packages/gateway/tests/agents/model-provider.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/agents/model-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getContextWindowForModel } from "../../src/agents/model-provider.js";

describe("getContextWindowForModel", () => {
  it("returns 200k for opus models", () => {
    expect(getContextWindowForModel("claude-opus-4-20250514")).toBe(200_000);
  });

  it("returns 1M for sonnet models", () => {
    expect(getContextWindowForModel("claude-sonnet-4-20250514")).toBe(1_000_000);
  });

  it("returns 200k for unknown models", () => {
    expect(getContextWindowForModel("some-other-model")).toBe(200_000);
  });

  it("returns 200k for haiku models", () => {
    expect(getContextWindowForModel("claude-haiku-4-20250514")).toBe(200_000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/agents/model-provider.test.ts`
Expected: FAIL — `getContextWindowForModel` is not exported

**Step 3: Implement getContextWindowForModel**

Add to `packages/gateway/src/agents/model-provider.ts` (after the existing `getAIConfig` function, around line 27):

```ts
const CONTEXT_WINDOWS: Record<string, number> = {
  opus: 200_000,
  sonnet: 1_000_000,
  haiku: 200_000,
};

export function getContextWindowForModel(modelName: string): number {
  const lower = modelName.toLowerCase();
  for (const [key, tokens] of Object.entries(CONTEXT_WINDOWS)) {
    if (lower.includes(key)) return tokens;
  }
  return 200_000;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/agents/model-provider.test.ts`
Expected: PASS

**Step 5: Add getSummarizationModel**

Add to `packages/gateway/src/agents/model-provider.ts` (after `getContextWindowForModel`):

```ts
export async function getSummarizationModel(): Promise<LanguageModel> {
  if (currentConfig.provider === "claude-max") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({
      baseURL: currentConfig.proxyUrl,
      apiKey: "claude-max",
    });
    return openai.chat("claude-sonnet-4-20250514");
  }

  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const key = currentConfig.apiKey || process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic(key ? anthropicOptions(key) : {});
  return anthropic("claude-sonnet-4-20250514");
}
```

**Step 6: Commit**

```bash
git add packages/gateway/src/agents/model-provider.ts packages/gateway/tests/agents/model-provider.test.ts
git commit -m "feat: add context window lookup and summarization model"
```

---

### Task 2: Add compaction logic to AgentRunner

**Files:**
- Modify: `packages/gateway/src/agents/runner.ts`
- Modify: `packages/gateway/src/agents/base-agent.ts:18-21`
- Test: `packages/gateway/tests/agents/runner.test.ts`

**Step 1: Update AgentResult type**

In `packages/gateway/src/agents/base-agent.ts`, add `compactionSummary` to `AgentResult`:

```ts
export interface AgentResult {
  summary: string;
  data?: unknown;
  compactionSummary?: string;
}
```

**Step 2: Write the failing test**

Add to `packages/gateway/tests/agents/runner.test.ts`:

```ts
it("returns compactionSummary when prompt tokens exceed 80% of context window", async () => {
  // Mock getModel to return high token usage
  const { getModel } = await import("../../src/agents/model-provider.js");
  (getModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    specificationVersion: "v2",
    provider: "test",
    modelId: "claude-opus-4-20250514",
    supportedUrls: {},
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Research response" }],
      finishReason: "stop",
      usage: { inputTokens: 170_000, outputTokens: 500 },
      warnings: [],
    }),
  });

  // Mock getSummarizationModel
  const { getSummarizationModel } = await import("../../src/agents/model-provider.js");
  (getSummarizationModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    specificationVersion: "v2",
    provider: "test",
    modelId: "claude-sonnet-4-20250514",
    supportedUrls: {},
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Summary of the conversation so far." }],
      finishReason: "stop",
      usage: { inputTokens: 1000, outputTokens: 200 },
      warnings: [],
    }),
  });

  const { AgentRunner } = await import("../../src/agents/runner.js");

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
  const result = await runner.run(
    {
      name: "research",
      systemPrompt: "You are a test agent.",
      tools: [],
      maxSteps: 3,
    },
    ctx,
    [{ role: "user", content: "Hello" }],
    toolCtx,
  );

  expect(result.compactionSummary).toBe("Summary of the conversation so far.");
});
```

Also update the mock at the top of the test file to include `getSummarizationModel`:

```ts
vi.mock("../../src/agents/model-provider.js", () => ({
  getModel: vi.fn().mockResolvedValue({
    specificationVersion: "v2",
    provider: "test",
    modelId: "test-model",
    supportedUrls: {},
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Test response" }],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
      warnings: [],
    }),
  }),
  getBuiltInTools: vi.fn().mockResolvedValue(null),
  getContextWindowForModel: vi.fn().mockReturnValue(200_000),
  getSummarizationModel: vi.fn().mockResolvedValue({
    specificationVersion: "v2",
    provider: "test",
    modelId: "claude-sonnet-4-20250514",
    supportedUrls: {},
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Summarized conversation" }],
      finishReason: "stop",
      usage: { inputTokens: 100, outputTokens: 50 },
      warnings: [],
    }),
  }),
}));
```

**Step 3: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/agents/runner.test.ts`
Expected: FAIL — `compactionSummary` is undefined

**Step 4: Implement compaction in runner.ts**

Replace the end of `runner.ts` (from `const { text, steps }` through to the return) with:

```ts
import { getModel, getBuiltInTools, getContextWindowForModel, getSummarizationModel, getAIConfig } from "./model-provider.js";

// ... existing code up to generateText call ...

const { text, steps, usage } = await generateText({
  // ... existing params unchanged ...
});

// ... existing tool call collection code unchanged ...

ctx.emit("complete", `${config.name} finished`);

// Check if context needs compaction
let compactionSummary: string | undefined;
if (usage?.promptTokens) {
  const modelName = (await getAIConfig()).model;
  const contextWindow = getContextWindowForModel(modelName);
  const threshold = contextWindow * 0.8;

  if (usage.promptTokens > threshold) {
    ctx.emit("compacting", `Context at ${Math.round((usage.promptTokens / contextWindow) * 100)}% — summarizing conversation...`);
    try {
      const summarizationModel = await getSummarizationModel();
      const { text: summary } = await generateText({
        model: summarizationModel,
        system: `You are summarizing a conversation between a user and a wedding planning research assistant. Produce a concise summary that preserves:
- All vendor names, pricing, and contact details discovered
- Key decisions and preferences expressed by the user
- Outstanding questions or next steps
- Any important context about the wedding (date, location, guest count, budget)

Be thorough but concise. This summary will replace the conversation history for future interactions.`,
        messages: [
          {
            role: "user",
            content: messages
              .map((m) => `[${m.role}]: ${"content" in m && typeof m.content === "string" ? m.content : JSON.stringify(m)}`)
              .join("\n\n"),
          },
        ],
        abortSignal: ctx.signal,
      });
      compactionSummary = summary;
    } catch (err) {
      ctx.emit("warning", `Context compaction failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
}

return {
  summary: text || `${config.name} completed`,
  data: { toolCalls: allToolCalls, vendorIds },
  compactionSummary,
};
```

Note: `getAIConfig` is already exported from model-provider.ts. The import line at the top of runner.ts needs updating to include the new exports.

**Step 5: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/agents/runner.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/agents/runner.ts packages/gateway/src/agents/base-agent.ts packages/gateway/tests/agents/runner.test.ts
git commit -m "feat: add context compaction to agent runner"
```

---

### Task 3: Save compaction marker and emit event in orchestrator

**Files:**
- Modify: `packages/gateway/src/agents/orchestrator.ts:196-219`

**Step 1: Add compaction handling after the assistant message save**

In `orchestrator.ts`, after the block that saves the assistant message to `researchMessages` (line 208-214), add:

```ts
// Save compaction marker if context was summarized
if (result.compactionSummary && researchInput.threadId) {
  await this.db.insert(researchMessages).values({
    threadId: researchInput.threadId,
    role: "system",
    content: result.compactionSummary,
  });
  this.broadcast({
    name: "context-compacted",
    data: { threadId: researchInput.threadId },
  });
}
```

**Step 2: Add the event type to GatewayEvent**

In `packages/shared/src/protocol/messages.ts`, add to the `GatewayEvent` union (after line 38):

```ts
| { name: "context-compacted"; data: { threadId: number } }
```

**Step 3: Build shared package**

Run: `cd packages/shared && npm run build`
Expected: Success

**Step 4: Commit**

```bash
git add packages/gateway/src/agents/orchestrator.ts packages/shared/src/protocol/messages.ts
git commit -m "feat: save compaction marker and emit context-compacted event"
```

---

### Task 4: Build messages from compaction marker in agents handler

**Files:**
- Modify: `packages/gateway/src/handlers/agents.ts:5-11`

**Step 1: Update the agent.research handler to detect compaction markers**

Replace the `agent.research` handler with:

```ts
router.register("agent.research", async (_db, params) => {
  const { threadId, messages } = params as { threadId: number; messages: Array<{ role: string; content: string }> };
  if (!threadId || !messages) {
    throw new Error("threadId and messages are required");
  }

  // Find the last compaction marker (role: "system") in the message list
  let compactedMessages: unknown[];
  const lastSystemIdx = messages.findLastIndex((m) => m.role === "system");
  if (lastSystemIdx !== -1) {
    // Use summary as first user message + all messages after the marker
    const summary = messages[lastSystemIdx].content;
    const postMarker = messages.slice(lastSystemIdx + 1)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
    compactedMessages = [
      { role: "user", content: `Previous conversation summary:\n\n${summary}` },
      ...(postMarker.length > 0 ? postMarker : []),
    ];
  } else {
    compactedMessages = messages;
  }

  const { taskId, sessionKey } = await orchestrator.dispatch("research", { threadId, messages: compactedMessages });
  return { taskId, sessionKey };
});
```

**Step 2: Verify existing tests still pass**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/gateway/src/handlers/agents.ts
git commit -m "feat: build agent messages from compaction marker"
```

---

### Task 5: Update ResearchView to include system messages and handle compaction event

**Files:**
- Modify: `packages/app/src/renderer/components/research/ResearchView.tsx`

**Step 1: Include system messages in the agentMessages sent to the backend**

In `ResearchView.tsx`, update the `handleSend` function. The `agentMessages` mapping (lines 192-195) currently filters to only `user`/`assistant`. Update it to include `system` messages:

```ts
const agentMessages = history.map((m) => ({
  role: m.role as "user" | "assistant" | "system",
  content: m.content,
}));
```

**Step 2: Listen for context-compacted event**

In the WebSocket event handler (around line 111), add a case for the new event:

```ts
if (event.name === "context-compacted") {
  refetchMessages();
}
```

This goes inside the existing `useEffect` that handles WebSocket events, alongside the other event handlers.

**Step 3: Render system messages distinctly**

Update the message rendering loop (around line 278-286). The `ChatMessage` component is called for each message. We need to handle `role: "system"` before it reaches `ChatMessage`:

```tsx
{messages.map((msg) =>
  msg.role === "system" ? (
    <div
      key={msg.id}
      className="my-4 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3"
    >
      <div className="flex-1">
        <p className="text-xs font-medium text-amber-400">
          Conversation compacted
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Earlier messages were summarized to stay within the context
          window. Scroll up to see the full history.
        </p>
      </div>
    </div>
  ) : (
    <ChatMessage
      key={msg.id}
      role={msg.role as "user" | "assistant"}
      content={msg.content}
      toolCalls={getToolCallsForMessage(msg)}
      vendors={getVendorsForMessage(msg)}
    />
  ),
)}
```

**Step 4: Commit**

```bash
git add packages/app/src/renderer/components/research/ResearchView.tsx
git commit -m "feat: render compaction markers and handle context-compacted event"
```

---

### Task 6: Delete unused context module

**Files:**
- Delete: `packages/gateway/src/context/context-manager.ts`
- Delete: `packages/gateway/src/context/history.ts`
- Delete: `packages/gateway/src/context/pruning.ts`
- Delete: `packages/gateway/src/context/compaction.ts`

**Step 1: Verify nothing imports from the context directory**

Run: `cd packages/gateway && grep -r "from.*context/" src/`
Expected: No matches (the module is unused)

**Step 2: Delete the directory**

```bash
rm -rf packages/gateway/src/context/
```

**Step 3: Run all tests to confirm nothing breaks**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A packages/gateway/src/context/
git commit -m "chore: delete unused context management module"
```

---

### Task 7: End-to-end verification

**Step 1: Build everything**

```bash
npm run build --workspaces
```

Expected: Clean build, no type errors

**Step 2: Run full test suite**

```bash
cd packages/gateway && npx vitest run
```

Expected: All tests pass

**Step 3: Manual smoke test**

1. Start the app
2. Open a research thread
3. Send a message, verify normal flow works
4. Verify the mock test for compaction passes (real compaction requires a long conversation)
