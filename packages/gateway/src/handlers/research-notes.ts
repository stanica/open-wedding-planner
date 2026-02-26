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
