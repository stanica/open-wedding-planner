import fs from "node:fs";
import path from "node:path";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  vendors,
  vendorAttributes,
  vendorImages,
  quotes,
  quoteLineItems,
  communications,
  researchNotes,
  budgetEntries,
  tasks,
  agentTasks,
} from "../db/schema.js";
import { getImagesDir } from "../config/paths.js";
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

    // Clean up image files from disk
    const imagesPath = path.join(getImagesDir(), String(id));
    if (fs.existsSync(imagesPath)) {
      fs.rmSync(imagesPath, { recursive: true, force: true });
    }

    // Delete in dependency order within a transaction
    // Note: better-sqlite3 transactions are synchronous — no async/await inside
    db.transaction((tx) => {
      // Delete quote line items
      if (quoteIds.length > 0) {
        tx.delete(quoteLineItems).where(inArray(quoteLineItems.quoteId, quoteIds)).run();
      }
      // Delete quotes
      tx.delete(quotes).where(eq(quotes.vendorId, id)).run();
      // Delete vendor images
      tx.delete(vendorImages).where(eq(vendorImages.vendorId, id)).run();
      // Delete vendor attributes
      tx.delete(vendorAttributes).where(eq(vendorAttributes.vendorId, id)).run();
      // Delete communications
      tx.delete(communications).where(eq(communications.vendorId, id)).run();
      // Delete research notes
      tx.delete(researchNotes).where(eq(researchNotes.vendorId, id)).run();
      // Nullify optional vendor references
      tx.update(budgetEntries).set({ vendorId: null }).where(eq(budgetEntries.vendorId, id)).run();
      tx.update(tasks).set({ vendorId: null }).where(eq(tasks.vendorId, id)).run();
      tx.update(agentTasks).set({ vendorId: null }).where(eq(agentTasks.vendorId, id)).run();
      // Delete the vendor
      tx.delete(vendors).where(eq(vendors.id, id)).run();
    });

    return { ok: true };
  });
}
