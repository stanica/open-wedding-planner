import { z } from "zod";

export const BudgetEntry = z.object({
  id: z.number(),
  categoryId: z.number(),
  vendorId: z.number().nullable(),
  description: z.string(),
  highEstimate: z.number().nullable(),
  lowEstimate: z.number().nullable(),
  estimatedActual: z.number().nullable(),
  amountPaid: z.number().nullable(),
  balanceDue: z.number().nullable(),
  finalPaymentDue: z.string().nullable(),
  paidBy: z.string().nullable(),
  notes: z.string().nullable(),
});
export type BudgetEntry = z.infer<typeof BudgetEntry>;
