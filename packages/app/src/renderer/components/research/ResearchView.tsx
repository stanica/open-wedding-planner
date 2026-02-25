import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { wsClient } from "../../lib/ws-client";
import { useMutation } from "../../hooks/useRequest";
import { ResearchInput } from "./ResearchInput";
import { AgentActivityStream } from "./AgentActivityStream";
import type { ActivityItem } from "./AgentActivityStream";
import { VendorCard } from "../vendors/VendorCard";
import { useVendors } from "../../hooks/useVendors";
import type { GatewayEvent } from "@wedding-planner/shared";

export function ResearchView() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [completedSummary, setCompletedSummary] = useState<string | null>(null);
  const { mutate: startResearch, loading } = useMutation<
    { query: string },
    { taskId: string; sessionKey: string }
  >("agent.research");
  const { data: vendors, refetch: refetchVendors } = useVendors();
  const navigate = useNavigate();

  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (event.name === "agent-activity" && event.data.sessionKey === activeSession) {
        setActivities((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            action: event.data.action,
            detail: event.data.detail,
            timestamp: Date.now(),
          },
        ]);
      }

      if (event.name === "agent-complete" && activeSession) {
        setCompletedSummary(event.data.summary);
        setActiveSession(null);
        refetchVendors();
      }
    },
    [activeSession, refetchVendors],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  async function handleSubmit(query: string) {
    setActivities([]);
    setCompletedSummary(null);
    try {
      const result = await startResearch({ query });
      setActiveSession(result.sessionKey);
    } catch {
      setActivities([
        {
          id: "error",
          action: "error",
          detail: "Failed to start research",
          timestamp: Date.now(),
        },
      ]);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Research</h1>

      <ResearchInput onSubmit={handleSubmit} disabled={loading || !!activeSession} />

      <AgentActivityStream activities={activities} />

      {completedSummary && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3">
          <p className="text-sm text-green-400">{completedSummary}</p>
        </div>
      )}

      {vendors && vendors.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Vendors</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.slice(-4).map((vendor) => (
              <VendorCard
                key={vendor.id}
                vendor={vendor}
                onClick={() => navigate(`/vendors/${vendor.id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
