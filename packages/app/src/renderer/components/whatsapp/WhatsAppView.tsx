import { useState, useEffect, useCallback, useMemo } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { ContactList, type ContactSummary } from "../common/ContactList";
import { ConversationThread, type Communication } from "../common/ConversationThread";
import { isOutbound } from "../common/MessageBubble";
import { ComposeBox } from "../common/ComposeBox";
import { AgentSidePanel } from "../common/AgentSidePanel";
import { ApprovalActions } from "../outreach/ApprovalActions";
import { EmptyState } from "../common/EmptyState";
import { VendorPickerModal } from "./VendorPickerModal";
import { MessageCircle } from "lucide-react";
import type { GatewayEvent } from "@wedding-planner/shared";

export function WhatsAppView() {
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [selectedVendorName, setSelectedVendorName] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [sidePanelComm, setSidePanelComm] = useState<Communication | null>(null);

  // Fetch all WhatsApp communications
  const {
    data: allMessages,
    loading,
    refetch,
  } = useRequest<Communication[]>("communications.list", {
    channel: "whatsapp",
  });

  const { mutate: approve } = useMutation<{ id: number }>("communications.approve");
  const { mutate: reject } = useMutation<{ id: number }>("communications.reject");
  const { mutate: markRead } = useMutation<{ id: number }>("communications.markRead");
  const { mutate: sendWhatsApp } = useMutation<
    { vendorId: number; message: string },
    unknown
  >("communications.sendWhatsApp");

  // Listen for real-time updates
  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (
        event.name === "communication-received" ||
        event.name === "agent-complete" ||
        (event.name === "agent-activity" && event.data.action === "draft-ready")
      ) {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  // Build contact list from messages
  const contacts: ContactSummary[] = useMemo(() => {
    if (!allMessages) return [];
    const byVendor = new Map<number, Communication[]>();
    for (const msg of allMessages) {
      const existing = byVendor.get(msg.vendorId) ?? [];
      existing.push(msg);
      byVendor.set(msg.vendorId, existing);
    }

    return Array.from(byVendor.entries())
      .map(([vendorId, msgs]) => {
        const sorted = msgs.sort(
          (a, b) => new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime()
        );
        const latest = sorted[0];
        return {
          vendorId,
          vendorName: latest.vendorName ?? "Unknown",
          lastMessage: latest.bodyOriginal.slice(0, 80),
          lastMessageAt: latest.sentAt,
          unreadCount: msgs.filter((m) => !isOutbound(m.direction) && !m.isRead).length,
          channel: "whatsapp",
        };
      })
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [allMessages]);

  // Filter messages for selected vendor
  const vendorMessages = useMemo(() => {
    if (!allMessages || !selectedVendorId) return [];
    return allMessages
      .filter((m) => m.vendorId === selectedVendorId)
      .sort((a, b) => new Date(a.sentAt ?? 0).getTime() - new Date(b.sentAt ?? 0).getTime());
  }, [allMessages, selectedVendorId]);

  // Mark unread incoming messages as read when viewing a conversation
  useEffect(() => {
    const unread = vendorMessages.filter((m) => !isOutbound(m.direction) && !m.isRead);
    if (unread.length === 0) return;
    for (const msg of unread) {
      markRead({ id: msg.id });
    }
    refetch();
  }, [vendorMessages, markRead, refetch]);

  // Draft messages needing approval
  const drafts = vendorMessages.filter((m) => m.status === "draft");

  async function handleSend(message: string) {
    if (!selectedVendorId) return;
    await sendWhatsApp({
      vendorId: selectedVendorId,
      message,
    });
    refetch();
  }

  async function handleApprove(id: number) {
    await approve({ id });
    refetch();
  }

  async function handleReject(id: number) {
    await reject({ id });
    refetch();
  }

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-72 border-r border-border animate-pulse bg-surface-subtle" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Contact list */}
      <div className="w-72 shrink-0">
        <ContactList
          contacts={contacts}
          selectedVendorId={selectedVendorId}
          onSelect={setSelectedVendorId}
          onNew={() => setShowPicker(true)}
        />
      </div>

      {/* Conversation area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedVendorId ? (
          <>
            {/* Vendor name header */}
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-on-surface">
                {contacts.find((c) => c.vendorId === selectedVendorId)?.vendorName ?? selectedVendorName ?? "Conversation"}
              </h2>
            </div>

            <ConversationThread
              messages={vendorMessages}
              onMessageAction={(msg) => setSidePanelComm(msg)}
            />

            {/* Draft approval bar */}
            {drafts.length > 0 && (
              <div className="px-4 py-2 border-t border-border bg-surface-subtle">
                {drafts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 truncate flex-1 mr-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-muted bg-surface rounded px-1.5 py-0.5 shrink-0">
                        Draft
                      </span>
                      <span className="text-xs text-on-surface-subtle truncate">
                        {d.bodyOriginal.slice(0, 60)}...
                      </span>
                    </div>
                    <ApprovalActions
                      onApprove={() => handleApprove(d.id)}
                      onReject={() => handleReject(d.id)}
                    />
                  </div>
                ))}
              </div>
            )}

            <ComposeBox
              onSend={handleSend}
              placeholder="Type a message..."
            />
          </>
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="Select a conversation"
            description="Choose a vendor from the list to view their WhatsApp messages"
          />
        )}
      </div>

      {/* Agent side panel */}
      <AgentSidePanel
        open={sidePanelComm !== null}
        communication={sidePanelComm}
        onClose={() => setSidePanelComm(null)}
      />

      {showPicker && (
        <VendorPickerModal
          excludeVendorIds={contacts.map((c) => c.vendorId)}
          onSelect={(id, name) => {
            setSelectedVendorId(id);
            setSelectedVendorName(name);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
