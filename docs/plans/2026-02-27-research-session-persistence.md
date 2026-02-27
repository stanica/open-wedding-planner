# Research Session Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make agent session state (running indicator, tool calls, pending permissions) survive tab switches by moving it from React component state to a zustand store.

**Architecture:** New zustand store (`research-store.ts`) holds all agent session state and subscribes to WebSocket events at the app level. `ResearchView` reads from the store instead of managing its own state.

**Tech Stack:** React 19, zustand, existing `wsClient` singleton

---

### Task 1: Create the research store

**Files:**
- Create: `packages/app/src/renderer/stores/research-store.ts`

**Step 1: Write the store**

```ts
import { create } from "zustand";
import { wsClient } from "../lib/ws-client";
import type { GatewayEvent } from "@wedding-planner/shared";

interface PendingPermission {
  requestId: string;
  toolName: string;
  toolDescription: string;
  context: string | undefined;
  resolved: string | null;
}

interface ResearchStore {
  activeSession: string | null;
  liveToolCalls: Array<{ toolName: string; detail: string }>;
  pendingPermissions: PendingPermission[];
  completedAt: number | null;

  setActiveSession: (key: string | null) => void;
  clearSession: () => void;
  resolvePermission: (requestId: string, decision: string) => void;
}

// Buffer for permission events that arrive before activeSession is set
let bufferedPermissions: Array<{ sessionKey: string; data: GatewayEvent["data"] }> = [];

export const useResearchStore = create<ResearchStore>((set, get) => ({
  activeSession: null,
  liveToolCalls: [],
  pendingPermissions: [],
  completedAt: null,

  setActiveSession: (key) => {
    set({ activeSession: key });
    if (key) {
      const matching = bufferedPermissions.filter((b) => b.sessionKey === key);
      bufferedPermissions = [];
      if (matching.length > 0) {
        set((state) => ({
          pendingPermissions: [
            ...state.pendingPermissions,
            ...matching.map((b) => {
              const d = b.data as any;
              return {
                requestId: d.requestId,
                toolName: d.toolName,
                toolDescription: d.toolDescription,
                context: d.context,
                resolved: null,
              };
            }),
          ],
        }));
      }
    }
  },

  clearSession: () =>
    set({
      activeSession: null,
      liveToolCalls: [],
      pendingPermissions: [],
      completedAt: Date.now(),
    }),

  resolvePermission: (requestId, decision) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.map((p) =>
        p.requestId === requestId ? { ...p, resolved: decision } : p,
      ),
    })),
}));

// Subscribe to WebSocket events once (app-level, survives component unmounts)
wsClient.onEvent((event: GatewayEvent) => {
  const { activeSession } = useResearchStore.getState();

  if (event.name === "agent-activity" && event.data.sessionKey === activeSession) {
    if (event.data.action === "tool-call" && event.data.detail) {
      useResearchStore.setState((state) => ({
        liveToolCalls: [
          ...state.liveToolCalls,
          { toolName: event.data.detail!.split(":")[0], detail: event.data.detail! },
        ],
      }));
    }
  }

  if (event.name === "agent-complete" && activeSession) {
    useResearchStore.getState().clearSession();
  }

  if (event.name === "research.permissionRequest") {
    const data = event.data;
    if (data.sessionKey === activeSession) {
      useResearchStore.setState((state) => ({
        pendingPermissions: [
          ...state.pendingPermissions,
          {
            requestId: data.requestId,
            toolName: data.toolName,
            toolDescription: data.toolDescription,
            context: data.context,
            resolved: null,
          },
        ],
      }));
    } else if (!activeSession) {
      bufferedPermissions.push({ sessionKey: data.sessionKey, data: event.data });
    }
  }
});
```

**Step 2: Verify the store module imports cleanly**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `research-store.ts`

**Step 3: Commit**

```bash
git add packages/app/src/renderer/stores/research-store.ts
git commit -m "feat: add research store for agent session persistence across tab switches"
```

---

### Task 2: Refactor ResearchView to use the store

**Files:**
- Modify: `packages/app/src/renderer/components/research/ResearchView.tsx`

**Step 1: Replace local state with store**

Replace the imports and local state block (lines 1-71) with:

```ts
import { useState, useEffect, useRef } from "react";
import { Square, Wrench } from "lucide-react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { useVendors } from "../../hooks/useVendors";
import { useResearchStore } from "../../stores/research-store";
import { ThreadList } from "./ThreadList";
import { ChatMessage } from "./ChatMessage";
import { ComposeBox } from "./ComposeBox";
import { PermissionRequestCard } from "./PermissionRequestCard";
```

Remove these interfaces from the file (they now live in the store):
- `PendingPermission` interface (lines 29-35)

Remove these local state declarations from inside the component:
- `activeSession` / `_setActiveSession` / `activeSessionRef` / `setActiveSession` wrapper (lines 39-64)
- `pendingPermissions` (line 65)
- `liveToolCalls` (lines 66-68)
- `bufferedPermissions` ref (line 71)

Add store access at the top of the component:

```ts
const {
  activeSession,
  liveToolCalls,
  pendingPermissions,
  completedAt,
  setActiveSession,
  clearSession,
  resolvePermission,
} = useResearchStore();
```

**Step 2: Remove the WebSocket useEffect**

Delete the entire `useEffect` block at lines 109-150 (the one that calls `wsClient.onEvent`). The store handles this now.

**Step 3: Add completedAt watcher for refetching**

Add this `useEffect` after the auto-scroll effect:

```ts
// Refetch data when agent completes (even if we were on another tab)
useEffect(() => {
  if (completedAt) {
    refetchMessages();
    refetchThreads();
  }
}, [completedAt, refetchMessages, refetchThreads]);
```

**Step 4: Update handler functions**

`handleSend` (line 197-198): already calls `setActiveSession` — no change needed, the function name matches.

`handleStop` — simplify to use `clearSession()`:

```ts
async function handleStop() {
  if (activeSession) {
    await stopAgent({ sessionKey: activeSession });
    clearSession();
    refetchMessages();
  }
}
```

`handlePermissionDecision` — use store's `resolvePermission`:

```ts
async function handlePermissionDecision(
  requestId: string,
  decision: "allow" | "always-allow" | "deny",
) {
  await respondPermission({ requestId, response: decision });
  resolvePermission(requestId, decision);
}
```

**Step 5: Update thread selection handler**

In the `onSelect` callback for `ThreadList` (lines 261-266), replace the local state calls:

```ts
onSelect={(id) => {
  setActiveThreadId(id);
  clearSession();
}}
```

**Step 6: Remove unused imports**

Remove `useCallback` from the React import (line 1) — it's not used.
Remove `wsClient` import (line 3) — no longer needed in this file.
Remove the `GatewayEvent` type import (line 10) — no longer needed in this file.

**Step 7: Update auto-scroll dependencies**

The auto-scroll `useEffect` (line 105-107) references `activeSession` and `liveToolCalls` which now come from the store. No code change needed — the destructured values are the same variable names.

Remove `researching` from the auto-scroll dependency array since it's a transient loading state from `useMutation` (fires briefly during the HTTP request, not during the agent run). The `activeSession` value covers the running state.

**Step 8: Verify types compile**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

**Step 9: Commit**

```bash
git add packages/app/src/renderer/components/research/ResearchView.tsx
git commit -m "refactor: use research store in ResearchView for tab-switch persistence"
```

---

### Task 3: Manual smoke test

**Step 1: Start the app**

Run: `npm run dev` (from repo root)

**Step 2: Test tab-switch persistence**

1. Go to Research tab
2. Start a research query (e.g. "find florists in Tuscany")
3. Wait for tool calls to start appearing
4. Switch to another tab (e.g. Vendors)
5. Switch back to Research tab
6. **Verify:** tool calls are still visible, running indicator is showing, stop button works

**Step 3: Test completion while away**

1. Start another research query
2. Switch to another tab immediately
3. Wait ~30 seconds for the agent to complete
4. Switch back to Research tab
5. **Verify:** the assistant's response message appears in the thread

**Step 4: Test permission requests**

1. Start a research query that triggers a permission prompt
2. Switch away before responding
3. Switch back
4. **Verify:** the permission card is still visible and functional

**Step 5: Commit (if any fixes were needed)**
