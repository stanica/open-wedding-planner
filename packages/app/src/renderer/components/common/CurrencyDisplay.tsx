interface CurrencyDisplayProps {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
}

const FORMATTERS: Record<string, Intl.NumberFormat> = {};

function getFormatter(currency: string): Intl.NumberFormat {
  if (!FORMATTERS[currency]) {
    FORMATTERS[currency] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return FORMATTERS[currency];
}

export function CurrencyDisplay({ amount, currency = "EUR", className = "" }: CurrencyDisplayProps) {
  if (amount == null) return <span className={`text-gray-500 ${className}`}>—</span>;
  return <span className={className}>{getFormatter(currency).format(amount)}</span>;
}
