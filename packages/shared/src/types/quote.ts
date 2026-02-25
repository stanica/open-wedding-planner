import { z } from "zod";

export const PricingType = z.enum(["flat", "per_person", "per_unit", "per_hour"]);
export type PricingType = z.infer<typeof PricingType>;

export const QuoteSource = z.enum(["email", "pdf", "web", "whatsapp"]);
export type QuoteSource = z.infer<typeof QuoteSource>;

export const Quote = z.object({
  id: z.number(),
  vendorId: z.number(),
  totalAmount: z.number(),
  currency: z.string(),
  validUntil: z.string().nullable(),
  rawText: z.string().nullable(),
  source: QuoteSource,
  receivedAt: z.string(),
});
export type Quote = z.infer<typeof Quote>;

export const QuoteLineItem = z.object({
  id: z.number(),
  quoteId: z.number(),
  description: z.string(),
  amount: z.number(),
  pricingType: PricingType,
  unitPrice: z.number().nullable(),
  quantity: z.number().nullable(),
  notes: z.string().nullable(),
});
export type QuoteLineItem = z.infer<typeof QuoteLineItem>;
