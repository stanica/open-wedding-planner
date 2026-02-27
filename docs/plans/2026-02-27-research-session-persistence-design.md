# Research Session Persistence Across Tab Switches

**Date:** 2026-02-27
**Problem:** When the user switches away from the Research tab while an agent is running, all session state (active session, live tool calls, pending permissions) is lost because it lives in React component state. When they switch back, it looks like the agent stopped, even though it's still running on the gateway.

## Approach: Zustand Store with App-Level Event Listener

Move agent session state out of `ResearchView` into a zustand store that persists across component mount/unmount cycles. The store subscribes to WebSocket events once at the app level.

### Scope

- Tab switching only (not app restart recovery)
- Full live state restoration: running indicator, tool call history, pending permissions

### New File: `packages/app/src/renderer/stores/research-store.ts`

**State:**
- `activeSession: string | null` — sessionKey of the running agent
- `liveToolCalls: { toolName: string; detail: string }[]` — accumulated tool calls for current session
- `pendingPermissions: PendingPermission[]` — permission requests awaiting user decision
- `completedAt: number | null` — timestamp bumped on agent-complete (used by component to trigger refetch)

**Actions:**
- `setActiveSession(key | null)` — sets session, flushes buffered permissions
- `addToolCall(toolName, detail)` — appends a tool call
- `addPermission(permission)` — adds a pending permission request
- `resolvePermission(requestId, decision)` — marks a permission as resolved
- `clearSession()` — resets activeSession, liveToolCalls, pendingPermissions; sets completedAt

**Event subscription:** The store subscribes to `wsClient.onEvent` once on creation (singleton pattern matching `wsClient` itself). Processes:
- `agent-activity` (action=tool-call) → `addToolCall()`
- `agent-complete` → `clearSession()` + set `completedAt`
- `research.permissionRequest` → `addPermission()` or buffer if no active session yet

**Buffered permissions:** Same race-condition handling as current code. If a permission event arrives before `activeSession` is set, it's buffered internally and flushed when `setActiveSession` is called.

### Changes to `ResearchView.tsx`

1. Remove local state: `activeSession`, `liveToolCalls`, `pendingPermissions`, `bufferedPermissions` ref
2. Remove the `useEffect` that subscribes to `wsClient.onEvent`
3. Read agent state from `useResearchStore()` selectors
4. Add `useEffect` watching `completedAt` → calls `refetchMessages()` + `refetchThreads()`
5. `handleSend` → calls `store.setActiveSession(result.sessionKey)` after dispatch
6. `handleStop` → calls `store.clearSession()` after stopping
7. `handlePermissionDecision` → calls `store.resolvePermission(requestId, decision)`
