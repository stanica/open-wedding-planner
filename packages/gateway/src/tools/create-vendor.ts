import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendors, categories } from "../db/schema.js";
import type { Db } from "../infra/router.js";

export interface CreateVendorContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
}

export function makeCreateVendorTool(ctx: CreateVendorContext) {
  return tool({
    description:
      "Create a new vendor record in the database. Use this after gathering sufficient information about a vendor. Avoid creating duplicates.",
    inputSchema: z.object({
      name: z.string().describe("The vendor's business name"),
      categoryName: z
        .string()
        .describe(
          "Category: Venue/Food/Beverage, Ceremony, Photography/Videography, Decor, Stationery, Attire, Entertainment, Planner/Coordinator, Miscellaneous, or Contingency",
        ),
      location: z.string().nullable().describe("Vendor location"),
      websiteUrl: z.string().nullable().describe("Vendor website URL"),
      contactEmail: z.string().nullable().describe("Contact email"),
      contactPhone: z.string().nullable().describe("Contact phone number"),
      description: z
        .string()
        .nullable()
        .describe("Brief description of services and what was found"),
      imageUrl: z
        .string()
        .nullable()
        .describe("URL of a representative image (e.g. from og:image meta tag)"),
    }),
    execute: async (params) => {
      ctx.emit("creating-vendor", `Adding vendor: ${params.name}`);

      const [cat] = await ctx.db
        .select()
        .from(categories)
        .where(eq(categories.name, params.categoryName));
      const categoryId = cat?.id ?? 9;

      const [vendor] = await ctx.db
        .insert(vendors)
        .values({
          categoryId,
          name: params.name,
          location: params.location,
          websiteUrl: params.websiteUrl,
          contactEmail: params.contactEmail,
          contactPhone: params.contactPhone,
          description: params.description,
          imageUrl: params.imageUrl,
          status: "researched",
        })
        .returning();

      return { vendorId: vendor.id, name: vendor.name };
    },
  });
}
