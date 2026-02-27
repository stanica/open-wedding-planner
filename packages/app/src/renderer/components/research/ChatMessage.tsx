import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { ToolActivityCard } from "./ToolActivityCard";
import { VendorResultCard } from "./VendorResultCard";
import { Markdown } from "../shared/Markdown";

interface ToolCall {
  toolName: string;
  args: unknown;
  result: unknown;
}

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  vendors?: Array<{
    id: number;
    name: string;
    location?: string | null;
    description?: string | null;
  }>;
}

const TOOL_LABELS: Record<string, string> = {
  search: "search",
  scrape: "scrape",
  browse: "browse",
  parsePdf: "PDF parse",
};

function summarizeToolCalls(toolCalls: ToolCall[]) {
  const counts: Record<string, number> = {};
  for (const tc of toolCalls) {
    const label = TOOL_LABELS[tc.toolName] ?? tc.toolName;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => (count > 1 ? `${count} ${name}s` : `1 ${name}`))
    .join(", ");
}

export function ChatMessage({ role, content, toolCalls, vendors }: MessageProps) {
  const isUser = role === "user";
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const visibleToolCalls = (toolCalls ?? []).filter((tc) => tc.toolName !== "createVendor");

  return (
    <div className="py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-medium ${isUser ? "text-blue-400" : "text-purple-400"}`}>
          {isUser ? "You" : "Assistant"}
        </span>
      </div>

      {/* Collapsed tool activity summary */}
      {!isUser && visibleToolCalls.length > 0 && (
        <div className="mb-2">
          <button
            onClick={() => setToolsExpanded(!toolsExpanded)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            {toolsExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <Wrench className="h-3 w-3" />
            <span>Used {visibleToolCalls.length} tools</span>
            <span className="text-gray-600">({summarizeToolCalls(visibleToolCalls)})</span>
          </button>
          {toolsExpanded && (
            <div className="mt-1 ml-1 border-l border-white/5 pl-2">
              {visibleToolCalls.map((tc, i) => (
                <ToolActivityCard key={i} toolName={tc.toolName} args={tc.args} result={tc.result} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message text */}
      {content && (
        <Markdown content={content} />
      )}

      {/* Vendor result cards */}
      {vendors && vendors.length > 0 && (
        <div className="mt-3 space-y-2">
          {vendors.map((v) => (
            <VendorResultCard
              key={v.id}
              vendorId={v.id}
              name={v.name}
              location={v.location}
              description={v.description}
            />
          ))}
        </div>
      )}
    </div>
  );
}
