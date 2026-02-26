# Debug Console Design

## Overview

Dev-only debug console for the wedding planner Electron app. Provides real-time visibility into agent activity, gateway logs, and WebSocket traffic. Accessed via `Cmd+Shift+D` which opens a separate Electron window.

## Approach

Same-renderer hash route (`#/debug`) loaded in a secondary BrowserWindow. Reuses existing React app, WebSocket client, and component infrastructure. The debug route renders outside the AppShell layout (no sidebar).

## Data Sources

### 1. Agent Activity
- Subscribe to `agent-activity` and `agent-complete` gateway events via `wsClient.onEvent()`
- Display: session key, action, detail, timestamp
- Already available — no gateway changes needed

### 2. Gateway Logs
- Capture stdout/stderr from the gateway child process in `gateway-manager.ts`
- Forward lines to the debug window via IPC (`webContents.send`)
- New preload API: `electronAPI.onGatewayLog(callback)`
- Buffer recent lines so the debug window shows history when opened

### 3. WebSocket Traffic
- Add a message hook to `WsClient` that emits raw sent/received messages
- Debug console subscribes to the hook to see all request/response/event payloads
- No server-side changes needed — instrumentation is client-side only

## UI Design

- Full-window, dark background, monospace font, terminal aesthetic
- **Toolbar**: filter buttons (All / Agent / Gateway / WebSocket), clear button, auto-scroll toggle, search/filter text input
- **Log entries**: timestamp | colored type tag | message content
  - JSON payloads expandable/collapsible
  - Color coding: blue for agent, yellow for gateway, green for WebSocket
- **Auto-scroll**: enabled by default, pauses when user scrolls up, resumes on click
- **Memory cap**: ~1000 entries max, oldest entries dropped

## Files Changed

| File | Change |
|------|--------|
| `packages/app/src/main/index.ts` | Register `Cmd+Shift+D` global shortcut, create/toggle debug BrowserWindow |
| `packages/app/src/main/gateway-manager.ts` | Buffer + forward stdout/stderr lines to debug window via IPC |
| `packages/app/src/preload/index.ts` | Add `onGatewayLog(callback)` IPC bridge |
| `packages/app/src/renderer/App.tsx` | Add `/debug` route outside AppShell |
| `packages/app/src/renderer/lib/ws-client.ts` | Add message hook for raw traffic observation |
| `packages/app/src/renderer/components/debug/DebugConsole.tsx` | **New** — main debug console component |

## Non-Goals

- Not user-facing — no polish, accessibility, or i18n needed
- No log persistence to disk (in-memory only)
- No remote debugging or external tool integration
