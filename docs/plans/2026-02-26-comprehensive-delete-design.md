# Comprehensive Delete Functionality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add delete functionality with confirmation dialogs for all user-created entities across the wedding planner app.

**Architecture:** Backend-first approach — add/fix delete handlers with proper cascade logic and transactions, then build a reusable ConfirmDialog UI component, then wire delete buttons into each view. Tests written before implementation for backend handlers.

**Tech Stack:** drizzle-orm (SQLite transactions), React 19, framer-motion, Lucide icons (`Trash2`), vitest

---

### Task 1: Add `communications.delete` handler

**Files:**
- Modify: `packages/gateway/src/handlers/communications.ts:89` (add after last handler)

**Step 1: Write the failing test**

Create `packages/gateway/tests/handlers/communications.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { Router } from "../../src/infra/router.js";
import { registerAllHandlers } from "../../src/handlers/index.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAllHandlers(router);
  return { db, router };
}

describe("communication handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Test Vendor",
      status: "contacted",
    });
  });

  it("deletes a communication", async () => {
    // Insert directly via db since there's no communications.create handler
    await db.insert(schema.communications).values({
      vendorId: 1,
      direction: "out",
      channel: "email",
      subject: "Test",
      bodyOriginal: "Hello",
      status: "draft",
    });

    const before = (await router.handle(db, "communications.list", {
      vendorId: 1,
    })) as unknown[];
    expect(before).toHaveLength(1);

    await router.handle(db, "communications.delete", { id: 1 });

    const after = (await router.handle(db, "communications.list", {
      vendorId: 1,
    })) as unknown[];
    expect(after).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/communications.test.ts`
Expected: FAIL — `Unknown method: communications.delete`

**Step 3: Write minimal implementation**

Add to `packages/gateway/src/handlers/communications.ts` after the `communications.reject` handler (line 89):

```typescript
  router.register("communications.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(communications).where(eq(communications.id, id));
    return { ok: true };
  });
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/handlers/communications.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/handlers/communications.ts packages/gateway/tests/handlers/communications.test.ts
git commit -m "feat: add communications.delete handler"
```

---

### Task 2: Add `categories.delete` handler (blocked if vendors assigned)

**Files:**
- Modify: `packages/gateway/src/handlers/categories.ts:23` (add after last handler)

**Step 1: Write the failing tests**

Create `packages/gateway/tests/handlers/categories.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { Router } from "../../src/infra/router.js";
import { registerAllHandlers } from "../../src/handlers/index.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAllHandlers(router);
  return { db, router };
}

describe("category handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
  });

  it("deletes an empty category", async () => {
    // seedCategories creates multiple categories; create a fresh one to delete
    const [created] = await db
      .insert(schema.categories)
      .values({ name: "Test Cat", budgetPercentLow: 0, budgetPercentHigh: 0, sortOrder: 99 })
      .returning();

    await router.handle(db, "categories.delete", { id: created.id });

    const cats = (await router.handle(db, "categories.list", {})) as unknown[];
    expect(cats.find((c: any) => c.id === created.id)).toBeUndefined();
  });

  it("rejects deleting a category with assigned vendors", async () => {
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Venue A",
      status: "researched",
    });

    await expect(
      router.handle(db, "categories.delete", { id: 1 }),
    ).rejects.toThrow(/vendors/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/categories.test.ts`
Expected: FAIL — `Unknown method: categories.delete`

**Step 3: Write minimal implementation**

Add to `packages/gateway/src/handlers/categories.ts` after the `categories.update` handler. Need to import `vendors` from schema:

```typescript
import { eq } from "drizzle-orm";
import { categories, vendors } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";
```

Add handler after `categories.update`:

```typescript
  router.register("categories.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const assigned = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.categoryId, id));
    if (assigned.length > 0) {
      throw new Error(`Cannot delete category: ${assigned.length} vendor(s) still assigned`);
    }
    await db.delete(categories).where(eq(categories.id, id));
    return { ok: true };
  });
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/handlers/categories.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/handlers/categories.ts packages/gateway/tests/handlers/categories.test.ts
git commit -m "feat: add categories.delete handler with vendor check"
```

---

### Task 3: Add `research-notes.delete` handler

**Files:**
- Create: `packages/gateway/src/handlers/research-notes.ts`
- Modify: `packages/gateway/src/handlers/index.ts:16` (register new handler)

**Step 1: Write the failing test**

Create `packages/gateway/tests/handlers/research-notes.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { Router } from "../../src/infra/router.js";
import { registerAllHandlers } from "../../src/handlers/index.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAllHandlers(router);
  return { db, router };
}

describe("research-notes handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Test Vendor",
      status: "researched",
    });
  });

  it("lists research notes by vendor", async () => {
    await db.insert(schema.researchNotes).values({
      vendorId: 1,
      content: "Great reviews online",
      sourceType: "web",
    });
    await db.insert(schema.researchNotes).values({
      vendorId: 1,
      content: "Located near venue",
      sourceType: "manual",
    });

    const notes = (await router.handle(db, "research-notes.list", {
      vendorId: 1,
    })) as unknown[];
    expect(notes).toHaveLength(2);
  });

  it("deletes a research note", async () => {
    const [note] = await db
      .insert(schema.researchNotes)
      .values({ vendorId: 1, content: "Test note", sourceType: "web" })
      .returning();

    await router.handle(db, "research-notes.delete", { id: note.id });

    const notes = (await router.handle(db, "research-notes.list", {
      vendorId: 1,
    })) as unknown[];
    expect(notes).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/research-notes.test.ts`
Expected: FAIL — `Unknown method: research-notes.list`

**Step 3: Write minimal implementation**

Create `packages/gateway/src/handlers/research-notes.ts`:

```typescript
import { eq } from "drizzle-orm";
import { researchNotes } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerResearchNoteHandlers(router: Router) {
  router.register("research-notes.list", async (db: Db, params: unknown) => {
    const { vendorId } = params as { vendorId: number };
    return db.select().from(researchNotes).where(eq(researchNotes.vendorId, vendorId));
  });

  router.register("research-notes.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(researchNotes).where(eq(researchNotes.id, id));
    return { ok: true };
  });
}
```

Add to `packages/gateway/src/handlers/index.ts`:
- Import: `import { registerResearchNoteHandlers } from "./research-notes.js";`
- Register: `registerResearchNoteHandlers(router);` (after `registerCommunicationHandlers`)

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/handlers/research-notes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/handlers/research-notes.ts packages/gateway/src/handlers/index.ts packages/gateway/tests/handlers/research-notes.test.ts
git commit -m "feat: add research-notes list and delete handlers"
```

---

### Task 4: Rewrite `vendors.delete` with cascade + transaction

**Files:**
- Modify: `packages/gateway/src/handlers/vendors.ts:44-48`

**Step 1: Write the failing test**

Add to `packages/gateway/tests/handlers/vendors.test.ts` (after the existing `deletes a vendor` test):

```typescript
  it("cascade-deletes all vendor children", async () => {
    // Create vendor with children in every related table
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Vendor With Data",
      status: "quoted",
    });
    const vendorId = 1;

    // Add attributes
    await router.handle(db, "vendor-attributes.set", {
      vendorId,
      key: "capacity",
      value: "100",
    });

    // Add quotes with line items
    await router.handle(db, "quotes.create", {
      vendorId,
      totalAmount: 5000,
      currency: "EUR",
      source: "email",
      lineItems: [{ description: "Item", amount: 5000, pricingType: "flat" }],
    });

    // Add communication
    await db.insert(schema.communications).values({
      vendorId,
      direction: "out",
      channel: "email",
      bodyOriginal: "Hello",
      status: "draft",
    });

    // Add research note
    await db.insert(schema.researchNotes).values({
      vendorId,
      content: "Test note",
      sourceType: "web",
    });

    // Add budget entry referencing vendor
    await router.handle(db, "budget.create", {
      categoryId: 1,
      vendorId,
      description: "Venue deposit",
      estimatedActual: 1000,
    });

    // Add task referencing vendor
    await router.handle(db, "tasks.create", {
      title: "Contact venue",
      vendorId,
      status: "pending",
    });

    // Delete vendor
    await router.handle(db, "vendors.delete", { id: vendorId });

    // Verify vendor is gone
    const vendors = (await router.handle(db, "vendors.list", {})) as unknown[];
    expect(vendors).toHaveLength(0);

    // Verify children are gone
    const attrs = (await router.handle(db, "vendor-attributes.list", { vendorId })) as unknown[];
    expect(attrs).toHaveLength(0);

    const quotes = (await router.handle(db, "quotes.list", { vendorId })) as unknown[];
    expect(quotes).toHaveLength(0);

    const comms = (await router.handle(db, "communications.list", { vendorId })) as unknown[];
    expect(comms).toHaveLength(0);

    const notes = (await router.handle(db, "research-notes.list", { vendorId })) as unknown[];
    expect(notes).toHaveLength(0);

    // Verify budget entry still exists but vendorId is null
    const budget = (await router.handle(db, "budget.list", {})) as Array<Record<string, unknown>>;
    expect(budget).toHaveLength(1);
    expect(budget[0].vendorId).toBeNull();

    // Verify task still exists but vendorId is null
    const taskList = (await router.handle(db, "tasks.list", {})) as Array<Record<string, unknown>>;
    expect(taskList).toHaveLength(1);
    expect(taskList[0].vendorId).toBeNull();
  });
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/vendors.test.ts`
Expected: FAIL — foreign key constraint errors (vendor deleted without removing children) or children left orphaned

**Step 3: Rewrite vendors.delete with cascade**

Replace `packages/gateway/src/handlers/vendors.ts` entirely:

```typescript
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  vendors,
  vendorAttributes,
  quotes,
  quoteLineItems,
  communications,
  researchNotes,
  budgetEntries,
  tasks,
  agentTasks,
} from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerVendorHandlers(router: Router) {
  router.register("vendors.list", async (db: Db, params: unknown) => {
    const filters = (params as { categoryId?: number; status?: string } | undefined) ?? {};
    const conditions = [];

    if (filters.categoryId) {
      conditions.push(eq(vendors.categoryId, filters.categoryId));
    }
    if (filters.status) {
      conditions.push(eq(vendors.status, filters.status));
    }

    if (conditions.length > 0) {
      return db.select().from(vendors).where(and(...conditions)).orderBy(vendors.name);
    }
    return db.select().from(vendors).orderBy(vendors.name);
  });

  router.register("vendors.get", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [row] = await db.select().from(vendors).where(eq(vendors.id, id));
    if (!row) throw new Error(`Vendor ${id} not found`);
    return row;
  });

  router.register("vendors.create", async (db: Db, params: unknown) => {
    const data = params as typeof vendors.$inferInsert;
    const result = await db.insert(vendors).values(data).returning();
    return result[0];
  });

  router.register("vendors.update", async (db: Db, params: unknown) => {
    const { id, ...data } = params as { id: number } & Record<string, unknown>;
    data.updatedAt = sql`datetime('now')`;
    await db.update(vendors).set(data).where(eq(vendors.id, id));
    const [updated] = await db.select().from(vendors).where(eq(vendors.id, id));
    return updated;
  });

  router.register("vendors.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };

    // Get all quote IDs for this vendor so we can delete their line items
    const vendorQuotes = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.vendorId, id));
    const quoteIds = vendorQuotes.map((q) => q.id);

    // Delete in dependency order within a transaction
    await db.transaction(async (tx) => {
      // Delete quote line items
      if (quoteIds.length > 0) {
        await tx.delete(quoteLineItems).where(inArray(quoteLineItems.quoteId, quoteIds));
      }
      // Delete quotes
      await tx.delete(quotes).where(eq(quotes.vendorId, id));
      // Delete vendor attributes
      await tx.delete(vendorAttributes).where(eq(vendorAttributes.vendorId, id));
      // Delete communications
      await tx.delete(communications).where(eq(communications.vendorId, id));
      // Delete research notes
      await tx.delete(researchNotes).where(eq(researchNotes.vendorId, id));
      // Nullify optional vendor references
      await tx.update(budgetEntries).set({ vendorId: null }).where(eq(budgetEntries.vendorId, id));
      await tx.update(tasks).set({ vendorId: null }).where(eq(tasks.vendorId, id));
      await tx.update(agentTasks).set({ vendorId: null }).where(eq(agentTasks.vendorId, id));
      // Delete the vendor
      await tx.delete(vendors).where(eq(vendors.id, id));
    });

    return { ok: true };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gateway && npx vitest run tests/handlers/vendors.test.ts`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All existing tests still pass

**Step 6: Commit**

```bash
git add packages/gateway/src/handlers/vendors.ts packages/gateway/tests/handlers/vendors.test.ts
git commit -m "feat: cascade vendor delete with transaction"
```

---

### Task 5: Create reusable `ConfirmDialog` component

**Files:**
- Create: `packages/app/src/renderer/components/common/ConfirmDialog.tsx`

**Step 1: Create the component**

```tsx
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
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

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={onCancel}
                disabled={loading}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Deleting..." : confirmLabel}
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
git add packages/app/src/renderer/components/common/ConfirmDialog.tsx
git commit -m "feat: add reusable ConfirmDialog component"
```

---

### Task 6: Add delete button to VendorHeader (cascade vendor delete)

**Files:**
- Modify: `packages/app/src/renderer/components/vendors/VendorHeader.tsx`
- Modify: `packages/app/src/renderer/components/vendors/VendorDetailView.tsx`

**Step 1: Update VendorHeader to accept `onDelete` prop**

Replace `packages/app/src/renderer/components/vendors/VendorHeader.tsx`:

```tsx
import { ArrowLeft, MapPin, Globe, Mail, Phone, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { VendorStatusBadge } from "./VendorStatusBadge";
import { VendorActions } from "./VendorActions";

interface Vendor {
  id: number;
  name: string;
  location: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  description: string | null;
}

export function VendorHeader({
  vendor,
  onStatusChange,
  onDelete,
}: {
  vendor: Vendor;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate("/vendors")}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to vendors
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{vendor.name}</h1>
            <VendorStatusBadge status={vendor.status} />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            {vendor.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {vendor.location}
              </span>
            )}
            {vendor.websiteUrl && (
              <span className="flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                {vendor.websiteUrl}
              </span>
            )}
            {vendor.contactEmail && (
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {vendor.contactEmail}
              </span>
            )}
            {vendor.contactPhone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {vendor.contactPhone}
              </span>
            )}
          </div>

          {vendor.description && (
            <p className="text-sm text-gray-400 max-w-2xl">{vendor.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <VendorActions vendor={vendor} onStatusChange={onStatusChange} />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Wire up delete in VendorDetailView**

Replace `packages/app/src/renderer/components/vendors/VendorDetailView.tsx`:

```tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useVendor } from "../../hooks/useVendors";
import { useMutation } from "../../hooks/useRequest";
import { VendorHeader } from "./VendorHeader";
import { VendorAttributes } from "./VendorAttributes";
import { VendorQuotes } from "./VendorQuotes";
import { VendorComms } from "./VendorComms";
import { VendorNotes } from "./VendorNotes";
import { Skeleton } from "../common/Skeleton";
import { ConfirmDialog } from "../common/ConfirmDialog";

const TABS = ["Overview", "Quotes", "Communications", "Notes"] as const;
type Tab = (typeof TABS)[number];

export function VendorDetailView() {
  const { id } = useParams<{ id: string }>();
  const vendorId = Number(id);
  const navigate = useNavigate();
  const { data: vendor, loading, refetch } = useVendor(vendorId);
  const { mutate: updateVendor } = useMutation("vendors.update");
  const { mutate: deleteVendor, loading: deleting } = useMutation<{ id: number }>("vendors.delete");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleStatusChange(status: string) {
    await updateVendor({ id: vendorId, status });
    refetch();
  }

  async function handleDelete() {
    await deleteVendor({ id: vendorId });
    navigate("/vendors");
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Vendor not found
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <VendorHeader
        vendor={vendor}
        onStatusChange={handleStatusChange}
        onDelete={() => setShowDeleteConfirm(true)}
      />

      <div className="border-b border-white/10">
        <div className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-white border-b-2 border-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === "Overview" && (
          <div className="space-y-4">
            <VendorAttributes vendorId={vendorId} />
            <VendorQuotes vendorId={vendorId} />
          </div>
        )}
        {activeTab === "Quotes" && <VendorQuotes vendorId={vendorId} />}
        {activeTab === "Communications" && <VendorComms vendorId={vendorId} />}
        {activeTab === "Notes" && <VendorNotes vendorId={vendorId} />}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={`Delete ${vendor.name}?`}
        message="This will permanently delete this vendor and all related quotes, communications, and research notes."
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deleting}
      />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/vendors/VendorHeader.tsx packages/app/src/renderer/components/vendors/VendorDetailView.tsx
git commit -m "feat: add vendor delete button with confirmation dialog"
```

---

### Task 7: Add delete button to quotes (VendorQuotes)

**Files:**
- Modify: `packages/app/src/renderer/components/vendors/VendorQuotes.tsx`

**Step 1: Add delete button to each QuoteCard**

Replace `packages/app/src/renderer/components/vendors/VendorQuotes.tsx`:

```tsx
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { Card, CardHeader, CardContent } from "../common/Card";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { QuoteLineItems } from "./QuoteLineItems";
import { Skeleton } from "../common/Skeleton";
import { ConfirmDialog } from "../common/ConfirmDialog";

interface Quote {
  id: number;
  totalAmount: number;
  currency: string;
  source: string | null;
  receivedAt: string;
  lineItems?: LineItem[];
}

interface LineItem {
  id: number;
  description: string;
  amount: number;
  pricingType: string;
  unitPrice: number | null;
  quantity: number | null;
  notes: string | null;
}

interface QuoteWithItems extends Quote {
  lineItems: LineItem[];
}

function QuoteCard({
  quoteId,
  currency,
  onDeleted,
}: {
  quoteId: number;
  currency: string;
  onDeleted: () => void;
}) {
  const { data: quote, loading } = useRequest<QuoteWithItems>("quotes.get", {
    id: quoteId,
  });
  const { mutate: deleteQuote, loading: deleting } = useMutation<{ id: number }>("quotes.delete");
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDelete() {
    await deleteQuote({ id: quoteId });
    setShowConfirm(false);
    onDeleted();
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!quote) return null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-white">
              <CurrencyDisplay amount={quote.totalAmount} currency={currency} />
            </span>
            {quote.source && (
              <span className="ml-2 text-xs text-gray-500">via {quote.source}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {new Date(quote.receivedAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => setShowConfirm(true)}
              className="rounded p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </CardHeader>
        {quote.lineItems.length > 0 && (
          <CardContent>
            <QuoteLineItems lineItems={quote.lineItems} currency={currency} />
          </CardContent>
        )}
      </Card>

      <ConfirmDialog
        open={showConfirm}
        title="Delete quote?"
        message={`Delete this ${currency} ${quote.totalAmount.toLocaleString()} quote and all its line items?`}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
        loading={deleting}
      />
    </>
  );
}

export function VendorQuotes({ vendorId }: { vendorId: number }) {
  const { data: quotesList, loading, refetch } = useRequest<Quote[]>("quotes.list", {
    vendorId,
  });

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!quotesList || quotesList.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">No quotes yet</p>
    );
  }

  return (
    <div className="space-y-3">
      {quotesList.map((q) => (
        <QuoteCard key={q.id} quoteId={q.id} currency={q.currency} onDeleted={refetch} />
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/app/src/renderer/components/vendors/VendorQuotes.tsx
git commit -m "feat: add delete button to quote cards"
```

---

### Task 8: Add delete button to outreach draft cards

**Files:**
- Modify: `packages/app/src/renderer/components/outreach/DraftCard.tsx`
- Modify: `packages/app/src/renderer/components/outreach/OutreachView.tsx`

**Step 1: Add `onDelete` prop to DraftCard**

In `packages/app/src/renderer/components/outreach/DraftCard.tsx`, add `Trash2` to the lucide import and `onDelete` to the props interface and render a trash button next to the Edit button:

Add to the imports:
```tsx
import { Mail, MessageCircle, Pencil, Trash2 } from "lucide-react";
```

Add to `DraftCardProps`:
```tsx
  onDelete: () => void;
```

Add to the destructured props:
```tsx
  onDelete,
```

In the bottom action bar (line 108-119), add a delete button next to the Edit button when not editing:

```tsx
          {!editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={onStartEdit}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
```

And remove the existing standalone Edit button (lines 109-116) and the `{!editing && (` block for ApprovalActions — restructure to:

```tsx
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          {editing ? (
            <div className="flex gap-2">
              <button
                onClick={() => onSaveEdit(editBody)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onStartEdit}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}

          {!editing && (
            <ApprovalActions onApprove={onApprove} onReject={onReject} />
          )}
        </div>
```

**Step 2: Wire up delete in OutreachView**

In `packages/app/src/renderer/components/outreach/OutreachView.tsx`:

Add delete mutation and confirm dialog state:

```tsx
import { ConfirmDialog } from "../common/ConfirmDialog";
```

Add after the existing `useMutation` calls:
```tsx
  const { mutate: deleteComm, loading: deleting } = useMutation<{ id: number }>("communications.delete");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; vendorName: string } | null>(null);
```

Add handler:
```tsx
  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteComm({ id: deleteTarget.id });
    setDeleteTarget(null);
    refetch();
  }
```

Pass `onDelete` to `DraftCard`:
```tsx
              onDelete={() => setDeleteTarget({ id: draft.id, vendorName: draft.vendorName ?? "Unknown" })}
```

Add ConfirmDialog at the end of the component (before closing `</div>`):
```tsx
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete draft?"
        message={`Delete this outreach draft for ${deleteTarget?.vendorName}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
```

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/outreach/DraftCard.tsx packages/app/src/renderer/components/outreach/OutreachView.tsx
git commit -m "feat: add delete button to outreach draft cards"
```

---

### Task 9: Add delete button to budget entry rows

**Files:**
- Modify: `packages/app/src/renderer/components/budget/BudgetVendorRow.tsx`
- Modify: `packages/app/src/renderer/components/budget/BudgetCategoryRow.tsx`
- Modify: `packages/app/src/renderer/components/budget/BudgetView.tsx`

**Step 1: Add delete to BudgetVendorRow**

Replace `packages/app/src/renderer/components/budget/BudgetVendorRow.tsx`:

```tsx
import { Trash2 } from "lucide-react";
import { CurrencyDisplay } from "../common/CurrencyDisplay";

interface BudgetEntry {
  id: number;
  description: string;
  highEstimate: number | null;
  lowEstimate: number | null;
  estimatedActual: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  notes: string | null;
}

export function BudgetVendorRow({
  entry,
  currency,
  onDelete,
}: {
  entry: BudgetEntry;
  currency: string;
  onDelete: (id: number) => void;
}) {
  return (
    <tr className="border-b border-white/5 text-sm group">
      <td className="py-2 pl-10 pr-4 text-gray-300">
        <div className="flex items-center gap-2">
          {entry.description}
          <button
            onClick={() => onDelete(entry.id)}
            className="rounded p-1 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.highEstimate} currency={currency} className="text-gray-400" />
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.lowEstimate} currency={currency} className="text-gray-400" />
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.estimatedActual} currency={currency} />
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.amountPaid} currency={currency} />
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.balanceDue} currency={currency} />
      </td>
    </tr>
  );
}
```

**Step 2: Pass `onDelete` through BudgetCategoryRow**

In `packages/app/src/renderer/components/budget/BudgetCategoryRow.tsx`, add an `onDeleteEntry` prop:

```tsx
export function BudgetCategoryRow({
  data,
  currency,
  onDeleteEntry,
}: {
  data: CategoryBudget;
  currency: string;
  onDeleteEntry: (id: number) => void;
}) {
```

Pass it through to BudgetVendorRow:
```tsx
  <BudgetVendorRow key={entry.id} entry={entry} currency={currency} onDelete={onDeleteEntry} />
```

**Step 3: Wire up in BudgetView**

In `packages/app/src/renderer/components/budget/BudgetView.tsx`:

Add imports:
```tsx
import { useState } from "react";
import { useMutation } from "../../hooks/useRequest";
import { ConfirmDialog } from "../common/ConfirmDialog";
```

Add state and mutation:
```tsx
  const { mutate: deleteBudgetEntry, loading: deleting } = useMutation<{ id: number }>("budget.delete");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
```

Add handler:
```tsx
  async function handleDeleteEntry() {
    if (deleteTarget === null) return;
    await deleteBudgetEntry({ id: deleteTarget });
    setDeleteTarget(null);
    refetch();
  }
```

Update BudgetCategoryRow usage:
```tsx
  <BudgetCategoryRow key={cb.category.id} data={cb} currency={currency} onDeleteEntry={setDeleteTarget} />
```

Add ConfirmDialog before closing `</div>`:
```tsx
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete budget entry?"
        message="This budget entry will be permanently removed."
        onConfirm={handleDeleteEntry}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
```

**Step 4: Commit**

```bash
git add packages/app/src/renderer/components/budget/BudgetVendorRow.tsx packages/app/src/renderer/components/budget/BudgetCategoryRow.tsx packages/app/src/renderer/components/budget/BudgetView.tsx
git commit -m "feat: add delete button to budget entry rows"
```

---

### Task 10: Run full test suite and verify build

**Step 1: Run gateway tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 2: Build the app**

Run: `cd packages/app && npx electron-vite build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Commit any fixes if needed**

---

### Task 11: Final review

Review all changes for consistency:
- All delete handlers return `{ ok: true }`
- All UI delete buttons use `Trash2` icon with red styling
- All destructive actions go through `ConfirmDialog`
- Vendor cascade delete is wrapped in a transaction
- Category delete is blocked when vendors are assigned
