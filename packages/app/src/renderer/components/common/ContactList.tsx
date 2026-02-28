import { MessageCircle } from "lucide-react";

export interface ContactSummary {
  vendorId: number;
  vendorName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  channel: string;
}

interface ContactListProps {
  contacts: ContactSummary[];
  selectedVendorId: number | null;
  onSelect: (vendorId: number) => void;
}

export function ContactList({ contacts, selectedVendorId, onSelect }: ContactListProps) {
  return (
    <div className="flex flex-col h-full border-r border-white/10">
      <div className="p-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white">Conversations</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <MessageCircle className="h-8 w-8 text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">No conversations yet</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <button
              key={contact.vendorId}
              onClick={() => onSelect(contact.vendorId)}
              className={`w-full text-left px-3 py-3 border-b border-white/5 transition-colors ${
                selectedVendorId === contact.vendorId
                  ? "bg-white/10"
                  : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white truncate">
                  {contact.vendorName}
                </span>
                {contact.lastMessageAt && (
                  <span className="text-xs text-gray-500 shrink-0 ml-2">
                    {formatRelativeTime(contact.lastMessageAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 truncate">
                  {contact.lastMessage}
                </p>
                {contact.unreadCount > 0 && (
                  <span className="ml-2 shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs font-medium text-white">
                    {contact.unreadCount}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
