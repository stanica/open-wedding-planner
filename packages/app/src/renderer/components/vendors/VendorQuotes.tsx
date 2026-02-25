import { useRequest } from "../../hooks/useRequest";
import { Card, CardHeader, CardContent } from "../common/Card";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { QuoteLineItems } from "./QuoteLineItems";
import { Skeleton } from "../common/Skeleton";

interface Quote {
  id: number;
  totalAmount: number;
  currency: string;
  source: string | null;
  receivedAt: string;
  lineItems?: LineItem[];
}

interface LineItem {
  id: number;
  description: string;
  amount: number;
  pricingType: string;
  unitPrice: number | null;
  quantity: number | null;
  notes: string | null;
}

interface QuoteWithItems extends Quote {
  lineItems: LineItem[];
}

function QuoteCard({ quoteId, currency }: { quoteId: number; currency: string }) {
  const { data: quote, loading } = useRequest<QuoteWithItems>("quotes.get", {
    id: quoteId,
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!quote) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-white">
            <CurrencyDisplay amount={quote.totalAmount} currency={currency} />
          </span>
          {quote.source && (
            <span className="ml-2 text-xs text-gray-500">via {quote.source}</span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {new Date(quote.receivedAt).toLocaleDateString()}
        </span>
      </CardHeader>
      {quote.lineItems.length > 0 && (
        <CardContent>
          <QuoteLineItems lineItems={quote.lineItems} currency={currency} />
        </CardContent>
      )}
    </Card>
  );
}

export function VendorQuotes({ vendorId }: { vendorId: number }) {
  const { data: quotesList, loading } = useRequest<Quote[]>("quotes.list", {
    vendorId,
  });

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!quotesList || quotesList.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">No quotes yet</p>
    );
  }

  return (
    <div className="space-y-3">
      {quotesList.map((q) => (
        <QuoteCard key={q.id} quoteId={q.id} currency={q.currency} />
      ))}
    </div>
  );
}
