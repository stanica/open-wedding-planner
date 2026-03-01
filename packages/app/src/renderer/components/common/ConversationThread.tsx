import { useEffect, useRef } from "react";
import { MessageBubble, isOutbound } from "./MessageBubble";

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
  isRead: number;
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
      <div className="flex-1 flex items-center justify-center text-on-surface-tertiary">
        <p className="text-sm">No messages yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <div key={msg.id} className="group relative">
          <MessageBubble
            direction={msg.direction}
            channel={msg.channel}
            body={msg.bodyOriginal}
            translatedBody={msg.bodyTranslated}
            subject={msg.subject}
            senderName={isOutbound(msg.direction) ? "You" : (msg.vendorName ?? "Vendor")}
            sentAt={msg.sentAt}
            status={msg.status}
          />
          {onMessageAction && !isOutbound(msg.direction) && (
            <button
              onClick={() => onMessageAction(msg)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md bg-surface px-2 py-1 text-xs text-on-surface-secondary hover:text-on-surface shadow-sm border border-outline-variant"
            >
              {actionLabel}
            </button>
          )}
        </div>
      ))}

      {/* Draft messages needing approval */}
      {messages.some((m) => m.status === "draft") && (
        <div className="mt-2 text-xs text-warning/70 text-center">
          Draft messages shown above need approval before sending
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
