import { Badge } from "../common/Badge";
import { DollarSign, Calendar, AlertCircle } from "lucide-react";

interface ParsedData {
  pricing?: Array<{ description: string; amount: number; currency?: string }>;
  availability?: string;
  conditions?: string;
}

interface ParsedHighlightsProps {
  data?: ParsedData;
}

export function ParsedHighlights({ data }: ParsedHighlightsProps) {
  if (!data) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <p className="text-xs text-gray-500">Parsed data extracted by AI agent</p>
      </div>
    );
  }

  const hasPricing = data.pricing && data.pricing.length > 0;
  const hasAvailability = !!data.availability;
  const hasConditions = !!data.conditions;

  if (!hasPricing && !hasAvailability && !hasConditions) return null;

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 space-y-3">
      <p className="text-xs text-blue-400 uppercase tracking-wide font-medium">
        Extracted Data
      </p>

      {hasPricing && (
        <div className="flex flex-wrap gap-2">
          {data.pricing!.map((item, i) => (
            <Badge key={i} variant="success">
              <DollarSign className="mr-1 h-3 w-3" />
              {item.description}: {item.amount} {item.currency ?? "EUR"}
            </Badge>
          ))}
        </div>
      )}

      {hasAvailability && (
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />
          <span className="text-sm text-gray-300">{data.availability}</span>
        </div>
      )}

      {hasConditions && (
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
          <span className="text-sm text-gray-300">{data.conditions}</span>
        </div>
      )}
    </div>
  );
}
