import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";

export interface Communication {
  id: number;
  vendorId: number;
  vendorName: string | null;
  direction: string;
  channel: string;
  subject: string | null;
  bodyOriginal: string;
  bodyTranslated: string | null;
  language: string | null;
  sentAt: string | null;
  status: string;
  threadId: string | null;
  parsedAt: string | null;
}

interface ConversationThreadProps {
  messages: Communication[];
  vendorName?: string;
  onMessageAction?: (message: Communication) => void;
  actionLabel?: string;
}

export function ConversationThread({
  messages,
  onMessageAction,
  actionLabel = "Ask AI",
}: ConversationThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-sm">No messages yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <div key={msg.id} className="group relative">
          <MessageBubble
            direction={msg.direction as "in" | "out"}
            channel={msg.channel}
            body={msg.bodyOriginal}
            translatedBody={msg.bodyTranslated}
            subject={msg.subject}
            senderName={msg.direction === "in" ? (msg.vendorName ?? "Vendor") : "You"}
            sentAt={msg.sentAt}
            status={msg.status}
          />
          {onMessageAction && (
            <button
              onClick={() => onMessageAction(msg)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md bg-white/10 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/20"
            >
              {actionLabel}
            </button>
          )}
        </div>
      ))}

      {/* Draft messages needing approval */}
      {messages.some((m) => m.status === "draft") && (
        <div className="mt-2 text-xs text-amber-400/70 text-center">
          Draft messages shown above need approval before sending
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
