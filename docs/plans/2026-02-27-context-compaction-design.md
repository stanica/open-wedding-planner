# Context Compaction Design

## Problem

The research chat sends the full conversation history to the model on every call with no token management. Long threads will eventually exceed the model's context window and error.

## Solution

After each agent run, check actual token usage (from the API response). If prompt tokens exceed 80% of the model's context window, automatically summarize the conversation using Sonnet and insert a compaction marker. Subsequent calls use the summary + new messages only.

## How It Works

1. After `generateText()` in `runner.ts`, check `usage.promptTokens` against 80% of the model's context window
2. If over threshold, call Sonnet with a summarization prompt to compress the conversation
3. Save a compaction marker to `research_messages` (role: `system`, content: summary)
4. Emit a `context-compacted` WebSocket event so the UI shows a notice
5. On subsequent sends, detect the marker and build messages as `[{role: "user", content: summary}] + [messages after marker]`

## Context Window Lookup

Derived from model name string — no DB/UI config needed:
- `opus` → 200,000 tokens
- `sonnet` → 1,000,000 tokens
- Default → 200,000 tokens

## Changes By File

### `packages/gateway/src/agents/model-provider.ts`
- Add `getContextWindowForModel(modelName: string): number` — lookup map
- Add `getSummarizationModel(): LanguageModel` — always returns Sonnet (same provider config)

### `packages/gateway/src/agents/runner.ts`
- Destructure `usage` from `generateText` result
- After run, if `usage.promptTokens > 0.8 * contextWindow`: call Sonnet with summarization prompt + full messages
- Return compaction summary in `AgentResult`

### `packages/gateway/src/agents/orchestrator.ts`
- After runner completes, if result includes compaction summary: save `role: "system"` message to `research_messages`, emit `context-compacted` event

### `packages/gateway/src/handlers/agents.ts`
- When building messages for `agent.research`, check for compaction marker. If found, send `[{role: "user", content: "Previous conversation summary: ..."}] + [messages after marker]`

### `packages/app/src/renderer/components/research/ResearchView.tsx`
- Listen for `context-compacted` event, refetch messages
- Detect `role: "system"` messages and render as compaction notice

### `packages/app/src/renderer/components/research/ChatMessage.tsx`
- Handle `role: "system"` with info-style banner rendering

## Deletions

- `packages/gateway/src/context/` — entire directory (unused, replaced by this)

## No Schema Changes

`research_messages.role` is a text column — we use `"system"` as a new value. No new tables or columns.
