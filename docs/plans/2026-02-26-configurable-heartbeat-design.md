# Configurable Heartbeat Agent Design

## Problem

The heartbeat system currently runs DB health checks on a 30-minute timer (stalled tasks, unparsed messages). Users want to leave the app running and have an agent automatically perform wedding research — finding vendors, drafting outreach, etc. — without manual intervention.

## Approach: Hybrid Heartbeat

Two-phase heartbeat on each tick:

1. **Phase 1 (always):** Run existing DB health checks (stalled tasks, unparsed messages, stalled pending tasks)
2. **Phase 2 (if enabled + prompt configured):** Dispatch an LLM-powered research agent via `AgentRunner` using the user's custom prompt

## Data Model

New `heartbeat_config` table:

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | integer PK | auto | |
| enabled | integer (0/1) | 0 | Whether the LLM agent runs on schedule |
| prompt | text | null | User's system prompt for the LLM agent |
| interval_minutes | integer | 30 | How often to run |
| last_run_at | text | null | Timestamp of last completed run |

## Gateway Changes

### HeartbeatScheduler

Updated `tick()` flow:

1. Run `heartbeatAgent.run()` (existing health checks)
2. Read `heartbeat_config` from DB
3. If `enabled && prompt`: dispatch `"heartbeat-research"` via orchestrator
4. Update `last_run_at` after completion
5. On config change, restart timer with new interval

### Dynamic TaskConfig

When dispatching, construct a `TaskConfig` on the fly:

```ts
{
  name: "heartbeat-research",
  systemPrompt: config.prompt,
  tools: ["search", "scrape", "browse", "parsePdf", "createVendor",
          "cmd", "dbQuery", "dbSchema", "sendWhatsApp"],
  maxSteps: 15,
}
```

Uses the full research toolset plus `sendWhatsApp`. WhatsApp messages respect the existing `whatsappAutoSend` toggle — if off (default), messages are created as drafts for user review.

### New Handlers

- `heartbeat-config.get` — returns current config (enabled, prompt, intervalMinutes, lastRunAt)
- `heartbeat-config.update` — updates enabled, prompt, intervalMinutes

## Frontend: Settings

New `HeartbeatSettings` component in `SettingsView`:

- **Enable/disable toggle**
- **Prompt textarea** — system prompt telling the LLM what to research
- **Interval selector** — 15 min, 30 min, 1 hr, 2 hr
- **Last run display** — when it last ran

## Frontend: Dashboard "While You Were Gone"

New section on `DashboardView` showing heartbeat activity since the user's last visit:

- **Research summaries** — what the agent found/did
- **Vendors created** — clickable links to `/vendors/:id`
- **Draft messages awaiting review** — WhatsApp/email drafts with Send/Edit/Discard actions
- **Messages sent** — if auto-send was enabled, show what was sent

Only appears if there's activity to show.

### Gateway Handler

New `dashboard.heartbeat-activity` handler:

- Queries `agent_tasks` where `type = "heartbeat-research"` and `completed_at > lastVisit`
- Joins to `vendors` created during those sessions (via `vendor_id` or timestamp correlation)
- Queries `communications` created during heartbeat sessions
- Returns structured data for the dashboard section

## Message Safety

The existing `whatsappAutoSend` toggle in `aiConfig` controls whether messages are sent automatically:

- **Off (default):** `sendWhatsApp` tool creates communications with `status = "draft"`. User reviews and approves via `communications.approve` handler.
- **On:** Messages are immediately enqueued in the delivery queue.

No new approval mechanism needed — the existing system handles this.

## What Stays the Same

- `heartbeatAgent` (base agent) — still runs DB health checks
- `HeartbeatScheduler` timer infrastructure — just reads config from DB now
- `AgentRunner` — reused as-is for the LLM dispatch
- `sendWhatsApp` tool behavior — unchanged, respects auto-send toggle
- `communications.approve` handler — unchanged, used for draft approval
