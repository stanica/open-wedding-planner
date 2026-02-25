import { CurrencyDisplay } from "../common/CurrencyDisplay";

interface BudgetSummaryBarProps {
  totalBudget: number | null;
  estimatedActual: number;
  totalPaid: number;
  currency?: string;
}

export function BudgetSummaryBar({
  totalBudget,
  estimatedActual,
  totalPaid,
  currency = "EUR",
}: BudgetSummaryBarProps) {
  const budget = totalBudget ?? estimatedActual;
  const utilization = budget > 0 ? (estimatedActual / budget) * 100 : 0;

  let barColor = "bg-green-500";
  let textColor = "text-green-400";
  if (utilization > 100) {
    barColor = "bg-red-500";
    textColor = "text-red-400";
  } else if (utilization >= 80) {
    barColor = "bg-yellow-500";
    textColor = "text-yellow-400";
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-gray-400">Budget Utilization</p>
          <p className={`text-2xl font-bold ${textColor}`}>
            {utilization.toFixed(0)}%
          </p>
        </div>
        <div className="text-right space-y-1">
          <div className="text-sm">
            <span className="text-gray-400">Estimated: </span>
            <CurrencyDisplay amount={estimatedActual} currency={currency} className="text-white font-medium" />
          </div>
          <div className="text-sm">
            <span className="text-gray-400">Paid: </span>
            <CurrencyDisplay amount={totalPaid} currency={currency} className="text-white font-medium" />
          </div>
          {totalBudget != null && (
            <div className="text-sm">
              <span className="text-gray-400">Budget: </span>
              <CurrencyDisplay amount={totalBudget} currency={currency} className="text-white font-medium" />
            </div>
          )}
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
    </div>
  );
}
