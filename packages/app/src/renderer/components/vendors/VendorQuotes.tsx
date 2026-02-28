import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { Card, CardHeader, CardContent } from "../common/Card";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { QuoteLineItems } from "./QuoteLineItems";
import { Skeleton } from "../common/Skeleton";
import { ConfirmDialog } from "../common/ConfirmDialog";

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

function QuoteCard({
  quoteId,
  currency,
  onDeleted,
}: {
  quoteId: number;
  currency: string;
  onDeleted: () => void;
}) {
  const { data: quote, loading } = useRequest<QuoteWithItems>("quotes.get", {
    id: quoteId,
  });
  const { mutate: deleteQuote, loading: deleting } = useMutation<{ id: number }>("quotes.delete");
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDelete() {
    await deleteQuote({ id: quoteId });
    setShowConfirm(false);
    onDeleted();
  }

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

  const displayTotal = quote.lineItems.length > 0
    ? quote.lineItems.reduce((sum, li) => sum + (li.unitPrice != null && li.quantity != null ? li.unitPrice * li.quantity : li.amount), 0)
    : quote.totalAmount;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-white">
              <CurrencyDisplay amount={displayTotal} currency={currency} />
            </span>
            {quote.source && (
              <span className="ml-2 text-xs text-gray-500">via {quote.source}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {new Date(quote.receivedAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => setShowConfirm(true)}
              className="rounded p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </CardHeader>
        {quote.lineItems.length > 0 && (
          <CardContent>
            <QuoteLineItems lineItems={quote.lineItems} currency={currency} />
          </CardContent>
        )}
      </Card>

      <ConfirmDialog
        open={showConfirm}
        title="Delete quote?"
        message={`Delete this ${currency} ${displayTotal.toLocaleString()} quote and all its line items?`}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
        loading={deleting}
      />
    </>
  );
}

export function VendorQuotes({ vendorId }: { vendorId: number }) {
  const { data: quotesList, loading, refetch } = useRequest<Quote[]>("quotes.list", {
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
        <QuoteCard key={q.id} quoteId={q.id} currency={q.currency} onDeleted={refetch} />
      ))}
    </div>
  );
}
