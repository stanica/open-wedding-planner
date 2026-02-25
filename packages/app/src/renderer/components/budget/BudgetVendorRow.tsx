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
}: {
  entry: BudgetEntry;
  currency: string;
}) {
  return (
    <tr className="border-b border-white/5 text-sm">
      <td className="py-2 pl-10 pr-4 text-gray-300">{entry.description}</td>
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
