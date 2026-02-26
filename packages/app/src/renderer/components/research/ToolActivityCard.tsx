import { useState } from "react";
import { Search, Globe, Monitor, FileText, ChevronDown, ChevronRight } from "lucide-react";

const TOOL_ICONS: Record<string, { icon: typeof Search; label: string }> = {
  search: { icon: Search, label: "Searching" },
  scrape: { icon: Globe, label: "Scraping" },
  browse: { icon: Monitor, label: "Browsing" },
  parsePdf: { icon: FileText, label: "Parsing PDF" },
};

interface ToolActivityCardProps {
  toolName: string;
  args: unknown;
  result?: unknown;
}

export function ToolActivityCard({ toolName, args, result }: ToolActivityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = TOOL_ICONS[toolName] ?? { icon: Search, label: toolName };
  const Icon = config.icon;

  const detail =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>).query?.toString() ??
        (args as Record<string, unknown>).url?.toString() ??
        JSON.stringify(args).slice(0, 80)
      : String(args);

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className="h-3 w-3" />
        <span className="font-medium">{config.label}</span>
        <span className="truncate max-w-[300px]">{detail}</span>
      </button>
      {expanded && result && (
        <pre className="mt-1 ml-6 p-2 rounded bg-white/5 text-[11px] text-gray-400 overflow-x-auto max-h-40">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
