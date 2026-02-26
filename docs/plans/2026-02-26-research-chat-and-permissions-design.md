# Research Chat & Tool Permissions Design

## Problem

The research tab has a single input box that fires off a one-shot search. There's no way to ask follow-up questions, compare results, or build on previous findings. The agent also can't use web tools without hardcoded access — there's no way for users to grant or deny tool permissions.

Meanwhile, wedding planning research is inherently conversational and iterative: "find me villas in Ischia" → "what about pricing for Villa Rosa?" → "compare the top 3 on price" → "draft an email to the cheapest one." The research tab should support this full flow.

## Goals

1. Transform the research tab into a persistent, threaded chat interface
2. Surface vendor results, pricing, and comparisons inline in the conversation
3. Add a runtime tool permission system (inline approval cards)
4. Build a central tool registry for clean tool management
5. Enable cross-tab actions from chat (outreach drafts, status updates, budget entries)

## Non-Goals

- Token-by-token streaming (keeping `generateText()` for now)
- Split-pane/sidebar layouts
- User-defined custom tools
- Collaboration features (multi-user)

---

## Design

### 1. Chat Thread Layout

```
+------------------+-------------------------------------------+
| Threads          | Chat Thread                               |
|                  |                                           |
| [Villas Ischia]  |  You                                      |
| [Photographers]  |  Find me villas in Ischia for 80 guests   |
| [Catering]       |                                           |
|                  |  Assistant                                |
|                  |  I'll search for villas in Ischia...      |
|                  |                                           |
|                  |  [search] "wedding villas Ischia 80..."   |
|                  |  [scrape] villarosa-ischia.it             |
|                  |  [+vendor] Villa Rosa                     |
|                  |                                           |
|                  |  Found 3 villas. Villa Rosa is the most   |
|                  |  affordable at EUR 8,000 but Botanica     |
|                  |  offers more capacity...                  |
|                  |                                           |
|                  |  +------+----------+-----------+--------+ |
|                  |  | Villa Rosa       | EUR 8,000 | View > | |
|                  |  | Ischia Porto, up to 100 guests        | |
|                  |  +------+----------+-----------+--------+ |
|                  |  | Villa Botanica   | EUR 12,500| View > | |
|                  |  | Forio, up to 120 guests               | |
|                  |  +------+----------+-----------+--------+ |
|                  |  | Castello Aragon. | POA       | View > | |
|                  |  | Ischia Ponte, up to 80 guests         | |
|                  |  +------+----------+-----------+--------+ |
|                  |                                           |
|                  +-----------------------------------------+ |
|                  | Ask about vendors, venues, pricing...    | |
| [+ New thread]   |                                  [Send] | |
|                  +-----------------------------------------+ |
+------------------+-------------------------------------------+
```

**Thread list (left sidebar, collapsible):**
- Shows thread title (auto-generated from first message) + last activity time
- Auto-tagged with vendor categories found in the thread
- "+ New thread" button at the bottom
- Sorted by most recent activity

**Chat thread (center):**
- Standard top-to-bottom message flow
- User messages and assistant messages with clear visual distinction
- Tool activity as compact inline cards within assistant messages
- Vendor results as rich cards with price prominent
- Auto-scrolls to latest message

**Compose box (bottom):**
- Text input with Enter to send, Shift+Enter for newlines
- Disabled while agent is executing
- Placeholder: "Ask about vendors, venues, pricing..."

### 2. Message Types

The chat thread renders these content types:

**User messages** — plain text with "You" label.

**Assistant messages** — markdown-rendered text with the following inline elements:

**Tool activity cards** (compact, one line each, expandable on click):
- Search: `[search] "wedding villas Ischia 80 guests"`
- Scrape: `[scrape] villarosa-ischia.it`
- Browse: `[browse] villarosa-ischia.it (JS)`
- PDF: `[pdf] menu-brochure.pdf`
- Create vendor: `[+vendor] Villa Rosa` (always visible, not collapsed)
- Draft outreach: `[+draft] Email to Villa Rosa`
- Other tool calls follow the same `[toolname] detail` pattern

Collapsed by default (except vendor creation). Clicking expands to show inputs and results.

**Vendor result cards** — rich inline cards showing:
- Vendor name (bold)
- Price (prominent, bold — the #1 data point users care about). "POA" if not found.
- Location + capacity on second line
- One-line description
- [View >] link navigating to `/vendors/:id`
- When multiple vendors, stacked in a card group

**Brief comparison summaries** — when multiple vendors are found, the agent auto-generates a short text comparison ("Villa Rosa is cheapest but smallest, Botanica offers the most space..."). Full comparison tables rendered only when the user asks.

**Permission request cards** — see section 3.

**Error/warning cards** — when tools fail (site unreachable, permission denied, etc.).

### 3. Tool Permission System

**Default state:** All tools start as `prompt` (ask before first use).

**Runtime inline approval flow:**

When the agent tries to use a tool that hasn't been approved, execution pauses and a permission card appears inline in the chat:

```
+------------------------------------------------+
| Permission Request                              |
|                                                 |
| Web Search                                      |
| Search the web for wedding venues and vendors   |
|                                                 |
| [Allow once]  [Always allow]  [Deny]            |
+------------------------------------------------+
```

After the user decides, the card updates to show the decision:

```
+------------------------------------------------+
| Web Search — Always allowed                     |
+------------------------------------------------+
```

**Three decisions:**
- **Allow once** — grants for this execution only, not persisted
- **Always allow** — persisted to DB, never asks again
- **Deny** — agent told tool is unavailable, must find alternatives

**Implementation flow:**
1. Agent calls a tool via `generateText()`
2. The registry's permission wrapper intercepts before `execute`
3. If `allow` → proceed silently
4. If `deny` → return error result to model ("tool not permitted")
5. If `prompt` → emit `permission-request` WebSocket event, pause execution
6. UI renders inline card, user clicks a button
7. UI sends decision back via WebSocket
8. Orchestrator resumes or skips based on decision
9. If "Always allow", persist to `toolPermissions` table

**Settings page integration:**
- New section in Settings showing all registered tools with current permission state
- Toggle to revoke "Always allow" back to "prompt"
- Grouped by tool category (web, database, communication)

### 4. Tool Registry

A central registry replaces direct tool imports in agents.

```typescript
// packages/gateway/src/tools/registry.ts

interface ToolRegistration {
  name: string;             // unique key, e.g. "search"
  description: string;      // human-readable, shown in permission UI
  category: string;         // "web" | "database" | "communication" | "utility"
  tool: AiTool;             // the Vercel AI SDK tool() instance
}

class ToolRegistry {
  register(registration: ToolRegistration): void
  get(name: string): ToolRegistration | undefined
  getByCategory(category: string): ToolRegistration[]
  getToolSet(names: string[]): Record<string, AiTool>  // returns tools object for generateText()
  listAll(): ToolRegistration[]                          // for settings UI
}
```

**Agent tool sets** — each agent type has a curated list of tool names it uses:

| Agent | Tools |
|-------|-------|
| research | search, scrape, browse, parsePdf, createVendor, updateVendorStatus, draftOutreach, addBudgetEntry |
| outreach | (no change — uses generateText without tools) |
| parse | (no change) |
| translation | (no change) |

The registry wraps each tool's `execute` with permission checking before returning the tool set.

**Adding a new tool:**
1. Create `packages/gateway/src/tools/my-tool.ts` with a `tool()` definition
2. Register it in `packages/gateway/src/tools/index.ts`
3. Add the tool name to the relevant agent's curated set

Context-dependent tools (like `createVendor` which needs DB access) use factory functions that receive `AgentContext` and return a tool. The registry supports both static tools and factory functions.

### 5. Persistent Threads

**New DB tables:**

```sql
researchThreads
  id          INTEGER PRIMARY KEY
  title       TEXT NOT NULL          -- auto-generated from first message
  categoryTags TEXT                  -- JSON array of category names found
  createdAt   TEXT NOT NULL
  updatedAt   TEXT NOT NULL

researchMessages
  id          INTEGER PRIMARY KEY
  threadId    INTEGER NOT NULL REFERENCES researchThreads(id)
  role        TEXT NOT NULL          -- "user" | "assistant"
  content     TEXT NOT NULL          -- the text content (markdown)
  toolCalls   TEXT                   -- JSON array of {toolName, args, result}
  vendorIds   TEXT                   -- JSON array of vendor IDs created/referenced
  createdAt   TEXT NOT NULL
```

**Modified tables:**

```sql
vendors (add column)
  threadId    INTEGER REFERENCES researchThreads(id)  -- source research thread

toolPermissions (new)
  id          INTEGER PRIMARY KEY
  toolName    TEXT NOT NULL UNIQUE
  decision    TEXT NOT NULL DEFAULT 'prompt'  -- "allow" | "deny" | "prompt"
  updatedAt   TEXT NOT NULL
```

**Conversation context management:**
- Full message history (user + assistant messages with tool results) sent to `generateText()` on each turn
- Messages stored after each agent response completes
- For now, no compaction — threads are unlikely to exceed context limits in normal use
- Future optimization: summarize older messages if thread gets very long

### 6. Cross-Tab Agent Actions

The research agent gains access to tools that touch other parts of the app:

**draftOutreach** — creates a communication record with `status: "draft"`, `direction: "out"`. Appears in the Outreach tab for review. The agent needs vendorId (from a vendor it created or the user referenced) and the channel (email/whatsapp).

**updateVendorStatus** — changes a vendor's status (researched → prospect → contacted, etc.). Reflected immediately in the Vendors tab.

**addBudgetEntry** — creates a budget entry linked to a vendor and category. Appears in the Budget tab. Used when the agent finds pricing information.

Each of these tools is subject to the permission system. Users can deny cross-tab actions if they prefer to do those manually.

### 7. Event Flow

**Current flow:**
```
user submits query
  → agent.research RPC → fire-and-forget
  → agent-activity events (searching, found, creating-vendor, complete)
  → agent-complete event
```

**New flow:**
```
user sends message in thread
  → research.sendMessage RPC (threadId, content)
  → user message saved to researchMessages
  → agent starts executing with full thread history as context
  → per-tool: permission check
    → if prompt needed: permission-request event → UI renders card → user decides → resume
  → tool-activity events (for inline cards)
  → agent response complete
  → assistant message saved to researchMessages (with toolCalls, vendorIds)
  → research.messageComplete event (UI appends assistant message to thread)
```

**New WebSocket events:**
- `research.messageComplete` — assistant finished, message saved
- `research.toolActivity` — tool started/completed (for inline cards)
- `research.permissionRequest` — agent needs permission for a tool
- `research.permissionResponse` — user granted/denied (sent from UI to gateway)

### 8. New RPC Handlers

```
research.threads.list      → list all threads (id, title, categoryTags, updatedAt)
research.threads.create    → create new thread, return threadId
research.threads.delete    → delete thread + cascade messages
research.messages.list     → list messages for a thread
research.sendMessage       → send user message, trigger agent execution
research.abort             → cancel running agent execution

tools.list                 → list all registered tools (for settings UI)
tools.permissions.list     → list all tool permissions
tools.permissions.update   → update a tool's permission (for settings + inline cards)
```

### 9. Frontend Components

**New components:**
- `ResearchChatView` — main container, replaces current `ResearchView`
- `ThreadList` — sidebar listing threads
- `ChatThread` — scrollable message list
- `ChatMessage` — renders a single message (user or assistant)
- `ToolActivityCard` — compact inline tool indicator (expandable)
- `VendorResultCard` — rich vendor card with price, location, [View >]
- `PermissionRequestCard` — inline permission approval UI
- `ComposeBox` — text input at bottom
- `ToolPermissionsSettings` — settings page section for managing permissions

**Modified components:**
- `ResearchInput` — removed (replaced by ComposeBox)
- `AgentActivityStream` — removed (replaced by inline tool cards in ChatMessage)

---

## Data Flow Diagram

```
Research Tab (Chat)
  |
  | user sends message
  v
Gateway: research.sendMessage
  |
  | save user message to researchMessages
  | load thread history
  | get agent's curated tool set from registry
  | wrap tools with permission checks
  v
Orchestrator: dispatch research agent
  |
  | generateText() with tools + conversation history
  |
  +---> Tool call intercepted
  |       |
  |       | Check toolPermissions table
  |       |
  |       +---> "allow" → execute tool
  |       +---> "deny"  → return error to model
  |       +---> "prompt" → emit permission-request event
  |                          |
  |                          | UI shows inline card
  |                          | User clicks Allow/Deny
  |                          | UI sends permission-response
  |                          |
  |                          +---> execute or skip
  |
  | Tool results: search results, scraped data, vendor created, etc.
  | emit tool-activity events → UI renders inline cards
  |
  v
Agent response complete
  |
  | save assistant message to researchMessages
  | (includes content, toolCalls JSON, vendorIds JSON)
  | update thread title/categoryTags if needed
  | emit research.messageComplete event
  v
UI appends assistant message to chat thread
  |
  | Vendor cards link to /vendors/:id
  | Outreach drafts appear in Outreach tab
  | Budget entries appear in Budget tab
  | Vendor status changes reflected in Vendors tab
```
