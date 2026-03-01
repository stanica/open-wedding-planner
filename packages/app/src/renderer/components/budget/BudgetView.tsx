import { useState } from "react";
import { DollarSign } from "lucide-react";
import { useBudgetData } from "../../hooks/useBudget";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { BudgetSummaryBar } from "./BudgetSummaryBar";
import { BudgetCategoryRow } from "./BudgetCategoryRow";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { EmptyState } from "../common/EmptyState";
import { Skeleton } from "../common/Skeleton";

interface WeddingConfig {
  totalBudget: number | null;
  currency: string;
}

export function BudgetView() {
  const { data, loading, refetch } = useBudgetData();
  const { data: config } = useRequest<WeddingConfig>("wedding-config.get");
  const { mutate: deleteBudgetEntry, loading: deleting } = useMutation<{ id: number }>("budget.delete");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const currency = config?.currency ?? "EUR";

  async function handleDeleteEntry() {
    if (deleteTarget === null) return;
    await deleteBudgetEntry({ id: deleteTarget });
    setDeleteTarget(null);
    refetch();
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data || data.categoryBudgets.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold">Budget</h1>
        <EmptyState
          icon={DollarSign}
          title="No budget data"
          description="Import budget CSV to populate the budget view"
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Budget</h1>

      <BudgetSummaryBar
        totalBudget={config?.totalBudget ?? null}
        estimatedActual={data.grandTotals.estimatedActual}
        totalPaid={data.grandTotals.paid}
        currency={currency}
      />

      <div className="rounded-xl border border-border bg-surface-elevated overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-on-surface-secondary">
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">High</th>
              <th className="px-4 py-3 text-right font-medium">Low</th>
              <th className="px-4 py-3 text-right font-medium">Estimated</th>
              <th className="px-4 py-3 text-right font-medium">Paid</th>
              <th className="px-4 py-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.categoryBudgets.map((cb) => (
              <BudgetCategoryRow key={cb.category.id} data={cb} currency={currency} onDeleteEntry={setDeleteTarget} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right">
                <CurrencyDisplay amount={data.grandTotals.high || null} currency={currency} />
              </td>
              <td className="px-4 py-3 text-right">
                <CurrencyDisplay amount={data.grandTotals.low || null} currency={currency} />
              </td>
              <td className="px-4 py-3 text-right">
                <CurrencyDisplay amount={data.grandTotals.estimatedActual || null} currency={currency} />
              </td>
              <td className="px-4 py-3 text-right">
                <CurrencyDisplay amount={data.grandTotals.paid || null} currency={currency} />
              </td>
              <td className="px-4 py-3 text-right">
                <CurrencyDisplay amount={data.grandTotals.balanceDue || null} currency={currency} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete budget entry?"
        message="This budget entry will be permanently removed."
        onConfirm={handleDeleteEntry}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
