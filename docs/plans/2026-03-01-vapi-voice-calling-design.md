# VAPI Voice Calling Integration Design

## Overview

Extend the wedding planner agent with voice calling capabilities via the VAPI API. The agent can initiate outbound phone calls to vendors (e.g., "Call Mary's Flowers and ask for a quote"), and the app stores call transcripts, summaries, and structured data for later review.

## Decisions

- **API approach**: Direct REST calls to VAPI API (no SDK dependency)
- **Webhook delivery**: Dedicated auto-start Cloudflare tunnel for VAPI (separate from the user-controlled settings tunnel)
- **Assistant config**: Pre-configured in VAPI dashboard, referenced by `assistantId` — no voice model config needed in the app
- **Config storage**: VAPI credentials added to existing `aiConfig` table
- **Call approval**: Configurable auto-call toggle (default: require approval), same pattern as WhatsApp auto-send
- **Tool access**: `makeVapiCall` tool available to both research and outreach agents
- **UI**: Standalone sidebar tab ("Calls") with summary-focused display

## Data Model

### New table: `voiceCalls`

| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | Auto-increment |
| vendorId | integer FK (nullable) | Associated vendor, if any |
| vapiCallId | text | VAPI's call ID |
| phoneNumber | text | Number dialed |
| assistantId | text | VAPI assistant used |
| status | text | "draft" \| "queued" \| "ringing" \| "in-progress" \| "ended" \| "failed" |
| endedReason | text | Why the call ended (from VAPI) |
| duration | integer | Seconds |
| summary | text | VAPI auto-generated summary |
| transcript | text | Full transcript |
| recordingUrl | text | URL to recording |
| structuredData | text | JSON of extracted data |
| instructions | text | What the agent told the voice AI to do |
| createdAt | text | ISO timestamp |
| endedAt | text | ISO timestamp |

### aiConfig additions

- `vapiApiKey` (text) — VAPI Bearer token
- `vapiPhoneNumberId` (text) — provisioned phone number ID
- `vapiAssistantId` (text) — default assistant ID
- `vapiAutoCall` (integer 0/1) — auto-call toggle, default 0

## Gateway Architecture

### 1. VapiChannel (`packages/gateway/src/channels/vapi.ts`)

REST client for VAPI API:
- `createCall(phoneNumber, assistantId, overrides?)` → `POST https://api.vapi.ai/call`
- `getCall(callId)` → `GET https://api.vapi.ai/call/{id}`
- `handleWebhook(payload)` → processes incoming VAPI webhook events

### 2. Handlers (`packages/gateway/src/handlers/vapi.ts`)

RPC handlers exposed via WebSocket:
- `vapi.createCall` — initiates a call (manual trigger or agent tool)
- `vapi.getCall` — fetch call details
- `vapi.listCalls` — list all calls from DB
- `vapi.approveDraft` — approve a draft call for dialing

### 3. Agent Tool (`packages/gateway/src/tools/vapi-call.ts`)

`makeVapiCall` tool for the research and outreach agents:
- Input: vendorId (optional), phoneNumber, instructions
- Creates `voiceCalls` record
- If auto-call enabled: calls VapiChannel.createCall() immediately
- If not: creates as "draft" for user approval
- Returns call ID

### 4. Dedicated VAPI Tunnel

Second `TunnelManager` instance, auto-started on gateway launch:
- Points to the same gateway port
- On connect: updates VAPI phone number's server URL via `PATCH /phone-number/{id}`
- Separate from the user-controlled settings tunnel

### 5. Webhook POST Endpoint

Added to HTTP server in `ws-server.ts`:
- Route: `POST /vapi/webhook`
- Handles `status-update`: updates call status in DB, broadcasts to UI
- Handles `end-of-call-report`: saves transcript, summary, structured data, recording URL

## Event Flow

```
User: "Call Mary's Flowers for a quote"
  → Orchestrator dispatches research/outreach agent
  → Agent calls makeVapiCall tool
  → Tool creates voiceCalls record
  → If auto-call: calls VAPI API → call placed
  → If draft: UI shows draft for approval → user approves → calls VAPI API
  → VAPI sends status-update webhooks → gateway updates DB + broadcasts
  → Call ends → VAPI sends end-of-call-report
  → Gateway saves transcript/summary → broadcasts "voice-call-ended"
  → UI updates Calls tab with results
```

## UI Design

### Sidebar

New entry: "Calls" with `Phone` icon (lucide-react), route `/calls`

### CallsView (`/calls`)

- **Left panel**: List of calls sorted by most recent
  - Each item: vendor name, status badge, duration, timestamp
- **Right panel**: Selected call detail
  - Header: vendor name, phone number, status badge, duration, timestamp
  - Summary section (VAPI auto-generated)
  - Collapsible full transcript
  - "Call Again" button
  - If draft: approve/reject buttons (like WhatsApp drafts)

### Status Badges

- draft (gray outline), queued (gray), ringing (yellow), in-progress (blue/pulsing), ended (green), failed (red)

### Settings

- VAPI API Key field
- VAPI Phone Number ID field
- VAPI Assistant ID field
- Auto-call toggle

### Real-time Updates

UI subscribes to WebSocket events:
- `voice-call-status` — call status changes
- `voice-call-ended` — call completed with transcript/summary
