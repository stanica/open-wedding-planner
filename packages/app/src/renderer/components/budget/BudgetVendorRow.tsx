import { Trash2 } from "lucide-react";
import { CurrencyDisplay } from "../common/CurrencyDisplay";

interface BudgetEntry {
  id: number;
  description: string;
  highEstimate: number | null;
  lowEstimate: number | null;
  estimatedActual: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  notes: string | null;
}

export function BudgetVendorRow({
  entry,
  currency,
  onDelete,
}: {
  entry: BudgetEntry;
  currency: string;
  onDelete: (id: number) => void;
}) {
  return (
    <tr className="border-b border-white/5 text-sm group">
      <td className="py-2 pl-10 pr-4 text-gray-300">
        <div className="flex items-center gap-2">
          {entry.description}
          <button
            onClick={() => onDelete(entry.id)}
            className="rounded p-1 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.highEstimate} currency={currency} className="text-gray-400" />
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.lowEstimate} currency={currency} className="text-gray-400" />
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.estimatedActual} currency={currency} />
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.amountPaid} currency={currency} />
      </td>
      <td className="py-2 px-4 text-right">
        <CurrencyDisplay amount={entry.balanceDue} currency={currency} />
      </td>
    </tr>
  );
}
