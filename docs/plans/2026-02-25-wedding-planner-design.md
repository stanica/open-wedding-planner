# Wedding Planner Agent System — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Overview

A desktop application that orchestrates multiple AI agents to handle the research and outreach tasks involved in wedding planning. The system automates venue/vendor discovery, multilingual communication, quote parsing, and budget tracking — while keeping the human in the loop for all outbound communication.

The primary use case is planning a destination wedding in Italy, but the architecture is designed to be vendor-category-agnostic so new agent types (photographers, florists, DJs, etc.) can be added without schema or architectural changes.

## Architecture

Electron UI + Gateway Daemon. The gateway is an always-on Node.js process that owns all agent orchestration, channel connections, and the database. The Electron app is the UI layer, communicating with the gateway over a local WebSocket.

```
+-- Gateway (always-on Node.js daemon) ------------------------------------+
|                                                                           |
|  Session Manager                                                          |
|  +-- Session store (SQLite) -- persists across restarts                   |
|  +-- Session isolation (per-vendor, per-task, shared main)                |
|  +-- Session context (conversation history, task state)                   |
|                                                                           |
|  Command Queue (lane-based)                                               |
|  +-- Main lane (user-initiated, max concurrent: 1)                        |
|  +-- Heartbeat lane (periodic checks, max concurrent: 1)                  |
|  +-- Subagent lane (background work, max concurrent: 3)                   |
|  +-- Generation tracking for stale task invalidation                      |
|                                                                           |
|  Agent Orchestrator (Vercel AI SDK)                                       |
|  +-- Research Agent (web search, scrape, Playwright, PDF parse)           |
|  +-- Outreach Agent (draft emails/messages, await approval)               |
|  +-- Translation Agent (Italian <-> English)                              |
|  +-- Parser Agent (extract structured data from responses)                |
|  +-- Heartbeat Agent (periodic task checker)                              |
|                                                                           |
|  Agent Safety                                                             |
|  +-- Max iterations per run (default 50, configurable)                    |
|  +-- Tool loop detection (30-call sliding window, SHA256 hashing)         |
|  +-- Per-run timeout (default 5 min, configurable)                        |
|  +-- Per-run token budget (configurable)                                  |
|                                                                           |
|  Channel Adapters                                                         |
|  +-- WhatsApp (Baileys -- linked session, reconnect loop, creds backup)   |
|  +-- Gmail (Google API -- OAuth2, push notifications via pub/sub watch)   |
|  +-- Google Calendar (Google API -- shared OAuth2 with Gmail)             |
|                                                                           |
|  Tools                                                                    |
|  +-- Web scraper (HTTP + cheerio, lightweight first pass)                 |
|  +-- Playwright (headless Chrome fallback for JS-heavy sites)             |
|  +-- PDF parser (pdf-parse for pricing sheets, menus, etc.)               |
|  +-- Web search API                                                       |
|                                                                           |
|  Delivery Queue (write-ahead)                                             |
|  +-- Persist to disk before sending                                       |
|  +-- Exponential backoff retries (5s, 25s, 2min, 10min, max 5)           |
|  +-- Recovery on restart (drain oldest first, 60s budget)                 |
|                                                                           |
|  Database                                                                 |
|  +-- SQLite via better-sqlite3 + Drizzle ORM                             |
|  +-- sqlite-vec for semantic search over vendor data and emails           |
|                                                                           |
+---------------------+----------------------------------------------------+
                      | WebSocket (local)
+---------------------v----------------------------------------------------+
|  Electron App (UI)                                                        |
|  +-- Dashboard -- overview, budget summary, recent activity               |
|  +-- Research -- natural language input, live agent activity stream        |
|  +-- Vendors -- filterable list by category and status                    |
|  +-- Vendor Detail -- quotes, comms, research notes, actions              |
|  +-- Outreach -- draft approval queue (side-by-side translation)          |
|  +-- Inbox -- incoming responses, auto-translated, parsed highlights      |
|  +-- Timeline -- wedding planning tasks by month/deadline                 |
|  +-- Budget -- category breakdown, estimates, actuals, payments           |
|  +-- Settings -- wedding params, integrations, agent config               |
+--------------------------------------------------------------------------+
```

### Gateway Independence

The gateway process can run without the Electron window open. On macOS, a system tray icon keeps the gateway alive so agents continue working, WhatsApp stays connected, and incoming messages are received. When the Electron window reopens, it reconnects via WebSocket and drains any queued notifications.

### Gateway <-> Electron Protocol

Local WebSocket with a challenge-response handshake:

1. Electron connects, gateway sends challenge
2. Electron responds, gateway sends hello-ok with full state snapshot
3. Bidirectional: request/response pairs + server-pushed event broadcasts
4. Events include sequence numbers for gap detection on reconnect

## Data Model

The vendor is the central entity. A venue is just a vendor in the "Venue/Food/Beverage" category. The schema is designed so new vendor categories require no migrations.

### WeddingConfig (singleton)

- `wedding_date`, `guest_count`, `budget_total`, `currency`
- `couple_names`, `couple_email`, `location`
- `language_preferences`, `dietary_requirements`, `alcohol_preferences`

### Category

- `id`, `name` (e.g. "Venue/Food/Beverage", "Photography", "Flowers")
- `budget_percent_low`, `budget_percent_high`, `budget_fixed` (optional override)
- `sort_order`
- Seeded with standard categories: Venue/Food/Beverage, Ceremony, Photography/Videography, Decor, Stationery, Attire, Entertainment, Planner/Coordinator, Miscellaneous, Contingency
- User can add custom categories

### Vendor

- `id`, `category_id`, `name`, `location`, `website_url`
- `contact_email`, `contact_phone`, `contact_whatsapp`
- `description`, `notes`, `source_url`
- `status` (researched | contacted | quoted | booked | rejected)
- `created_at`, `updated_at`

### VendorAttribute (EAV)

- `id`, `vendor_id`, `key`, `value`, `type` (text | number | boolean | date)
- Flexible key-value pairs for category-specific data:
  - Venue: capacity, music_curfew, ceremony_time, min_stay, wedding_fee
  - Florist: style, seasonal_availability, color_palette
  - DJ: genre_specialties, equipment_included, siae_tax
  - Photographer: style, hours_included, digital_only, drone

### Quote

- `id`, `vendor_id`, `total_amount`, `currency`, `valid_until`
- `raw_text`, `source` (email | pdf | web | whatsapp), `received_at`

### QuoteLineItem

- `id`, `quote_id`, `description`, `amount`
- `pricing_type` (flat | per_person | per_unit | per_hour)
- `unit_price`, `quantity`, `notes`

### Communication

- `id`, `vendor_id`, `direction` (in | out), `channel` (email | whatsapp)
- `subject`, `body_original`, `body_translated`, `language`
- `sent_at`, `status` (draft | pending_approval | sent | received)
- `thread_id` (groups related messages)

### ResearchNote

- `id`, `vendor_id`, `content`, `source_url`
- `source_type` (web | pdf | email | whatsapp)
- `extracted_data` (JSON), `created_at`

### BudgetEntry

- `id`, `category_id`, `vendor_id` (nullable)
- `description`, `high_estimate`, `low_estimate`, `estimated_actual`
- `amount_paid`, `balance_due`, `final_payment_due`, `paid_by`, `notes`

### Task (wedding planning to-do)

- `id`, `title`, `owner`, `status` (pending | in_progress | done)
- `deadline`, `category_id` (nullable), `vendor_id` (nullable)
- `notes`, `sort_order`, `created_at`

### AgentTask (system-internal)

- `id`, `type` (research | outreach | translation | parse)
- `status` (pending | running | completed | failed)
- `session_id`, `input` (JSON), `output` (JSON)
- `parent_task_id`, `vendor_id` (nullable), `category_id` (nullable)
- `created_at`, `completed_at`

### Session (agent state)

- `id`, `key`, `context` (JSON), `created_at`, `last_active_at`

### Embeddings (sqlite-vec)

Stored for: vendor descriptions, research note content, communication bodies. Enables semantic queries like "find vendors similar to X" or "which vendor mentioned a discount for weekday events?"

## Agent System

### Agent Types

| Agent | Trigger | Autonomy | Tools |
|---|---|---|---|
| Research | User request | Fully autonomous | Web search, scraper, Playwright, PDF parser |
| Outreach | User selects vendor + requests contact | Drafts autonomously, sends only with approval | Gmail API, WhatsApp, translation |
| Translation | Called by other agents or on incoming messages | Fully autonomous | LLM translation |
| Parser | Triggered on incoming email/WhatsApp | Fully autonomous | LLM extraction, updates vendor data |
| Heartbeat | Scheduled (every 30 min, configurable) | Fully autonomous | Checks pending tasks, continues stalled work |

### Execution Flow

```
User: "Find me villas in Rome for 20 guests"
  |
  v
Gateway creates AgentTask (type: research)
Gateway spawns Session (key: "research:rome-villas-<timestamp>")
Gateway starts Research Agent in subagent lane (non-blocking)
  |
  v (agent works autonomously)
Research Agent:
  1. Web search: "wedding villas Rome 20 guests"
  2. For each result:
     a. Try HTTP scrape (cheerio)
     b. If JS-heavy site -> Playwright
     c. If PDF found -> parse PDF
     d. Extract: name, capacity, pricing, contact info
     e. Check DB: vendor already known? (semantic search via sqlite-vec)
     f. If new -> create Vendor + VendorAttributes + ResearchNotes
  3. Continue until N viable vendors found or search exhausted
  4. Mark AgentTask complete
  |
  v
Gateway delivers update to UI via WebSocket:
  "Found 7 new villas in Rome. 5 fit your guest count."
  |
  v
User reviews vendors in UI, selects "Villa dei Fiori", clicks "Contact"
  |
  v
Outreach Agent:
  1. Pulls WeddingConfig (guest count, date, requirements)
  2. Pulls Vendor data (contact email, language)
  3. Drafts email in appropriate language (Italian)
  4. Creates Communication (status: draft)
  5. Pushes to approval queue in UI
  |
  v
User reviews draft, edits if needed, approves
  |
  v
Gateway sends via Gmail API (or WhatsApp)
Communication status -> sent
  |
  v (later, async)
Incoming email/WhatsApp detected by channel adapter
Parser Agent:
  1. Translates if needed (via Translation Agent)
  2. Extracts structured data (pricing, availability, conditions)
  3. Updates Vendor, creates Quote + QuoteLineItems
  4. Creates Communication (status: received)
  |
  v
Gateway notifies UI: "New response from Villa dei Fiori - quote received"
```

### Session Isolation

| Session Key Pattern | Purpose |
|---|---|
| `main` | User preferences, cross-cutting context |
| `research:<query-slug>` | One research task |
| `vendor:<vendor-id>` | All interactions with a specific vendor |
| `heartbeat` | Periodic task checker |

### Heartbeat

Every 30 minutes (configurable):

1. Check for AgentTask records with status `running` that haven't progressed
2. Check for incoming messages that haven't been parsed
3. Check for stalled research tasks
4. If work exists: run the appropriate agent in the relevant session
5. If nothing: suppress notification (no spam to user)

### Context Management

Three-layer approach (adapted from OpenClaw):

1. **History truncation** -- sliding window, keep last N turns per session (default 30)
2. **Context pruning** -- at 80% of context window, soft-trim old tool results. At 95%, hard-clear.
3. **Context compaction** -- when pruning isn't enough, LLM-summarize older chunks (1.2x safety margin on token estimates)

## Resilience

### Write-Ahead Delivery Queue

All outbound messages persisted to `~/.wedding-planner/delivery-queue/` as JSON files before sending. On success, ack (delete). On failure, retry with exponential backoff (5s, 25s, 2min, 10min). Max 5 retries, then move to `failed/` subdirectory. On gateway restart, drain queue oldest-first with 60-second budget.

### Restart Safety

- Command queue uses generation tracking: stale completions after restart are discarded
- Gateway defers restart until in-flight work drains (poll every 500ms, max 30s wait)
- WhatsApp creds backed up atomically before each save (prevents corruption)

### Channel Reconnection

Each channel adapter has its own reconnect policy:
- Exponential backoff (5s to 5min)
- Max 10 reconnect attempts before marking channel as failed
- User notified via UI when a channel goes down

## UI Design

### Design Constraints

- **No emojis anywhere.** Use Lucide React icons exclusively.
- **Micro-interactions everywhere.** Framer Motion for: page transitions, list item enter/exit, hover scale/opacity, toast slide-in/out, skeleton loading states, status badge color transitions, sidebar active indicator slides.
- **Clean, minimal design.** Radix UI primitives for accessibility. Tailwind for consistent spacing, typography, and a muted color palette with a single accent color for primary actions.
- **Responsive within the Electron window.** Support resizable window with sensible minimum dimensions.

### Views

**Dashboard** -- At-a-glance overview: vendor counts by status per category, budget summary bar, recent activity feed, quick-action research input.

**Research** -- Natural language input bar, live agent activity stream (sites visited, data extracted), results grid of new vendors found.

**Vendors** -- Filterable list grouped by category, filter by status, card layout with name/location/price range/status badge. Click through to detail.

**Vendor Detail** -- Contact info, attributes, quotes with line-item breakdown, communication history (original + translated side by side), research notes with source links. Actions: contact, update status, add note.

**Outreach** -- Approval queue. Each draft shown with target language text and English translation side by side. Edit, approve, or reject.

**Inbox** -- Incoming communications, auto-translated, with parsed data highlights (extracted pricing, dates, conditions). One-click save-quote-to-vendor or reply.

**Timeline** -- Wedding planning tasks organized by month/deadline. Owner assignment, status tracking, links to relevant vendors.

**Budget** -- Category breakdown mirroring standard wedding budget structure. Per-category: allocation, high/low estimates, actual, paid, balance. Per-vendor roll-up within each category.

**Settings** -- Wedding parameters (date, guests, dietary, budget). Integration setup (WhatsApp QR scan, Gmail OAuth, API keys). Agent configuration (heartbeat interval, turn limits).

### Sidebar

Persistent sidebar with navigation items (Lucide icons, no text labels on collapse). Bottom section shows live agent/channel status indicators (idle/working/connected/disconnected).

## Tech Stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron |
| Frontend | React 19 + Tailwind CSS 4 |
| Icons | Lucide React |
| Component primitives | Radix UI |
| Animations | Framer Motion |
| State management | Zustand |
| Gateway runtime | Node.js |
| Agent orchestration | Vercel AI SDK |
| Database | better-sqlite3 + sqlite-vec |
| ORM | Drizzle |
| WhatsApp | Baileys (WhiskeySockets/Baileys) |
| Google APIs | googleapis |
| Web scraping | cheerio |
| Browser automation | Playwright |
| PDF parsing | pdf-parse |
| WebSocket | ws |
| Build | Vite (renderer) + tsup (gateway) |
| Package manager | pnpm (workspace monorepo) |
| Language | TypeScript |

## Project Structure

```
wedding-planner/
  packages/
    gateway/
      src/
        index.ts
        config/
        agents/
          orchestrator.ts
          research.ts
          outreach.ts
          translation.ts
          parser.ts
          safety/
            turn-limits.ts
            loop-detection.ts
        channels/
          whatsapp.ts
          gmail.ts
          calendar.ts
        db/
          schema.ts
          migrations/
          embeddings.ts
        infra/
          command-queue.ts
          delivery-queue.ts
          heartbeat.ts
          sessions.ts
          ws-server.ts
        tools/
          scraper.ts
          browser.ts
          pdf.ts
          search.ts
    app/
      src/
        main/
          index.ts
          tray.ts
        renderer/
          App.tsx
          components/
            layout/
            dashboard/
            research/
            vendors/
            outreach/
            inbox/
            timeline/
            budget/
            settings/
          hooks/
            useGateway.ts
            useVendors.ts
            useBudget.ts
          stores/
          lib/
            ws-client.ts
    shared/
      src/
        types/
        protocol/
```
