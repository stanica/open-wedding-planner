import { z } from "zod";

export const VendorStatus = z.enum([
  "researched",
  "contacted",
  "quoted",
  "booked",
  "rejected",
]);
export type VendorStatus = z.infer<typeof VendorStatus>;

export const VendorAttributeType = z.enum(["text", "number", "boolean", "date"]);
export type VendorAttributeType = z.infer<typeof VendorAttributeType>;

export const Vendor = z.object({
  id: z.number(),
  categoryId: z.number(),
  name: z.string(),
  location: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactWhatsapp: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  status: VendorStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Vendor = z.infer<typeof Vendor>;

export const VendorAttribute = z.object({
  id: z.number(),
  vendorId: z.number(),
  key: z.string(),
  value: z.string(),
  type: VendorAttributeType,
});
export type VendorAttribute = z.infer<typeof VendorAttribute>;
