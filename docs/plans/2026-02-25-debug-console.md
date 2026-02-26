# Debug Console Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dev-only debug console that shows agent activity, gateway logs, and WebSocket traffic in a separate Electron window, toggled via Cmd+Shift+D.

**Architecture:** Same-renderer hash route (`#/debug`) loaded in a secondary BrowserWindow. Gateway stdout/stderr forwarded via IPC. WebSocket client instrumented with a message hook for traffic observation. All log entries stored in a zustand store capped at 1000 entries.

**Tech Stack:** Electron (BrowserWindow, globalShortcut, ipcMain/ipcRenderer), React 19, zustand, Tailwind CSS v4, lucide-react

---

### Task 1: Add message hook to WsClient

**Files:**
- Modify: `packages/app/src/renderer/lib/ws-client.ts`

**Step 1: Add message listener set and hook methods to WsClient**

In `packages/app/src/renderer/lib/ws-client.ts`, add a message hook system alongside the existing event listeners. Add these members to the `WsClient` class:

```typescript
// Add after: private eventListeners = new Set<EventListener>();
private messageListeners = new Set<(direction: "sent" | "received", msg: unknown) => void>();
```

Add a public method to subscribe:

```typescript
// Add after the onEvent method
onMessage(listener: (direction: "sent" | "received", msg: unknown) => void): () => void {
  this.messageListeners.add(listener);
  return () => this.messageListeners.delete(listener);
}
```

**Step 2: Emit on send and receive**

In the `send` method, after `this.ws.send(JSON.stringify(msg))`, add:

```typescript
for (const listener of this.messageListeners) {
  listener("sent", msg);
}
```

In the `onmessage` handler (inside `doConnect`), after `const msg: ServerMessage = JSON.parse(event.data)`, add before `this.handleMessage(msg)`:

```typescript
for (const listener of this.messageListeners) {
  listener("received", msg);
}
```

**Step 3: Verify build**

Run: `cd packages/app && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds with no type errors

**Step 4: Commit**

```bash
git add packages/app/src/renderer/lib/ws-client.ts
git commit -m "feat(debug): add message hook to WsClient for traffic observation"
```

---

### Task 2: Add gateway log forwarding via IPC

**Files:**
- Modify: `packages/app/src/main/gateway-manager.ts`
- Modify: `packages/app/src/main/index.ts`
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/app/src/renderer/env.d.ts`

**Step 1: Add log buffer and forwarding to gateway-manager.ts**

In `packages/app/src/main/gateway-manager.ts`, add a log buffer and a way to send logs to a window:

```typescript
// Add at top, after existing imports
import type { BrowserWindow } from "electron";

// Add after: let gatewayProcess: ChildProcess | null = null;
const logBuffer: Array<{ level: "stdout" | "stderr"; line: string; timestamp: number }> = [];
const MAX_LOG_BUFFER = 500;
let debugWindow: BrowserWindow | null = null;

export function setDebugWindow(win: BrowserWindow | null) {
  debugWindow = win;
}

export function getLogBuffer() {
  return logBuffer;
}

function pushLog(level: "stdout" | "stderr", line: string) {
  const entry = { level, line, timestamp: Date.now() };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_BUFFER);
  }
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.webContents.send("gateway-log", entry);
  }
}
```

Then replace the existing stdout and stderr handlers in `spawnGateway()`:

In the `stdout` handler, after the existing `if (line.startsWith(GATEWAY_READY_PREFIX))` block, add an else:
```typescript
// After the if block that resolves the port:
} else {
  pushLog("stdout", line);
}
```

Replace the `stderr` handler body:
```typescript
gatewayProcess.stderr?.on("data", (data: Buffer) => {
  const line = data.toString().trim();
  console.error("[gateway]", line);
  pushLog("stderr", line);
});
```

**Step 2: Add IPC bridge in preload**

In `packages/app/src/preload/index.ts`, add a gateway log listener:

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getGatewayPort: (): Promise<number> => ipcRenderer.invoke("get-gateway-port"),
  onGatewayLog: (
    callback: (log: { level: "stdout" | "stderr"; line: string; timestamp: number }) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, log: { level: string; line: string; timestamp: number }) =>
      callback(log as { level: "stdout" | "stderr"; line: string; timestamp: number });
    ipcRenderer.on("gateway-log", handler);
    return () => ipcRenderer.removeListener("gateway-log", handler);
  },
  getGatewayLogBuffer: (): Promise<
    Array<{ level: "stdout" | "stderr"; line: string; timestamp: number }>
  > => ipcRenderer.invoke("get-gateway-log-buffer"),
});
```

**Step 3: Update type declarations**

In `packages/app/src/renderer/env.d.ts`:

```typescript
interface GatewayLogEntry {
  level: "stdout" | "stderr";
  line: string;
  timestamp: number;
}

interface ElectronAPI {
  getGatewayPort: () => Promise<number>;
  onGatewayLog: (callback: (log: GatewayLogEntry) => void) => () => void;
  getGatewayLogBuffer: () => Promise<GatewayLogEntry[]>;
}

interface Window {
  electronAPI: ElectronAPI;
}
```

**Step 4: Add IPC handler for log buffer in main process**

In `packages/app/src/main/index.ts`, add the IPC handler for fetching the log buffer. Add import at top:

```typescript
import { spawnGateway, stopGateway, getLogBuffer } from "./gateway-manager";
```

Add after the existing `ipcMain.handle("get-gateway-port", ...)`:

```typescript
ipcMain.handle("get-gateway-log-buffer", () => getLogBuffer());
```

**Step 5: Verify build**

Run: `cd packages/app && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add packages/app/src/main/gateway-manager.ts packages/app/src/main/index.ts packages/app/src/preload/index.ts packages/app/src/renderer/env.d.ts
git commit -m "feat(debug): forward gateway stdout/stderr via IPC with buffer"
```

---

### Task 3: Create debug log store

**Files:**
- Create: `packages/app/src/renderer/stores/debug-store.ts`

**Step 1: Create the zustand store**

Create `packages/app/src/renderer/stores/debug-store.ts`:

```typescript
import { create } from "zustand";

export type LogSource = "agent" | "gateway" | "ws";

export interface LogEntry {
  id: number;
  source: LogSource;
  timestamp: number;
  summary: string;
  detail?: unknown;
}

const MAX_ENTRIES = 1000;
let nextId = 0;

interface DebugStore {
  entries: LogEntry[];
  filter: LogSource | "all";
  searchQuery: string;
  autoScroll: boolean;
  push: (entry: Omit<LogEntry, "id">) => void;
  clear: () => void;
  setFilter: (filter: LogSource | "all") => void;
  setSearchQuery: (query: string) => void;
  setAutoScroll: (on: boolean) => void;
}

export const useDebugStore = create<DebugStore>((set) => ({
  entries: [],
  filter: "all",
  searchQuery: "",
  autoScroll: true,
  push: (entry) =>
    set((state) => {
      const newEntries = [...state.entries, { ...entry, id: nextId++ }];
      if (newEntries.length > MAX_ENTRIES) {
        return { entries: newEntries.slice(newEntries.length - MAX_ENTRIES) };
      }
      return { entries: newEntries };
    }),
  clear: () => set({ entries: [] }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setAutoScroll: (on) => set({ autoScroll: on }),
}));
```

**Step 2: Verify build**

Run: `cd packages/app && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/app/src/renderer/stores/debug-store.ts
git commit -m "feat(debug): add zustand store for debug log entries"
```

---

### Task 4: Create DebugConsole component

**Files:**
- Create: `packages/app/src/renderer/components/debug/DebugConsole.tsx`

**Step 1: Create the debug console component**

Create `packages/app/src/renderer/components/debug/DebugConsole.tsx`:

```tsx
import { useEffect, useRef, useCallback, useMemo } from "react";
import { wsClient } from "../../lib/ws-client";
import { useDebugStore, type LogSource } from "../../stores/debug-store";
import type { GatewayEvent } from "@wedding-planner/shared";

const SOURCE_COLORS: Record<LogSource, string> = {
  agent: "text-blue-400",
  gateway: "text-yellow-400",
  ws: "text-green-400",
};

const SOURCE_BG: Record<LogSource, string> = {
  agent: "bg-blue-400/10",
  gateway: "bg-yellow-400/10",
  ws: "bg-green-400/10",
};

const FILTER_OPTIONS: Array<{ value: LogSource | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agent" },
  { value: "gateway", label: "Gateway" },
  { value: "ws", label: "WebSocket" },
];

export function DebugConsole() {
  const { entries, filter, searchQuery, autoScroll, push, clear, setFilter, setSearchQuery, setAutoScroll } =
    useDebugStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Subscribe to agent events
  useEffect(() => {
    return wsClient.onEvent((event: GatewayEvent) => {
      if (event.name === "agent-activity") {
        push({
          source: "agent",
          timestamp: Date.now(),
          summary: `[${event.data.sessionKey}] ${event.data.action}`,
          detail: event.data.detail,
        });
      } else if (event.name === "agent-complete") {
        push({
          source: "agent",
          timestamp: Date.now(),
          summary: `[${event.data.taskId}] complete`,
          detail: event.data.summary,
        });
      } else {
        push({
          source: "agent",
          timestamp: Date.now(),
          summary: `event: ${event.name}`,
          detail: event.data,
        });
      }
    });
  }, [push]);

  // Subscribe to WebSocket traffic
  useEffect(() => {
    return wsClient.onMessage((direction, msg) => {
      const arrow = direction === "sent" ? "→" : "←";
      const msgObj = msg as Record<string, unknown>;
      push({
        source: "ws",
        timestamp: Date.now(),
        summary: `${arrow} ${msgObj.type ?? "unknown"}${msgObj.method ? `:${msgObj.method}` : ""}${msgObj.id ? ` #${msgObj.id}` : ""}`,
        detail: msg,
      });
    });
  }, [push]);

  // Subscribe to gateway logs
  useEffect(() => {
    // Load buffer first
    window.electronAPI.getGatewayLogBuffer().then((buffer) => {
      for (const log of buffer) {
        push({
          source: "gateway",
          timestamp: log.timestamp,
          summary: `[${log.level}] ${log.line}`,
        });
      }
    });

    // Then subscribe to live logs
    return window.electronAPI.onGatewayLog((log) => {
      push({
        source: "gateway",
        timestamp: log.timestamp,
        summary: `[${log.level}] ${log.line}`,
      });
    });
  }, [push]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, autoScroll]);

  // Pause auto-scroll on manual scroll up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (!atBottom && autoScroll) {
      setAutoScroll(false);
    }
  }, [autoScroll, setAutoScroll]);

  // Filter and search
  const filtered = useMemo(() => {
    let result = entries;
    if (filter !== "all") {
      result = result.filter((e) => e.source === filter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          (typeof e.detail === "string" && e.detail.toLowerCase().includes(q)) ||
          (e.detail && JSON.stringify(e.detail).toLowerCase().includes(q)),
      );
    }
    return result;
  }, [entries, filter, searchQuery]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 font-mono text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-gray-900 shrink-0">
        <div className="flex gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                filter === opt.value
                  ? "bg-white/15 text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <input
          type="text"
          placeholder="Filter..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder:text-gray-600 w-48 focus:outline-none focus:border-white/20"
        />

        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            autoScroll ? "text-green-400" : "text-gray-500 hover:text-gray-300"
          }`}
          title="Auto-scroll"
        >
          ↓ Auto
        </button>

        <button
          onClick={clear}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors"
        >
          Clear
        </button>

        <span className="text-gray-600 text-xs tabular-nums">{entries.length}</span>
      </div>

      {/* Log entries */}
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-1">
        {filtered.map((entry) => (
          <LogLine key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function LogLine({ entry }: { entry: { id: number; source: LogSource; timestamp: number; summary: string; detail?: unknown } }) {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-start gap-2 px-2 py-0.5 hover:bg-white/[0.02] group">
      <span className="text-gray-600 shrink-0 tabular-nums">{time}</span>
      <span
        className={`shrink-0 uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded ${SOURCE_COLORS[entry.source]} ${SOURCE_BG[entry.source]}`}
      >
        {entry.source === "ws" ? "WS" : entry.source.slice(0, 3).toUpperCase()}
      </span>
      <span className="text-gray-300 break-all">{entry.summary}</span>
      {entry.detail && (
        <details className="ml-auto text-gray-600 group-hover:text-gray-500 cursor-pointer">
          <summary className="text-[10px]">detail</summary>
          <pre className="text-[10px] text-gray-500 mt-1 max-w-lg overflow-x-auto whitespace-pre-wrap">
            {typeof entry.detail === "string" ? entry.detail : JSON.stringify(entry.detail, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd packages/app && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/debug/DebugConsole.tsx
git commit -m "feat(debug): add DebugConsole component with filtering and search"
```

---

### Task 5: Add /debug route

**Files:**
- Modify: `packages/app/src/renderer/App.tsx`

**Step 1: Add the debug route outside AppShell**

In `packages/app/src/renderer/App.tsx`, add a `/debug` route that renders outside the AppShell layout:

Add import at top:
```typescript
import { DebugConsole } from "./components/debug/DebugConsole";
```

Update the Routes to add the debug route as a sibling to the AppShell route:

```tsx
<HashRouter>
  <Routes>
    <Route path="debug" element={<DebugConsole />} />
    <Route element={<AppShell />}>
      <Route index element={<DashboardView />} />
      <Route path="research" element={<ResearchView />} />
      <Route path="vendors" element={<VendorListView />} />
      <Route path="vendors/:id" element={<VendorDetailView />} />
      <Route path="outreach" element={<OutreachView />} />
      <Route path="inbox" element={<InboxView />} />
      <Route path="timeline" element={<TimelineView />} />
      <Route path="budget" element={<BudgetView />} />
      <Route path="settings" element={<SettingsView />} />
    </Route>
  </Routes>
</HashRouter>
```

**Step 2: Verify build**

Run: `cd packages/app && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/app/src/renderer/App.tsx
git commit -m "feat(debug): add /debug route outside AppShell layout"
```

---

### Task 6: Add keyboard shortcut and debug window in main process

**Files:**
- Modify: `packages/app/src/main/index.ts`

**Step 1: Add debug window management**

In `packages/app/src/main/index.ts`, add imports and the debug window logic.

Update imports:
```typescript
import path from "node:path";
import { app, BrowserWindow, ipcMain, globalShortcut } from "electron";
import { spawnGateway, stopGateway, getLogBuffer, setDebugWindow } from "./gateway-manager";
import { createTray, destroyTray } from "./tray";
```

Add after `let isQuitting = false;`:
```typescript
let debugWindow: BrowserWindow | null = null;

function toggleDebugWindow() {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.close();
    debugWindow = null;
    setDebugWindow(null);
    return;
  }

  debugWindow = new BrowserWindow({
    width: 900,
    height: 500,
    title: "Debug Console",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setDebugWindow(debugWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    debugWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/debug`);
  } else {
    debugWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "debug",
    });
  }

  debugWindow.on("closed", () => {
    debugWindow = null;
    setDebugWindow(null);
  });
}
```

Inside `app.whenReady()`, after the `mainWindow.loadFile/loadURL` block, register the shortcut:

```typescript
globalShortcut.register("CommandOrControl+Shift+D", toggleDebugWindow);
```

In the `before-quit` handler, add cleanup before existing code:
```typescript
app.on("before-quit", async () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  destroyTray();
  await stopGateway();
});
```

**Step 2: Verify build**

Run: `cd packages/app && npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/app/src/main/index.ts
git commit -m "feat(debug): add Cmd+Shift+D shortcut to toggle debug window"
```

---

### Task 7: Manual end-to-end verification

**Step 1: Start the dev server**

Run: `cd packages/app && npm run dev`

**Step 2: Verify debug window opens**

Press `Cmd+Shift+D`. A new window should open with a dark terminal-style interface showing filter buttons (All / Agent / Gateway / WebSocket), a search input, auto-scroll toggle, and clear button.

**Step 3: Verify gateway logs appear**

Gateway startup logs should appear with yellow `GAT` tags. Any gateway stderr output shows as well.

**Step 4: Verify WebSocket traffic**

The debug console should show WS messages: `← challenge`, `→ challenge-response`, `← hello-ok` with green `WS` tags. Click "detail" to expand raw payloads.

**Step 5: Verify agent activity**

Trigger a research task from the main window. Agent activity events should appear with blue `AGE` tags showing the session key and action.

**Step 6: Verify filtering**

Click filter buttons to isolate each source. Type in the search box to filter entries. Verify clear button works.

**Step 7: Verify toggle**

Press `Cmd+Shift+D` again — the debug window should close.

**Step 8: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(debug): polish debug console after manual testing"
```
