# Interruptible Research Agent

Allow the research agent to respond to user messages mid-run when it's idle (waiting for browser subagents), rather than queuing until the entire run finishes.

## Problem

When the research agent dispatches browser subagents and calls `awaitTasks`, it blocks in a 500ms poll loop for up to 5 minutes. Any user message during this time is saved to DB but not processed until the run completes. The user gets no response.

## Approach: Selective Interrupt-and-Resume

Abort the `generateText` call only when the agent is idle inside `awaitTasks`. Save partial state, let the completion callback re-dispatch with full history including the new user message. The LLM responds naturally and can call `awaitTasks` again to collect subagent results.

## Design

### 1. Interruptible flag

Add a `Set<string>` to the orchestrator tracking which sessions are currently interruptible (inside `awaitTasks`).

**Orchestrator changes:**
- `setInterruptible(sessionKey, boolean)` — add/remove from set
- `isInterruptible(sessionKey)` — check if session is in the set

**awaitTasks changes:**
- Accept `orchestrator` and `parentSessionKey` in its context (like `dispatch` already does)
- Call `orchestrator.setInterruptible(sessionKey, true)` before entering the poll loop
- Call `orchestrator.setInterruptible(sessionKey, false)` on exit (completion, timeout, or abort)

### 2. Selective abort on new message

**handlers/agents.ts changes:**
- Add `threadSessionKeys: Map<number, string>` mapping threadId → active sessionKey (set in `dispatchResearch`, cleared in `onThreadComplete`)
- When a message arrives for an active thread:
  - Look up the sessionKey
  - If `orchestrator.isInterruptible(sessionKey)`, call `orchestrator.abortTask(sessionKey, "interrupt")`
  - Otherwise, fall through to existing `{ queued: true }` behavior (agent is doing real work)

### 3. Abort reason distinction

**orchestrator.ts changes:**
- `abortTask(sessionKey, reason: "user" | "interrupt")` — pass reason via `controller.abort(reason)`

**runner.ts changes:**
- On AbortError, check `signal.reason`:
  - `"user"` → existing behavior: `{ summary: "Stopped by user", aborted: true }`
  - `"interrupt"` → return richer summary including dispatched task IDs and pending subagent info, with `aborted: true`
- The interrupt summary saved as an assistant message provides context for the next run

### 4. Re-dispatch with context

The existing `onThreadComplete` callback already:
1. Deletes the thread from `activeThreads`
2. Checks for queued user messages after the last assistant message
3. Re-dispatches with full history

After an interrupt, the conversation history will contain:
- The user's earlier messages
- The interrupt summary (assistant message describing pending subagents)
- The new user message

The LLM can respond to the user's message, mention that subagents are still running, and call `awaitTasks` when ready.

### 5. System prompt addition

Add to the research agent's system prompt:

> If your conversation history shows that browser subagents were dispatched but interrupted before results were collected, you can use `awaitTasks` with the same task IDs to retrieve their results. Address the user's latest message first, then collect subagent results when ready.

### 6. Frontend changes

**ResearchView.tsx:**
- Remove `disabled={researching}` from `ComposeBox` — allow sending messages while agent is running
- The existing Stop button remains for explicit user cancellation
- Loading state transitions naturally through the abort → re-dispatch cycle

## Files to modify

1. `packages/gateway/src/agents/orchestrator.ts` — interruptible set, abort reason
2. `packages/gateway/src/tools/await-tasks.ts` — set/clear interruptible flag
3. `packages/gateway/src/handlers/agents.ts` — threadSessionKeys map, selective abort
4. `packages/gateway/src/agents/runner.ts` — abort reason handling
5. `packages/gateway/src/agents/task-configs.ts` — system prompt addition
6. `packages/app/src/renderer/components/research/ResearchView.tsx` — enable compose during research

## Edge cases

- **Subagents finish before new LLM run starts:** `awaitTasks` returns immediately with results. No problem.
- **Multiple messages during one wait:** Each triggers an abort attempt. Only the first succeeds (subsequent ones hit a non-interruptible state during re-dispatch). Extra messages accumulate in DB and are picked up by `onThreadComplete`.
- **Agent not in awaitTasks when message arrives:** Falls through to existing queue behavior. Message processed after run completes.
- **Abort fails:** Falls through to existing queue behavior. No worse than current state.
