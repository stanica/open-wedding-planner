import { useState, useEffect, useCallback, useMemo } from "react";
import { useRequest } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { ConversationThread, type Communication } from "../common/ConversationThread";
import { AgentSidePanel } from "../common/AgentSidePanel";
import { EmptyState } from "../common/EmptyState";
import { MessageSquare } from "lucide-react";
import type { GatewayEvent } from "@wedding-planner/shared";

export function VendorComms({ vendorId }: { vendorId: number }) {
  const [sidePanelComm, setSidePanelComm] = useState<Communication | null>(null);

  const {
    data: messages,
    loading,
    refetch,
  } = useRequest<Communication[]>("communications.list", {
    vendorId,
  });

  // Listen for updates
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

  // Sort chronologically (oldest first) — spread to avoid mutating state
  const sorted = useMemo(
    () => [...(messages ?? [])].sort(
      (a, b) => new Date(a.sentAt ?? 0).getTime() - new Date(b.sentAt ?? 0).getTime()
    ),
    [messages],
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-surface-elevated" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No communications yet"
        description="WhatsApp and email messages with this vendor will appear here"
      />
    );
  }

  return (
    <div className="flex" style={{ height: "calc(100vh - 280px)" }}>
      <div className="flex-1 flex flex-col min-w-0">
        <ConversationThread
          messages={sorted}
          onMessageAction={(msg) => setSidePanelComm(msg)}
        />
      </div>

      <AgentSidePanel
        open={sidePanelComm !== null}
        communication={sidePanelComm}
        onClose={() => setSidePanelComm(null)}
      />
    </div>
  );
}
