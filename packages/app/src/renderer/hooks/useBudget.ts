import { useRequest } from "./useRequest";

interface BudgetEntry {
  id: number;
  categoryId: number;
  description: string;
  highEstimate: number | null;
  lowEstimate: number | null;
  estimatedActual: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  finalPaymentDue: string | null;
  paidBy: string | null;
  notes: string | null;
}

interface Category {
  id: number;
  name: string;
  budgetPercentLow: number;
  budgetPercentHigh: number;
  sortOrder: number;
}

export interface CategoryBudget {
  category: Category;
  entries: BudgetEntry[];
  totalHigh: number;
  totalLow: number;
  totalEstimatedActual: number;
  totalPaid: number;
  totalBalanceDue: number;
}

export function useBudgetData() {
  const { data: entries, loading: entriesLoading, refetch } = useRequest<BudgetEntry[]>("budget.list");
  const { data: categories, loading: categoriesLoading } = useRequest<Category[]>("categories.list");

  const loading = entriesLoading || categoriesLoading;

  if (loading || !entries || !categories) {
    return { data: null, loading, refetch };
  }

  const byCategory = new Map<number, BudgetEntry[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.categoryId) ?? [];
    list.push(entry);
    byCategory.set(entry.categoryId, list);
  }

  const sum = (arr: BudgetEntry[], key: keyof BudgetEntry) =>
    arr.reduce((acc, e) => acc + ((e[key] as number) ?? 0), 0);

  const categoryBudgets: CategoryBudget[] = categories
    .filter((c) => byCategory.has(c.id))
    .map((category) => {
      const catEntries = byCategory.get(category.id)!;
      return {
        category,
        entries: catEntries,
        totalHigh: sum(catEntries, "highEstimate"),
        totalLow: sum(catEntries, "lowEstimate"),
        totalEstimatedActual: sum(catEntries, "estimatedActual"),
        totalPaid: sum(catEntries, "amountPaid"),
        totalBalanceDue: sum(catEntries, "balanceDue"),
      };
    });

  const grandTotals = {
    high: categoryBudgets.reduce((s, c) => s + c.totalHigh, 0),
    low: categoryBudgets.reduce((s, c) => s + c.totalLow, 0),
    estimatedActual: categoryBudgets.reduce((s, c) => s + c.totalEstimatedActual, 0),
    paid: categoryBudgets.reduce((s, c) => s + c.totalPaid, 0),
    balanceDue: categoryBudgets.reduce((s, c) => s + c.totalBalanceDue, 0),
  };

  return { data: { categoryBudgets, grandTotals }, loading, refetch };
}
