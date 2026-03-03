import { z } from "zod";

export const WeddingConfig = z.object({
  weddingDate: z.string().nullable(),
  guestCount: z.number().nullable(),
  budgetTotal: z.number().nullable(),
  currency: z.string().default("EUR"),
  coupleNames: z.string().nullable(),
  coupleEmail: z.string().nullable(),
  location: z.string().nullable(),
  languagePreferences: z.array(z.string()).default(["en", "it"]),
  dietaryRequirements: z.string().nullable(),
  alcoholPreferences: z.string().nullable(),
  otherInfo: z.string().nullable(),
});
export type WeddingConfig = z.infer<typeof WeddingConfig>;
