import fs from "node:fs";
import {
  vendors,
  vendorAttributes,
  vendorImages,
  quotes,
  quoteLineItems,
  communications,
  researchNotes,
  researchMessages,
  researchThreads,
  budgetEntries,
  tasks,
  agentTasks,
} from "../db/schema.js";
import { getImagesDir } from "../config/paths.js";
import type { Router, Db } from "../infra/router.js";

export function registerDataManagementHandlers(router: Router) {
  router.register("data.clear-vendors", async (db: Db) => {
    // Collect all vendor IDs for image directory cleanup
    const allVendors = await db.select({ id: vendors.id }).from(vendors);
    const imagesDir = getImagesDir();

    db.transaction((tx) => {
      // Delete in FK order
      tx.delete(quoteLineItems).run();
      tx.delete(quotes).run();
      tx.delete(vendorImages).run();
      tx.delete(vendorAttributes).run();
      tx.delete(communications).run();
      tx.delete(researchNotes).run();

      // Nullify optional vendor references
      tx.update(budgetEntries).set({ vendorId: null }).run();
      tx.update(tasks).set({ vendorId: null }).run();
      tx.update(agentTasks).set({ vendorId: null }).run();

      // Delete all vendors
      tx.delete(vendors).run();
    });

    // Clean up image directories from disk
    for (const v of allVendors) {
      const vendorImagesPath = `${imagesDir}/${v.id}`;
      if (fs.existsSync(vendorImagesPath)) {
        fs.rmSync(vendorImagesPath, { recursive: true, force: true });
      }
    }

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
    db.transaction((tx) => {
      tx.delete(communications).run();
    });

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
