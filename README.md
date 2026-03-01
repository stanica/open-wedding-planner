# Open Wedding Planner

An AI-powered Electron desktop app for planning a wedding. It combines vendor research, budget tracking, WhatsApp messaging, and an agentic AI backend into a single application that runs entirely on your machine.

## Features

### AI Research

Chat with an AI agent in persistent research threads. The agent can search the web (DuckDuckGo by default, Brave Search optional), scrape vendor websites, parse PDFs, and automatically create vendor records with images. For JavaScript-heavy sites it spawns a headless Chromium browser subagent that can navigate, click, scroll, and extract content. Multiple browser subagents can run in parallel.

Slash commands in the research chat:

- `/compact` — summarize the conversation to free up context window
- `/clear` — wipe all messages in the thread
- `/model <name>` — switch the AI model mid-session

### Vendor Management

Track vendors by category (Venue, Food/Beverage, Photography, etc.) with status progression: `researched → contacted → quoted → booked` (or `rejected`). Each vendor has a detail page with contact info, quotes, a photo gallery, custom attributes, and a linked WhatsApp/email conversation thread. The list view supports grid and table modes, filtering by category/status/favorites, and sorting.

### Budget

Category-based budget allocation with quote line items and actual spend tracking. A summary bar shows total budget, committed spend, and remaining balance.

### WhatsApp

Connect your personal WhatsApp account via QR code scan (uses the Baileys library — no WhatsApp Business API required). Send and receive messages with vendors directly from the app. Outbound messages can be sent immediately or queued as drafts for approval before sending. Incoming messages are linked to vendor records.

You can also interact with the research agent by sending messages to yourself on WhatsApp. Use `/new` to start a new research thread and `/status` to check the delivery queue.

### Outreach Agent

Dispatch an AI agent to draft and send outreach messages to vendors. Supports WhatsApp and Gmail (via the `gog` CLI, auto-downloaded on first use). Drafts can be reviewed and approved before sending.

### Inbox

Unified view of all incoming vendor communications across channels.

### Timeline

Task and milestone tracking for the wedding.

### Semantic Search

Vector embeddings (OpenAI `text-embedding-3-small`) stored in SQLite via `sqlite-vec`. Used by agents to search across vendors and research notes.

### Cloudflare Tunnel

Expose the local gateway to the internet via a temporary `trycloudflare.com` URL — no account or port forwarding required. Toggle on/off from Settings. The URL is shown and copyable in the UI.

### CSV Import

Import vendor and budget data from CSV files.

### Debug Console

Press `Cmd+Shift+D` (or `Ctrl+Shift+D`) to open a live stream of gateway logs.

### Web UI Mode

The gateway also serves the React frontend as static files, so you can open the app in a browser without Electron (useful for remote access via the tunnel).

---

## Architecture

This is an npm workspaces monorepo with three packages:

```
packages/
  shared/    # Shared TypeScript types, Zod schemas, and constants
  gateway/   # Node.js backend — WebSocket server, SQLite DB, AI agents, tools
  app/       # Electron shell — main process + React renderer
```

The Electron main process spawns the gateway as a child Node.js process (using the system `node` binary, not Electron's, so native modules like `better-sqlite3` work correctly). The renderer connects to the gateway over a local WebSocket with challenge-response authentication. The gateway handles all data, AI, and messaging logic and broadcasts real-time events back to the UI.

All persistent data lives in `~/.wedding-planner/`:

- `data.db` — SQLite database
- `whatsapp-auth/` — Baileys session credentials
- `images/` — downloaded vendor photos
- `delivery-queue/` — outbound message queue (survives restarts)
- `workspace/` — agent working directory for the `cmd` tool
- `bin/` — auto-downloaded `gog` CLI binary

---

## Prerequisites

- **Node.js 22+**
- **Playwright Chromium** — required for the browser subagent tool:
  ```bash
  npx playwright install chromium
  ```

---

## Setup

```bash
# Install all dependencies (also auto-downloads the cloudflared binary via postinstall)
npm install

# Build the shared package (required before running anything else)
npm run build -w @wedding-planner/shared
```

---

## Development

Start all packages in watch mode:

```bash
npm run dev
```

Or individually:

```bash
npm run dev:shared    # tsc --watch for shared types
npm run dev:gateway   # tsup --watch for the gateway
npm run dev:app       # electron-vite dev (opens Electron window)
```

---

## Building & Packaging

```bash
# Compile all packages
npm run build

# Package the Electron app into a distributable
npm run package -w @wedding-planner/app
```

The `package` script:

1. Copies the Playwright headless shell into `packages/app/browsers/` (run `npx playwright install chromium` first)
2. Downloads the `cloudflared` binary into `packages/app/cloudflared/`
3. Builds all packages
4. Runs `electron-builder`

Output targets: macOS DMG (arm64 + x64), Windows NSIS installer (x64), Linux AppImage (x64).

---

## Configuration

Everything is configured through the in-app Settings screen and stored in the SQLite database.

| Section          | What it does                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wedding Config   | Date, guest count, total budget, currency, couple names, location, language preferences, dietary/alcohol notes                                                                          |
| AI Provider      | Choose between **Anthropic API key** (or `claude setup-token` OAuth token) and **Claude Max Proxy** (requires Claude Code CLI). Default model: `claude-sonnet-4-20250514`.              |
| OpenAI API Key   | Separate key for semantic search embeddings (`text-embedding-3-small`). Optional — semantic search is disabled without it.                                                              |
| Search Provider  | **DuckDuckGo** (default, no key needed) or **Brave Search** (requires a Brave Search API key).                                                                                          |
| Heartbeat        | Optional scheduled agent that runs on a configurable interval (default 30 min). Runs health checks (stalled tasks, unparsed messages) and optionally executes a custom research prompt. |
| Tool Permissions | Per-tool approval settings — control which agent tools require explicit user confirmation before running.                                                                               |
| Guardrails       | Safety rules applied to agent outputs.                                                                                                                                                  |
| Integrations     | WhatsApp QR code setup, auto-send toggle, Google Services (Gmail via `gog` CLI).                                                                                                        |
| Internet Tunnel  | Start/stop the Cloudflare tunnel.                                                                                                                                                       |
| Data Management  | Export or clear application data.                                                                                                                                                       |

### AI Provider: Claude Max Proxy

If you have a Claude Max subscription, you can use it instead of an API key:

1. Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. Authenticate: `claude auth login`
3. Select "Claude Max Proxy" in Settings → AI Provider

Note: Claude Max proxy mode runs in text-only mode (no tool support for the main agent).

### AI Provider: Anthropic API Key

Standard `sk-ant-api03-...` keys work. You can also use a setup token generated from a Max/Pro subscription via `claude setup-token` (these start with `sk-ant-oat`).

---

## Tests

```bash
npm test
```

292 tests across 54 files in `packages/gateway/`, using Vitest.

## Type Checking

```bash
npm run typecheck
```
