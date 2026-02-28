# Messaging UI Overhaul Design

## Summary

Redesign the three messaging surfaces (Outreach, Inbox, Vendor Communications) into purpose-built views with shared components. Outreach becomes a WhatsApp chat UI, Inbox becomes a Gmail-like email view with AI actions, and Vendor Communications becomes an aggregated timeline.

## Architecture: Shared Components, Separate Views

All three views read from the same `communications` table with different filters. A shared set of primitives keeps rendering consistent.

## Data Layer & Backend

### Fixes to `communications.list`

Replace the `if/else if` filter chain in `communications.ts` handler with compound AND filtering. Support passing `{ direction, channel, status, vendorId }` simultaneously.

### New handler: `communications.listByVendor`

Returns all communications for a vendor, ordered chronologically. Used by the Vendor Communications tab.

### New handler: `agent.action`

Spawns a short-lived agent with access to tools (`dbQuery`, vendor CRUD, `gog`, `sendWhatsApp`). Receives a communication + user instruction as context. Used by the AgentSidePanel.

### Emit missing WebSocket events

- `communication-received` — when incoming WhatsApp/email arrives
- `draft-ready` — when outreach agent creates a draft

## Shared Components

### `MessageBubble`

Renders a single communication. Channel icon, sender, timestamp, body. Outbound aligns right (tinted bg), inbound aligns left. Handles short WhatsApp messages and longer emails (truncated with expand).

### `ContactList`

Vertical list of vendors with latest message preview and timestamp. Unread indicator. Click selects vendor. Used by WhatsApp view.

### `ConversationThread`

Scrollable list of `MessageBubble`s for a single vendor, ordered chronologically. Auto-scrolls to bottom. Used by WhatsApp view and Vendor Communications tab.

### `AgentSidePanel`

Slide-out panel (~400px) from the right. Mini chat interface where users type instructions about a selected message. Spawns agent via `agent.action`. Shows responses inline. Ephemeral (not persisted).

### `ComposeBox` (extracted)

Already exists in Research view. Extract to `components/common/` for reuse in WhatsApp view and AgentSidePanel.

## View 1: WhatsApp (replaces Outreach)

- Route: `/whatsapp` (renamed from `/outreach`)
- Sidebar: `MessageCircle` icon, label "WhatsApp"
- Layout: `ContactList` (280px left) + `ConversationThread` (center) + `ComposeBox` (bottom)
- ContactList shows vendors with WhatsApp communications, sorted by most recent
- Selecting a contact loads their conversation filtered to `channel: "whatsapp"`
- ComposeBox sends via existing `sendWhatsApp` tool (or draft if auto-send off)
- Draft messages show inline with approve/reject buttons
- Real-time updates via existing WhatsApp WebSocket events

## View 2: Inbox (email-focused)

- Route: `/inbox` (unchanged)
- Layout: `EmailList` (~400px left) + `EmailDetailPanel` (right) + `AgentSidePanel` (slide-out)
- EmailList: communications where `channel: "email"`, newest first. Shows vendor name, subject, body snippet, timestamp, status badge
- Clicking email opens EmailDetailPanel with full body, translation, parsed highlights
- "Ask AI" button opens AgentSidePanel with email as context
- User types instructions: "extract pricing", "draft a reply", "update vendor record"
- Existing reply button moves to action bar

## View 3: Vendor Communications Tab

- Location: Vendor detail page > Communications tab (replaces stub)
- Layout: `AggregatedTimeline` — single chronological stream
- Queries `communications.listByVendor` for that vendor
- Each message: channel badge (WhatsApp/Email), direction arrow, timestamp, body via `MessageBubble`
- "Ask AI" action available on individual messages
- EmptyState when no communications exist

## Agent Side Panel Details

- Triggered by "Ask AI" on any message in any view
- Receives selected communication(s) as context
- Mini chat: user types natural language instructions
- Backend: `agent.action` handler, short-lived agent with standard tools
- Write actions go through existing permission system
- Conversations are ephemeral (not persisted to DB)

## Out of Scope

- Email sync mechanism (handled separately via heartbeat/agent + gog)
- New DB tables (existing `communications` table sufficient)
- Research self-chat in WhatsApp view (stays in Research tab)
