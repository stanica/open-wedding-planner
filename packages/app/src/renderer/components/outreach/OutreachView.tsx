import { useState, useEffect, useCallback } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { DraftCard } from "./DraftCard";
import { EmptyState } from "../common/EmptyState";
import { Send } from "lucide-react";
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
}

export function OutreachView() {
  const {
    data: drafts,
    loading,
    refetch,
  } = useRequest<Communication[]>("communications.list", {
    direction: "out",
    status: "draft",
  });
  const { mutate: approve } = useMutation<{ id: number }>("communications.approve");
  const { mutate: reject } = useMutation<{ id: number }>("communications.reject");
  const { mutate: updateComm } = useMutation<
    { id: number; bodyOriginal: string },
    Communication
  >("communications.update");
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (event.name === "agent-activity" && event.data.action === "draft-ready") {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  async function handleApprove(id: number) {
    await approve({ id });
    refetch();
  }

  async function handleReject(id: number) {
    await reject({ id });
    refetch();
  }

  async function handleEdit(id: number, body: string) {
    await updateComm({ id, bodyOriginal: body });
    setEditingId(null);
    refetch();
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Outreach</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Outreach</h1>

      {!drafts || drafts.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No drafts pending"
          description="Use the Research view to find vendors, then draft outreach messages from vendor detail pages."
        />
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              editing={editingId === draft.id}
              onStartEdit={() => setEditingId(draft.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(body) => handleEdit(draft.id, body)}
              onApprove={() => handleApprove(draft.id)}
              onReject={() => handleReject(draft.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
