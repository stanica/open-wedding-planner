import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendorImages } from "../db/schema.js";
import { saveImageFromUrl, saveImageFromBase64 } from "./save-image.js";
import type { Db } from "../infra/router.js";

export interface AddVendorImagesContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
  imagesDir: string;
  fetchFn?: (url: string) => Promise<Response>;
}

export function makeAddVendorImagesTool(ctx: AddVendorImagesContext) {
  return tool({
    description:
      "Add images to a vendor's photo gallery. Accepts URLs (downloaded automatically) or base64 data. Use this after scraping a vendor's website to save their photos.",
    inputSchema: z.object({
      vendorId: z.number().describe("The vendor ID to add images to"),
      images: z.array(
        z.object({
          url: z.string().optional().describe("Image URL to download"),
          data: z.string().optional().describe("Base64-encoded image data"),
          mimeType: z.string().optional().describe("MIME type (required with data), e.g. image/jpeg"),
          caption: z.string().optional().describe("Descriptive caption for the image"),
        }),
      ).describe("Array of images to add"),
    }),
    execute: async ({ vendorId, images }) => {
      ctx.emit("adding-images", `Adding ${images.length} image(s) to vendor ${vendorId}`);

      const existing = await ctx.db
        .select()
        .from(vendorImages)
        .where(eq(vendorImages.vendorId, vendorId));
      let nextOrder = existing.length;

      const results: Array<{ filename: string; caption: string | null }> = [];
      const errors: string[] = [];

      for (const image of images) {
        try {
          let filename: string;
          let originalUrl: string | null = null;

          if (image.url) {
            originalUrl = image.url;
            ({ filename } = await saveImageFromUrl(image.url, vendorId, ctx.imagesDir, ctx.fetchFn));
          } else if (image.data && image.mimeType) {
            ({ filename } = await saveImageFromBase64(image.data, image.mimeType, vendorId, ctx.imagesDir));
          } else {
            errors.push("Image must have either url or data+mimeType");
            continue;
          }

          await ctx.db.insert(vendorImages).values({
            vendorId,
            filename,
            originalUrl,
            caption: image.caption ?? null,
            sortOrder: nextOrder++,
          });

          results.push({ filename, caption: image.caption ?? null });
        } catch (err) {
          errors.push(`Failed to save image: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { saved: results.length, failed: errors.length, images: results, errors };
    },
  });
}
