import { ToolActivityCard } from "./ToolActivityCard";
import { VendorResultCard } from "./VendorResultCard";

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

export function ChatMessage({ role, content, toolCalls, vendors }: MessageProps) {
  const isUser = role === "user";

  return (
    <div className="py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-medium ${isUser ? "text-blue-400" : "text-purple-400"}`}>
          {isUser ? "You" : "Assistant"}
        </span>
      </div>

      {/* Tool activity cards (before main text for assistant) */}
      {!isUser && toolCalls && toolCalls.length > 0 && (
        <div className="mb-2">
          {toolCalls
            .filter((tc) => tc.toolName !== "createVendor")
            .map((tc, i) => (
              <ToolActivityCard key={i} toolName={tc.toolName} args={tc.args} result={tc.result} />
            ))}
        </div>
      )}

      {/* Message text */}
      {content && (
        <div className="text-sm text-gray-200 whitespace-pre-wrap">{content}</div>
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
