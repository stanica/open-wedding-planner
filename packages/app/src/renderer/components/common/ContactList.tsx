import { MessageCircle, SquarePen } from "lucide-react";

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
  onNew?: () => void;
}

export function ContactList({ contacts, selectedVendorId, onSelect, onNew }: ContactListProps) {
  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-on-surface">Conversations</h2>
        {onNew && (
          <button
            onClick={onNew}
            className="rounded-lg p-1 hover:bg-surface-active transition-colors"
            title="New conversation"
          >
            <SquarePen className="h-4 w-4 text-on-surface-secondary" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <MessageCircle className="h-8 w-8 text-on-surface-faint mb-2" />
            <p className="text-sm text-on-surface-tertiary">No conversations yet</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <button
              key={contact.vendorId}
              onClick={() => onSelect(contact.vendorId)}
              className={`w-full text-left px-3 py-3 border-b border-border-subtle transition-colors ${
                selectedVendorId === contact.vendorId
                  ? "bg-surface-active"
                  : "hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-on-surface truncate">
                  {contact.vendorName}
                </span>
                {contact.lastMessageAt && (
                  <span className="text-xs text-on-surface-tertiary shrink-0 ml-2">
                    {formatRelativeTime(contact.lastMessageAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-on-surface-secondary truncate">
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
