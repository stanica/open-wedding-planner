import { Mail, MessageCircle } from "lucide-react";

export interface MessageBubbleProps {
  direction: "in" | "out";
  channel: "whatsapp" | "email" | string;
  body: string;
  translatedBody?: string | null;
  subject?: string | null;
  senderName?: string | null;
  sentAt?: string | null;
  status?: string;
}

export function MessageBubble({
  direction,
  channel,
  body,
  translatedBody,
  subject,
  senderName,
  sentAt,
}: MessageBubbleProps) {
  const isOut = direction === "out";
  const ChannelIcon = channel === "email" ? Mail : MessageCircle;
  const displayBody = translatedBody ?? body;

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isOut
            ? "bg-blue-600/20 border border-blue-500/20"
            : "bg-white/[0.07] border border-white/10"
        }`}
      >
        {/* Header: sender + channel icon + time */}
        <div className="flex items-center gap-2 mb-1">
          <ChannelIcon className="h-3 w-3 text-gray-500" />
          {senderName && (
            <span className="text-xs font-medium text-gray-400">
              {senderName}
            </span>
          )}
          {sentAt && (
            <span className="text-xs text-gray-600 ml-auto">
              {new Date(sentAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {/* Subject (email) */}
        {subject && (
          <p className="text-sm font-medium text-gray-200 mb-1">{subject}</p>
        )}

        {/* Body */}
        <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
          {displayBody}
        </div>

        {/* Original text toggle if translated */}
        {translatedBody && (
          <details className="mt-2">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
              Show original
            </summary>
            <div className="mt-1 whitespace-pre-wrap text-xs text-gray-500 leading-relaxed">
              {body}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
