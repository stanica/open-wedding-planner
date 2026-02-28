import { useState, useEffect, useCallback, useMemo } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { AgentSidePanel } from "../common/AgentSidePanel";
import { EmptyState } from "../common/EmptyState";
import { Badge } from "../common/Badge";
import { Mail, Sparkles } from "lucide-react";
import type { Communication } from "../common/ConversationThread";
import type { GatewayEvent } from "@wedding-planner/shared";

export function InboxView() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
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

  const selected = useMemo(
    () => messages?.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId],
  );

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-[400px] border-r border-white/10 animate-pulse bg-white/[0.02]" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Email list */}
      <div className="w-[400px] shrink-0 flex flex-col border-r border-white/10">
        <div className="p-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Inbox</h2>
          <p className="text-xs text-gray-500 mt-0.5">{messages?.length ?? 0} messages</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!messages || messages.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No emails yet"
              description="Emails will appear here when synced from Gmail"
            />
          ) : (
            messages.map((msg) => (
              <button
                key={msg.id}
                onClick={() => setSelectedId(msg.id)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                  selectedId === msg.id ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">
                    {msg.vendorName ?? "Unknown"}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {msg.status === "received" && !msg.parsedAt && (
                      <Badge variant="info">New</Badge>
                    )}
                    {msg.sentAt && (
                      <span className="text-xs text-gray-500">
                        {new Date(msg.sentAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>
                {msg.subject && (
                  <p className="text-sm text-gray-300 truncate">{msg.subject}</p>
                )}
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {msg.bodyOriginal.slice(0, 100)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-lg font-semibold text-white">
                  {selected.subject ?? "(No subject)"}
                </h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSidePanelComm(selected)}
                    className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 px-3 py-1.5 text-sm text-purple-400 hover:bg-purple-500/10 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Ask AI
                  </button>
                  <button
                    onClick={() => startOutreach({ vendorId: selected.vendorId, channel: "email" })}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    Reply
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span>From: {selected.vendorName ?? "Unknown"}</span>
                {selected.sentAt && (
                  <span>{new Date(selected.sentAt).toLocaleString()}</span>
                )}
                {selected.language && selected.language !== "en" && (
                  <Badge variant="warning">{selected.language}</Badge>
                )}
              </div>
            </div>

            {/* Translated body */}
            {selected.bodyTranslated && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                  English Translation
                </p>
                <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
                  {selected.bodyTranslated}
                </div>
              </div>
            )}

            {/* Original body */}
            <div>
              {selected.bodyTranslated && (
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                  Original ({selected.language ?? "unknown"})
                </p>
              )}
              <div className="whitespace-pre-wrap text-sm text-gray-400 leading-relaxed">
                {selected.bodyOriginal}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Mail}
            title="Select an email"
            description="Choose a message from the list to view its contents"
          />
        )}
      </div>

      {/* Agent side panel */}
      <AgentSidePanel
        open={sidePanelComm !== null}
        communication={sidePanelComm}
        onClose={() => setSidePanelComm(null)}
      />
    </div>
  );
}
