import { Badge } from "../common/Badge";
import { CurrencyDisplay } from "../common/CurrencyDisplay";

interface LineItem {
  id: number;
  description: string;
  amount: number;
  pricingType: string;
  unitPrice: number | null;
  quantity: number | null;
  notes: string | null;
}

const PRICING_VARIANT: Record<string, "default" | "info" | "warning"> = {
  flat: "default",
  per_person: "info",
  per_unit: "info",
  per_hour: "warning",
};

export function QuoteLineItems({
  lineItems,
  currency,
}: {
  lineItems: LineItem[];
  currency: string;
}) {
  if (lineItems.length === 0) return null;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-on-surface-secondary">
          <th className="pb-2 font-medium">Item</th>
          <th className="pb-2 font-medium">Type</th>
          <th className="pb-2 font-medium text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lineItems.map((li) => (
          <tr key={li.id} className="border-b border-border-subtle">
            <td className="py-2">
              <span className="text-on-surface">{li.description}</span>
              {li.unitPrice != null && li.quantity != null && (
                <span className="ml-2 text-xs text-on-surface-tertiary">
                  ({li.quantity} x <CurrencyDisplay amount={li.unitPrice} currency={currency} />)
                </span>
              )}
            </td>
            <td className="py-2">
              <Badge variant={PRICING_VARIANT[li.pricingType] ?? "default"}>
                {li.pricingType.replace("_", " ")}
              </Badge>
            </td>
            <td className="py-2 text-right">
              <CurrencyDisplay amount={li.amount} currency={currency} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
