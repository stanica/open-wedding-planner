# Clear Data Settings Section — Design

## Overview
Add a "Data Management" section to the bottom of the Settings page that lets users selectively clear accumulated data (vendors, research, communications, tasks/budget) while preserving all configuration settings.

## Placement
New section at the bottom of `SettingsView.tsx`, below all existing settings, using the same `<hr>` divider pattern.

## Granular Clear Groups

| Group | Tables Cleared | User-facing Description |
|-------|---------------|------------------------|
| Vendors | `vendors`, `vendorImages`, `vendorAttributes`, `quotes`, `quoteLineItems` | Remove all vendors, their photos, quotes, and attributes |
| Research | `researchThreads`, `researchMessages`, `researchNotes` | Remove all research conversations and notes |
| Communications | `communications` | Remove all email and WhatsApp message history |
| Tasks & Budget | `tasks`, `agentTasks`, `budgetEntries` | Remove all tasks and budget entries |

## Preserved Tables (never cleared)
`weddingConfig`, `aiConfig`, `searchConfig`, `heartbeatConfig`, `googleConfig`, `toolPermissions`

## Confirmation Flow
1. User clicks a red "Clear" button next to a data group
2. Modal dialog appears with:
   - Warning icon + message: "This will permanently delete all [category] data. This cannot be undone."
   - Text input: "Type DELETE to confirm"
   - Cancel + Confirm buttons (Confirm disabled until "DELETE" is typed)
3. On confirm: call backend handler, show success/error feedback

## Backend
New handler file `packages/gateway/src/handlers/data-management.ts` with WebSocket routes:
- `data.clear-vendors` — deletes in FK order: quoteLineItems → quotes → vendorImages → vendorAttributes → vendors; cleans up image files from disk
- `data.clear-research` — deletes: researchMessages → researchThreads, researchNotes
- `data.clear-communications` — deletes: communications
- `data.clear-tasks` — deletes: agentTasks, tasks, budgetEntries

Each handler runs inside `db.transaction()` for atomicity.

## Frontend
- `DataManagement.tsx` — new settings component with the four clear groups
- `ConfirmDeleteDialog.tsx` — shared modal with type-to-confirm pattern
- `SettingsView.tsx` — import and render DataManagement at bottom
