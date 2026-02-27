import { eq } from "drizzle-orm";
import { vendorImages } from "../db/schema.js";
import { saveImageFromBase64, deleteImageFile } from "../tools/save-image.js";
import type { Router, Db } from "../infra/router.js";

export function registerVendorImageHandlers(router: Router, imagesDir: string) {
  router.register("vendor-images.list", async (db: Db, params: unknown) => {
    const { vendorId } = params as { vendorId: number };
    return db
      .select()
      .from(vendorImages)
      .where(eq(vendorImages.vendorId, vendorId))
      .orderBy(vendorImages.sortOrder);
  });

  router.register("vendor-images.upload", async (db: Db, params: unknown) => {
    const { vendorId, base64, mimeType, caption, originalUrl } = params as {
      vendorId: number;
      base64: string;
      mimeType: string;
      caption?: string;
      originalUrl?: string;
    };

    const { filename } = await saveImageFromBase64(base64, mimeType, vendorId, imagesDir);

    // Get next sort order
    const existing = await db
      .select()
      .from(vendorImages)
      .where(eq(vendorImages.vendorId, vendorId));
    const nextOrder = existing.length;

    const [row] = await db
      .insert(vendorImages)
      .values({
        vendorId,
        filename,
        originalUrl: originalUrl ?? null,
        caption: caption ?? null,
        sortOrder: nextOrder,
      })
      .returning();

    return row;
  });

  router.register("vendor-images.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [image] = await db.select().from(vendorImages).where(eq(vendorImages.id, id));
    if (image) {
      deleteImageFile(image.vendorId, image.filename, imagesDir);
      await db.delete(vendorImages).where(eq(vendorImages.id, id));
    }
    return { ok: true };
  });

  router.register("vendor-images.reorder", async (db: Db, params: unknown) => {
    const { order } = params as { order: Array<{ id: number; sortOrder: number }> };
    for (const item of order) {
      await db
        .update(vendorImages)
        .set({ sortOrder: item.sortOrder })
        .where(eq(vendorImages.id, item.id));
    }
    return { ok: true };
  });
}
