import { eq, and } from "drizzle-orm";
import { vendorAttributes } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerVendorAttributeHandlers(router: Router) {
  router.register("vendor-attributes.list", async (db: Db, params: unknown) => {
    const { vendorId } = params as { vendorId: number };
    return db.select().from(vendorAttributes).where(eq(vendorAttributes.vendorId, vendorId));
  });

  router.register("vendor-attributes.set", async (db: Db, params: unknown) => {
    const { vendorId, key, value, type } = params as {
      vendorId: number;
      key: string;
      value: string;
      type?: string;
    };

    const existing = await db
      .select()
      .from(vendorAttributes)
      .where(and(eq(vendorAttributes.vendorId, vendorId), eq(vendorAttributes.key, key)));

    if (existing.length > 0) {
      await db
        .update(vendorAttributes)
        .set({ value, type: type ?? "text" })
        .where(eq(vendorAttributes.id, existing[0].id));
      const [updated] = await db
        .select()
        .from(vendorAttributes)
        .where(eq(vendorAttributes.id, existing[0].id));
      return updated;
    }

    const result = await db
      .insert(vendorAttributes)
      .values({ vendorId, key, value, type: type ?? "text" })
      .returning();
    return result[0];
  });

  router.register("vendor-attributes.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(vendorAttributes).where(eq(vendorAttributes.id, id));
    return { ok: true };
  });
}
