import { useState } from "react";
import { Card, CardContent } from "../common/Card";
import { Badge } from "../common/Badge";
import { ParsedHighlights } from "./ParsedHighlights";
import { Mail, MessageCircle, ChevronDown, ChevronUp, Reply } from "lucide-react";

interface Message {
  id: number;
  vendorName: string | null;
  channel: string;
  subject: string | null;
  bodyOriginal: string;
  bodyTranslated: string | null;
  language: string | null;
  sentAt: string | null;
  status: string;
  parsedAt: string | null;
}

interface InboxItemProps {
  message: Message;
  onReply: () => void;
}

export function InboxItem({ message, onReply }: InboxItemProps) {
  const [expanded, setExpanded] = useState(false);
  const ChannelIcon = message.channel === "email" ? Mail : MessageCircle;

  const displayBody = message.bodyTranslated ?? message.bodyOriginal;
  const preview = displayBody.slice(0, 150) + (displayBody.length > 150 ? "..." : "");
  const isNew = message.status === "received" && !message.parsedAt;

  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <ChannelIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium truncate">
                  {message.vendorName ?? "Unknown"}
                </span>
                {isNew && <Badge variant="info">New</Badge>}
                <Badge variant={message.channel === "email" ? "default" : "success"}>
                  {message.channel}
                </Badge>
                {message.language && message.language !== "en" && (
                  <Badge variant="warning">{message.language}</Badge>
                )}
              </div>

              {message.subject && (
                <p className="text-sm text-gray-300 mb-1">{message.subject}</p>
              )}

              {expanded ? (
                <div className="space-y-3">
                  {message.bodyTranslated && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
                        English Translation
                      </p>
                      <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
                        {message.bodyTranslated}
                      </div>
                    </div>
                  )}
                  {message.bodyTranslated && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
                        Original ({message.language ?? "unknown"})
                      </p>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-sm text-gray-400 leading-relaxed">
                    {message.bodyOriginal}
                  </div>

                  {message.parsedAt && <ParsedHighlights />}
                </div>
              ) : (
                <p className="text-sm text-gray-400">{preview}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {message.sentAt && (
              <span className="text-xs text-gray-500">
                {new Date(message.sentAt).toLocaleDateString()}
              </span>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg border border-white/10 p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 flex items-center justify-end border-t border-white/10 pt-3">
            <button
              onClick={onReply}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Reply className="h-3.5 w-3.5" />
              Reply
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
