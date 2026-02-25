import { useEffect, useCallback } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { InboxItem } from "./InboxItem";
import { EmptyState } from "../common/EmptyState";
import { Inbox } from "lucide-react";
import type { GatewayEvent } from "@wedding-planner/shared";

interface Communication {
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
  parsedAt: string | null;
}

export function InboxView() {
  const {
    data: messages,
    loading,
    refetch,
  } = useRequest<Communication[]>("communications.list", {
    direction: "in",
  });

  const { mutate: startOutreach } = useMutation<
    { vendorId: number; channel: string },
    unknown
  >("agent.outreach");

  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (
        event.name === "agent-complete" ||
        event.name === "channel-status"
      ) {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  async function handleReply(vendorId: number, channel: string) {
    await startOutreach({ vendorId, channel });
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Inbox</h1>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Inbox</h1>

      {!messages || messages.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No messages yet"
          description="Incoming messages from vendors will appear here once Gmail or WhatsApp is connected."
        />
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <InboxItem
              key={msg.id}
              message={msg}
              onReply={() => handleReply(msg.vendorId, msg.channel)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
