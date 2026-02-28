import { useResearchStore } from "../../stores/research-store";

function getBarColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 80) return "bg-orange-500";
  if (pct >= 60) return "bg-yellow-500";
  return "bg-emerald-500";
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function TokenUsageBar() {
  const tokenUsage = useResearchStore((s) => s.tokenUsage);
  const subagentTokens = useResearchStore((s) => s.subagentTokens);
  if (!tokenUsage) return null;

  const { inputTokens, contextWindow, modelName } = tokenUsage;
  const subTotal = Object.values(subagentTokens).reduce((a, b) => a + b, 0);
  const pct = Math.min(100, Math.round((inputTokens / contextWindow) * 100));

  return (
    <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] px-6 py-2">
      <div className="flex-1 flex items-center gap-3">
        <div className="h-1.5 flex-1 max-w-48 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getBarColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 tabular-nums">
          {formatTokenCount(inputTokens)} / {formatTokenCount(contextWindow)} ({pct}%){subTotal > 0 ? ` · ${formatTokenCount(subTotal)} sub` : ""}
        </span>
      </div>
      <span className="text-xs text-gray-600">{modelName}</span>
    </div>
  );
}
