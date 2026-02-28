import { z } from "zod";

export const Category = z.object({
  id: z.number(),
  name: z.string(),
  budgetPercentLow: z.number(),
  budgetPercentHigh: z.number(),
  budgetFixed: z.number().nullable(),
  sortOrder: z.number(),
});
export type Category = z.infer<typeof Category>;

export interface DefaultCategory {
  name: string;
  budgetPercentLow: number;
  budgetPercentHigh: number;
  sortOrder: number;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Venue", budgetPercentLow: 25, budgetPercentHigh: 30, sortOrder: 1 },
  { name: "Food/Beverage", budgetPercentLow: 17, budgetPercentHigh: 20, sortOrder: 2 },
  { name: "Ceremony", budgetPercentLow: 2, budgetPercentHigh: 3, sortOrder: 3 },
  { name: "Photography/Videography", budgetPercentLow: 18, budgetPercentHigh: 20, sortOrder: 4 },
  { name: "Decor", budgetPercentLow: 5, budgetPercentHigh: 8, sortOrder: 5 },
  { name: "Stationery", budgetPercentLow: 1, budgetPercentHigh: 2, sortOrder: 6 },
  { name: "Attire", budgetPercentLow: 3, budgetPercentHigh: 5, sortOrder: 7 },
  { name: "Entertainment", budgetPercentLow: 5, budgetPercentHigh: 8, sortOrder: 8 },
  { name: "Planner/Coordinator", budgetPercentLow: 8, budgetPercentHigh: 10, sortOrder: 9 },
  { name: "Miscellaneous", budgetPercentLow: 2, budgetPercentHigh: 3, sortOrder: 10 },
  { name: "Contingency", budgetPercentLow: 3, budgetPercentHigh: 5, sortOrder: 11 },
];
