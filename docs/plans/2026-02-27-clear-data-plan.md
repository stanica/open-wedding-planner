# Clear Data Settings Section — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Data Management" section to Settings with granular clear buttons for vendors, research, communications, and tasks/budget — with type-to-confirm dialogs.

**Architecture:** New gateway handler `data-management.ts` with four `data.clear-*` routes, each using `db.transaction()`. New frontend `DataManagement.tsx` component added to `SettingsView.tsx`. Extends existing `ConfirmDialog` with a type-to-confirm variant.

**Tech Stack:** drizzle-orm transactions, React, framer-motion (existing ConfirmDialog pattern), wsClient, lucide-react icons, Tailwind CSS v4.

---

### Task 1: Backend — data-management handler

**Files:**
- Create: `packages/gateway/src/handlers/data-management.ts`
- Modify: `packages/gateway/src/handlers/index.ts:1-63`

**Step 1: Create the handler file**

```typescript
// packages/gateway/src/handlers/data-management.ts
import fs from "node:fs";
import path from "node:path";
import {
  vendors,
  vendorImages,
  vendorAttributes,
  quotes,
  quoteLineItems,
  communications,
  researchNotes,
  researchThreads,
  researchMessages,
  tasks,
  agentTasks,
  budgetEntries,
} from "../db/schema.js";
import { getImagesDir } from "../config/paths.js";
import type { Router, Db } from "../infra/router.js";

export function registerDataManagementHandlers(router: Router) {
  router.register("data.clear-vendors", async (db: Db) => {
    // Get all vendor IDs for image cleanup
    const allVendors = db.select({ id: vendors.id }).from(vendors).all();
    const quoteRows = db.select({ id: quotes.id }).from(quotes).all();
    const quoteIds = quoteRows.map((q) => q.id);

    // Clean up image directories
    const imagesDir = getImagesDir();
    for (const v of allVendors) {
      const dir = path.join(imagesDir, String(v.id));
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    db.transaction((tx) => {
      if (quoteIds.length > 0) {
        tx.delete(quoteLineItems).run();
      }
      tx.delete(quotes).run();
      tx.delete(vendorImages).run();
      tx.delete(vendorAttributes).run();
      tx.delete(communications).run();
      tx.delete(researchNotes).run();
      tx.update(budgetEntries).set({ vendorId: null }).run();
      tx.update(tasks).set({ vendorId: null }).run();
      tx.update(agentTasks).set({ vendorId: null }).run();
      tx.delete(vendors).run();
    });

    return { ok: true };
  });

  router.register("data.clear-research", async (db: Db) => {
    db.transaction((tx) => {
      tx.delete(researchMessages).run();
      tx.delete(researchThreads).run();
      tx.delete(researchNotes).run();
    });

    return { ok: true };
  });

  router.register("data.clear-communications", async (db: Db) => {
    db.delete(communications).run();
    return { ok: true };
  });

  router.register("data.clear-tasks", async (db: Db) => {
    db.transaction((tx) => {
      tx.delete(agentTasks).run();
      tx.delete(tasks).run();
      tx.delete(budgetEntries).run();
    });

    return { ok: true };
  });
}
```

**Step 2: Register the handler in index.ts**

In `packages/gateway/src/handlers/index.ts`, add the import and registration call:

```typescript
// Add import at top:
import { registerDataManagementHandlers } from "./data-management.js";

// Add inside registerAllHandlers, before the import handlers:
registerDataManagementHandlers(router);
```

**Step 3: Commit**

```bash
git add packages/gateway/src/handlers/data-management.ts packages/gateway/src/handlers/index.ts
git commit -m "feat: add data-management handlers for clearing vendor/research/comms/tasks data"
```

---

### Task 2: Backend tests

**Files:**
- Create: `packages/gateway/tests/handlers/data-management.test.ts`

**Step 1: Write tests**

Follow the exact pattern from `vendors.test.ts` — `setup()` with in-memory DB, `pushSchema`, `seedCategories`, `registerAllHandlers`.

```typescript
// packages/gateway/tests/handlers/data-management.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { Router } from "../../src/infra/router.js";
import { registerAllHandlers } from "../../src/handlers/index.js";

let tmpDir: string;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-data-mgmt-test-"));
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAllHandlers(router, undefined as any, undefined, undefined, tmpDir);
  return { db, router };
}

async function createVendorWithData(router: Router, db: any) {
  await router.handle(db, "vendors.create", {
    categoryId: 1,
    name: "Test Vendor",
    status: "researched",
  });
  await router.handle(db, "quotes.create", {
    vendorId: 1,
    totalAmount: 1000,
    currency: "EUR",
    source: "email",
  });
}

describe("data-management handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clear-vendors removes all vendors and related data", async () => {
    await createVendorWithData(router, db);

    // Verify data exists
    const vendorsBefore = await router.handle(db, "vendors.list", {}) as any[];
    expect(vendorsBefore.length).toBe(1);

    await router.handle(db, "data.clear-vendors", {});

    const vendorsAfter = await router.handle(db, "vendors.list", {}) as any[];
    expect(vendorsAfter.length).toBe(0);
  });

  it("clear-vendors cleans up image directories", async () => {
    await createVendorWithData(router, db);
    const imgDir = path.join(tmpDir, "1");
    fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, "photo.jpg"), "fake");

    await router.handle(db, "data.clear-vendors", {});

    expect(fs.existsSync(imgDir)).toBe(false);
  });

  it("clear-research removes threads and messages", async () => {
    const thread = await router.handle(db, "research-threads.create", {
      title: "Test thread",
    }) as any;
    await router.handle(db, "research-threads.addMessage", {
      threadId: thread.id,
      role: "user",
      content: "Hello",
    });

    await router.handle(db, "data.clear-research", {});

    const threads = await router.handle(db, "research-threads.list", {}) as any[];
    expect(threads.length).toBe(0);
  });

  it("clear-communications removes all communications", async () => {
    await createVendorWithData(router, db);
    await router.handle(db, "communications.create", {
      vendorId: 1,
      direction: "outgoing",
      channel: "email",
      bodyOriginal: "Hello",
      status: "sent",
    });

    await router.handle(db, "data.clear-communications", {});

    const comms = await router.handle(db, "communications.list", { vendorId: 1 }) as any[];
    expect(comms.length).toBe(0);
  });

  it("clear-tasks removes tasks, agent tasks, and budget entries", async () => {
    await router.handle(db, "tasks.create", {
      title: "Book venue",
      categoryId: 1,
    });
    await router.handle(db, "budget.create", {
      categoryId: 1,
      description: "Venue deposit",
    });

    await router.handle(db, "data.clear-tasks", {});

    const taskList = await router.handle(db, "tasks.list", {}) as any[];
    expect(taskList.length).toBe(0);
    const budgetList = await router.handle(db, "budget.list", {}) as any[];
    expect(budgetList.length).toBe(0);
  });

  it("clear-vendors does not affect config tables", async () => {
    await createVendorWithData(router, db);

    await router.handle(db, "data.clear-vendors", {});

    // Config tables should still work
    const config = await router.handle(db, "wedding-config.get", {});
    expect(config).toBeTruthy();
  });
});
```

**Step 2: Run tests**

```bash
cd packages/gateway && npx vitest run tests/handlers/data-management.test.ts
```

Expected: All 6 tests pass.

**Step 3: Commit**

```bash
git add packages/gateway/tests/handlers/data-management.test.ts
git commit -m "test: add data-management handler tests"
```

---

### Task 3: Frontend — ConfirmDeleteDialog with type-to-confirm

**Files:**
- Create: `packages/app/src/renderer/components/common/ConfirmDeleteDialog.tsx`

**Step 1: Create the component**

Build on the same design system as `ConfirmDialog.tsx` — framer-motion AnimatePresence, same color palette, same layout. Add a text input that must match "DELETE" before the confirm button enables.

```tsx
// packages/app/src/renderer/components/common/ConfirmDeleteDialog.tsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmWord?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  title,
  message,
  confirmWord = "DELETE",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDeleteDialogProps) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const confirmed = typed === confirmWord;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="mx-4 w-full max-w-sm rounded-xl border border-white/10 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="text-sm text-gray-400">{message}</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs text-gray-500 mb-1">
                Type <span className="font-mono font-semibold text-gray-300">{confirmWord}</span> to confirm
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none"
                placeholder={confirmWord}
                autoFocus
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onCancel}
                disabled={loading}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={!confirmed || loading}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Commit**

```bash
git add packages/app/src/renderer/components/common/ConfirmDeleteDialog.tsx
git commit -m "feat: add ConfirmDeleteDialog with type-to-confirm"
```

---

### Task 4: Frontend — DataManagement settings component

**Files:**
- Create: `packages/app/src/renderer/components/settings/DataManagement.tsx`
- Modify: `packages/app/src/renderer/components/settings/SettingsView.tsx`

**Step 1: Create DataManagement component**

Uses `wsClient.request()` directly (same pattern as `HeartbeatSettings.tsx`). Four data groups, each with description + red clear button. One shared `ConfirmDeleteDialog` instance.

```tsx
// packages/app/src/renderer/components/settings/DataManagement.tsx
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { wsClient } from "../../lib/ws-client";
import { ConfirmDeleteDialog } from "../common/ConfirmDeleteDialog";

interface ClearGroup {
  key: string;
  label: string;
  description: string;
  method: string;
}

const CLEAR_GROUPS: ClearGroup[] = [
  {
    key: "vendors",
    label: "Vendors",
    description: "Remove all vendors, their photos, quotes, and attributes",
    method: "data.clear-vendors",
  },
  {
    key: "research",
    label: "Research",
    description: "Remove all research conversations and notes",
    method: "data.clear-research",
  },
  {
    key: "communications",
    label: "Communications",
    description: "Remove all email and WhatsApp message history",
    method: "data.clear-communications",
  },
  {
    key: "tasks",
    label: "Tasks & Budget",
    description: "Remove all tasks and budget entries",
    method: "data.clear-tasks",
  },
];

export function DataManagement() {
  const [clearing, setClearing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleClear() {
    if (!clearing) return;
    const group = CLEAR_GROUPS.find((g) => g.key === clearing);
    if (!group) return;

    setLoading(true);
    try {
      await wsClient.request(group.method);
      setSuccess(group.key);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Failed to clear data:", err);
    } finally {
      setLoading(false);
      setClearing(null);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Data Management</h2>
      <p className="text-sm text-gray-400 mb-4">
        Clear accumulated data while keeping your settings intact.
      </p>

      <div className="space-y-3">
        {CLEAR_GROUPS.map((group) => (
          <div
            key={group.key}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-white">{group.label}</p>
              <p className="text-xs text-gray-400">{group.description}</p>
            </div>
            {success === group.key ? (
              <span className="text-xs text-green-400">Cleared</span>
            ) : (
              <button
                onClick={() => setClearing(group.key)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-600/20 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        ))}
      </div>

      <ConfirmDeleteDialog
        open={clearing !== null}
        title={`Clear ${CLEAR_GROUPS.find((g) => g.key === clearing)?.label ?? ""} Data`}
        message={`This will permanently delete all ${CLEAR_GROUPS.find((g) => g.key === clearing)?.label.toLowerCase() ?? ""} data. This cannot be undone.`}
        onConfirm={handleClear}
        onCancel={() => setClearing(null)}
        loading={loading}
      />
    </div>
  );
}
```

**Step 2: Add to SettingsView**

In `packages/app/src/renderer/components/settings/SettingsView.tsx`, add the import and render `<DataManagement />` at the bottom after `<IntegrationStatus />`:

```tsx
import { DataManagement } from "./DataManagement";

// After <IntegrationStatus />, add:
<hr className="border-white/10" />
<DataManagement />
```

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/settings/DataManagement.tsx packages/app/src/renderer/components/settings/SettingsView.tsx
git commit -m "feat: add Data Management section to Settings"
```

---

### Task 5: Verify everything works

**Step 1: Run all gateway tests**

```bash
cd packages/gateway && npx vitest run
```

Expected: All tests pass including new data-management tests.

**Step 2: Run TypeScript type checks**

```bash
cd packages/gateway && npx tsc --noEmit
cd packages/app && npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Manual smoke test**

```bash
cd /Users/rob/Documents/work/wedding-planner && npm run dev
```

Verify: Navigate to Settings, scroll to bottom, see "Data Management" section with four clear buttons. Click one, see type-to-confirm dialog, type DELETE, confirm, see "Cleared" feedback.
