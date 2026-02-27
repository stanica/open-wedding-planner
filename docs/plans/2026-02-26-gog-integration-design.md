# Google Services Integration via gog CLI

## Problem

The current Gmail implementation (`GmailChannel`, `gmail-auth` handlers, `GmailSetup.tsx`) uses the `googleapis` npm package with a custom OAuth flow. It's fully built but never wired up — handlers aren't registered, the channel isn't instantiated, and no credentials are configured. Rather than completing this heavy implementation, we replace it with the `gog` CLI tool, which provides a single binary for all Google Workspace services.

## Decision: gog CLI over googleapis

- **gog** is a standalone Go binary (~20MB) covering Gmail, Calendar, Drive, Contacts, Tasks, Sheets, Docs
- Tokens stored in OS keyring (macOS Keychain, Linux Secret Service)
- JSON output via `--json` flag, script-friendly
- Two-step remote auth flow (`--remote --step 1/2`) enables seamless UI integration
- One binary, one auth — adding Calendar/Drive later is free

## Architecture

### 1. Binary Manager — `GogManager`

New class at `packages/gateway/src/infra/gog-manager.ts`.

**Responsibilities:**
- Check if `~/.wedding-planner/bin/gog` exists and matches expected version
- If missing/outdated, download platform-correct binary from GitHub releases (`gogcli_<version>_<os>_<arch>.tar.gz`)
- Extract, `chmod +x`, write `.version` file
- Expose `getBinPath(): string` for other components
- Run at gateway startup so the binary is ready before agents need it

**Platform detection:** `process.platform` (darwin/linux/win32) + `process.arch` (arm64/x64) → maps to release asset name.

### 2. Settings UI — `GoogleServicesSetup`

Replaces `GmailSetup.tsx` with a new component at `packages/app/src/renderer/components/settings/GoogleServicesSetup.tsx`.

**Flow:**
1. **Upload credentials** — User drags/drops or pastes their `client_secret.json` from Google Cloud Console. Saved to `~/.wedding-planner/google-credentials.json`. Backend runs `gog auth credentials <path>`.
2. **Pick services** — Checkboxes: Gmail, Calendar, Contacts, Drive, etc. Determines `--services` flag.
3. **Connect** — Click "Connect Google Account":
   - Backend runs `gog auth add <email> --services <list> --remote --step 1`
   - Captures auth URL from stdout
   - Spins up temporary localhost HTTP server to catch OAuth redirect
   - Opens auth URL in user's default browser
   - User clicks "Allow" in Google consent screen
   - Google redirects to localhost callback with auth code
   - Backend runs `gog auth add <email> --remote --step 2 --auth-url <callback_url>`
   - Tokens stored in OS keyring by gog
4. **Status** — Shows connected account email + authorized services. Disconnect via `gog auth remove`.
5. **Auto-send toggle** — "Allow agents to send emails/create events without approval" (mirrors `whatsappAutoSend`)

### 3. Agent Tool — `gog`

Registered in the tool registry as a factory tool (needs runtime context).

**Design:**
- **Name:** `gog`
- **Description:** Dynamically generated — includes which services are connected so the agent knows its capabilities
- **Input schema:** `{ subcommand: string, args: string[] }`
  - Example: `{ subcommand: "gmail", args: ["search", "is:unread newer_than:1d", "--max", "10"] }`
- **Auto-injected flags:** `--json`, `--account <email>` (from config)
- **Only registered when connected** — if no Google account is linked, tool doesn't exist. Agents can't hallucinate about unavailable capabilities.

**Permission split:**
- **Auto-approve reads:** subcommands containing `search`, `list`, `get`, `labels`, `events list`, `threads`, etc.
- **Require approval for writes:** `send`, `create`, `delete`, `update`, `modify`, `trash`
- During **heartbeat (autonomous)** runs: if `googleAutoSend` is on, writes are auto-approved. If off, agent creates a draft `communications` record instead.
- During **interactive** (user at UI) runs: writes go through `permissionCallbacks.requestPermission()`.

### 4. Email Sending — Two Paths

**Path A: UI-Initiated (Vendor Page)**
- "Email Vendor" button on vendor header/detail page
- Shows intent suggestions: Request Quote, Follow Up, Confirm Booking, Ask Availability + free-text input
- Spawns an agent task that:
  - Fetches vendor details, wedding config, prior communications via `dbQuery`
  - Drafts email using user's intent + context
  - Presents draft for user review
  - On approval, sends via `gog gmail send`
  - Creates `communications` record

**Path B: Agent-Initiated (Research Tab)**
- Agent decides during conversation that it needs to email a vendor
- Self-serves context via existing `dbQuery`/`dbSchema` tools
- Sends via the `gog` tool (subject to auto-send toggle / permission approval)
- Creates `communications` record

### 5. Database Changes

New `googleConfig` table:

```
googleConfig:
  id            INTEGER PRIMARY KEY
  accountEmail  TEXT        — connected Google account
  services      TEXT        — comma-separated: "gmail,calendar,contacts"
  credentialsPath TEXT      — path to client_secret.json
  autoSend      INTEGER     — 0 or 1, controls autonomous write approval
```

### 6. Cleanup

Remove:
- `packages/gateway/src/channels/gmail.ts`
- `packages/gateway/src/handlers/gmail-auth.ts`
- `packages/app/src/renderer/components/settings/GmailSetup.tsx`
- `googleapis` npm dependency from `packages/gateway/package.json`
- Any references to `GmailChannel` in gateway startup or handler registration

Keep:
- `communications` table — already supports `channel: "gmail"`, used by both send paths
