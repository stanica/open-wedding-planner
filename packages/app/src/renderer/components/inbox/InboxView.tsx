import { useState, useEffect, useCallback, useMemo } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { isOutbound } from "../common/MessageBubble";
import { AgentSidePanel } from "../common/AgentSidePanel";
import { EmptyState } from "../common/EmptyState";
import { Badge } from "../common/Badge";
import { Mail, Reply, Sparkles } from "lucide-react";
import type { Communication } from "../common/ConversationThread";
import type { GatewayEvent } from "@wedding-planner/shared";

interface VendorGroup {
  vendorId: number;
  vendorName: string | null;
  latestMessage: Communication;
  messages: Communication[];
  threads: { threadId: string; subject: string | null; messages: Communication[] }[];
  hasUnread: boolean;
  latestDate: string | null;
}

export function InboxView() {
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [sidePanelComm, setSidePanelComm] = useState<Communication | null>(null);

  const {
    data: messages,
    loading,
    refetch,
  } = useRequest<Communication[]>("communications.list", {
    channel: "email",
  });

  const { mutate: startOutreach } = useMutation<
    { vendorId: number; channel: string },
    unknown
  >("agent.outreach");

  const { mutate: markRead } = useMutation<{ id: number }>("communications.markRead");

  // Listen for updates
  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (
        event.name === "communication-received" ||
        event.name === "agent-complete"
      ) {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  // Group messages by vendor, then by thread within each vendor
  const vendorGroups: VendorGroup[] = useMemo(() => {
    if (!messages) return [];
    const byVendor = new Map<number, Communication[]>();
    for (const msg of messages) {
      const group = byVendor.get(msg.vendorId) ?? [];
      group.push(msg);
      byVendor.set(msg.vendorId, group);
    }
    return Array.from(byVendor.entries())
      .map(([vendorId, msgs]) => {
        // Sort all messages chronologically
        const allSorted = [...msgs].sort(
          (a, b) =>
            new Date(a.sentAt ?? 0).getTime() - new Date(b.sentAt ?? 0).getTime(),
        );
        const latest = allSorted[allSorted.length - 1];

        // Group into threads within this vendor
        const byThread = new Map<string, Communication[]>();
        for (const msg of allSorted) {
          const key = msg.threadId ?? `single-${msg.id}`;
          const group = byThread.get(key) ?? [];
          group.push(msg);
          byThread.set(key, group);
        }
        const threads = Array.from(byThread.entries())
          .map(([threadId, tMsgs]) => ({
            threadId,
            subject: tMsgs[0].subject,
            messages: tMsgs,
          }))
          .sort((a, b) => {
            const aTime = a.messages[a.messages.length - 1].sentAt;
            const bTime = b.messages[b.messages.length - 1].sentAt;
            return (
              new Date(bTime ?? 0).getTime() - new Date(aTime ?? 0).getTime()
            );
          });

        return {
          vendorId,
          vendorName: latest.vendorName,
          latestMessage: latest,
          messages: allSorted,
          threads,
          hasUnread: msgs.some(
            (m) => !m.isRead && !isOutbound(m.direction),
          ),
          latestDate: latest.sentAt,
        };
      })
      .sort((a, b) => {
        const aTime = a.latestDate ? new Date(a.latestDate).getTime() : 0;
        const bTime = b.latestDate ? new Date(b.latestDate).getTime() : 0;
        return bTime - aTime;
      });
  }, [messages]);

  const selectedGroup = useMemo(
    () => vendorGroups.find((g) => g.vendorId === selectedVendorId) ?? null,
    [vendorGroups, selectedVendorId],
  );

  function handleSelectVendor(vendorId: number) {
    setSelectedVendorId(vendorId);
    const group = vendorGroups.find((g) => g.vendorId === vendorId);
    if (group) {
      for (const msg of group.messages) {
        if (!msg.isRead && !isOutbound(msg.direction)) {
          markRead({ id: msg.id });
        }
      }
    }
  }

  const sidebarOpen = sidePanelComm !== null;

  // Only show skeleton on initial load, not on refetch (which would unmount the side panel)
  if (loading && !messages) {
    return (
      <div className="flex h-full">
        <div className="w-[400px] border-r border-white/10 animate-pulse bg-white/[0.02]" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Vendor list — shrinks when sidebar is open */}
      <div
        className={`${sidebarOpen ? "w-[260px]" : "w-[400px]"} shrink-0 flex flex-col border-r border-white/10 transition-all duration-200`}
      >
        <div className="p-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Inbox</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {vendorGroups.length}{" "}
            {vendorGroups.length === 1 ? "conversation" : "conversations"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {vendorGroups.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No emails yet"
              description="Emails will appear here when synced from Gmail"
            />
          ) : (
            vendorGroups.map((group) => (
              <button
                key={group.vendorId}
                onClick={() => handleSelectVendor(group.vendorId)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                  selectedVendorId === group.vendorId
                    ? "bg-white/10"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-sm truncate ${group.hasUnread ? "font-semibold text-white" : "font-medium text-gray-300"}`}
                  >
                    {group.vendorName ?? "Unknown"}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {group.hasUnread && <Badge variant="info">New</Badge>}
                    {group.messages.length > 1 && (
                      <span className="text-xs text-gray-500">
                        {group.messages.length}
                      </span>
                    )}
                    {group.latestDate && (
                      <span className="text-xs text-gray-500">
                        {new Date(group.latestDate).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                      </span>
                    )}
                  </div>
                </div>
                {group.latestMessage.subject && (
                  <p className="text-sm text-gray-300 truncate">
                    {group.latestMessage.subject}
                  </p>
                )}
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {group.latestMessage.bodyOriginal.slice(0, 100)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail panel — shows all threads/messages for selected vendor */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedGroup ? (
          <div className="flex-1 overflow-y-auto">
            {/* Vendor header */}
            <div className="sticky top-0 bg-gray-950 z-10 px-6 py-4 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold text-white truncate mr-3">
                  {selectedGroup.vendorName ?? "Unknown"}
                </h1>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() =>
                      setSidePanelComm(selectedGroup.latestMessage)
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 px-2 py-1.5 text-sm text-purple-400 hover:bg-purple-500/10 transition-colors"
                    title="Ask AI"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xl:inline">Ask AI</span>
                  </button>
                  <button
                    onClick={() =>
                      startOutreach({
                        vendorId: selectedGroup.vendorId,
                        channel: "email",
                      })
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                    title="Reply"
                  >
                    <Reply className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xl:inline">Reply</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                <span>
                  {selectedGroup.messages.length}{" "}
                  {selectedGroup.messages.length === 1
                    ? "message"
                    : "messages"}
                </span>
                {selectedGroup.threads.length > 1 && (
                  <span className="text-gray-600">
                    {selectedGroup.threads.length} threads
                  </span>
                )}
              </div>
            </div>

            {/* Messages grouped by thread */}
            <div className="px-6 py-4">
              {selectedGroup.threads.map((thread, threadIdx) => (
                <div key={thread.threadId}>
                  {/* Thread subject header (when multiple threads) */}
                  {selectedGroup.threads.length > 1 && (
                    <div className="flex items-center gap-2 mb-3 mt-2">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs text-gray-500 shrink-0">
                        {thread.subject ?? "No subject"}
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                  )}

                  <div className="space-y-6">
                    {thread.messages.map((msg) => (
                      <div key={msg.id} className="group">
                        {/* Message header */}
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-medium text-gray-300">
                            {isOutbound(msg.direction)
                              ? "You"
                              : (msg.vendorName ?? "Unknown")}
                          </span>
                          {msg.sentAt && (
                            <span className="text-xs text-gray-500">
                              {new Date(msg.sentAt).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                          {msg.language && msg.language !== "en" && (
                            <Badge variant="warning">{msg.language}</Badge>
                          )}
                        </div>

                        {/* Subject (show per-message if single thread) */}
                        {selectedGroup.threads.length === 1 &&
                          msg.subject && (
                            <p className="text-sm font-medium text-gray-200 mb-2">
                              {msg.subject}
                            </p>
                          )}

                        {/* Translated body */}
                        {msg.bodyTranslated && (
                          <div className="mb-2">
                            <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
                              {msg.bodyTranslated}
                            </div>
                            <details className="mt-2">
                              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                                Show original ({msg.language ?? "unknown"})
                              </summary>
                              <div className="mt-1 whitespace-pre-wrap text-xs text-gray-500 leading-relaxed">
                                {msg.bodyOriginal}
                              </div>
                            </details>
                          </div>
                        )}

                        {/* Original body (when no translation) */}
                        {!msg.bodyTranslated && (
                          <div className="whitespace-pre-wrap text-sm text-gray-400 leading-relaxed">
                            {msg.bodyOriginal}
                          </div>
                        )}

                        {/* Separator between messages */}
                        <div className="mt-4 border-b border-white/5" />
                      </div>
                    ))}
                  </div>

                  {/* Extra spacing between threads */}
                  {threadIdx < selectedGroup.threads.length - 1 && (
                    <div className="h-4" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Mail}
            title="Select a conversation"
            description="Choose a vendor from the list to view their emails"
          />
        )}
      </div>

      {/* Agent side panel */}
      <AgentSidePanel
        open={sidebarOpen}
        communication={sidePanelComm}
        onClose={() => setSidePanelComm(null)}
      />
    </div>
  );
}
