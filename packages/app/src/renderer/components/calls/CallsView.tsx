import { useState, useEffect, useCallback } from "react";
import { useRequest } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { EmptyState } from "../common/EmptyState";
import { Phone, Clock, ChevronDown, ChevronUp } from "lucide-react";
import type { GatewayEvent } from "@wedding-planner/shared";

interface VoiceCall {
  id: number;
  vendorId: number | null;
  vendorName: string | null;
  vapiCallId: string | null;
  phoneNumber: string;
  assistantId: string | null;
  status: string;
  endedReason: string | null;
  duration: number | null;
  summary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  structuredData: string | null;
  instructions: string | null;
  createdAt: string | null;
  endedAt: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-on-surface-faint/20 text-on-surface-muted",
  ringing: "bg-yellow-500/20 text-yellow-400",
  "in-progress": "bg-blue-500/20 text-blue-400 animate-pulse",
  ended: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-on-surface-faint/20 text-on-surface-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>
      {status}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CallsView() {
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const {
    data: calls,
    loading,
    refetch,
  } = useRequest<VoiceCall[]>("vapi.listCalls", {});

  // Listen for real-time updates
  const handleEvent = useCallback(
    (event: GatewayEvent) => {
      if (
        event.name === "voice-call-status" ||
        event.name === "voice-call-ended"
      ) {
        refetch();
      }
      if (
        event.name === "agent-activity" &&
        event.data.action === "vapi-call-initiated"
      ) {
        refetch();
      }
    },
    [refetch],
  );

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  const selectedCall = calls?.find((c) => c.id === selectedCallId) ?? null;

  // Reset transcript collapsed state when selecting a different call
  useEffect(() => {
    setTranscriptOpen(false);
  }, [selectedCallId]);

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-72 border-r border-border animate-pulse bg-surface-subtle" />
        <div className="flex-1" />
      </div>
    );
  }

  const sortedCalls = calls
    ? [...calls].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
    : [];

  return (
    <div className="flex h-full">
      {/* Left panel: call list */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-on-surface">Voice Calls</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedCalls.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-on-surface-muted">
              No calls yet
            </div>
          ) : (
            sortedCalls.map((call) => (
              <div
                key={call.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCallId(call.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedCallId(call.id);
                  }
                }}
                className={`px-4 py-3 border-b border-border cursor-pointer transition-colors ${
                  selectedCallId === call.id
                    ? "bg-surface-hover"
                    : "hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-on-surface truncate">
                    {call.vendorName ?? call.phoneNumber}
                  </span>
                  <StatusBadge status={call.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-on-surface-muted">
                  {call.duration != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(call.duration)}
                    </span>
                  )}
                  <span>{formatDate(call.createdAt)}</span>
                </div>
                {call.summary && (
                  <p className="mt-1 text-xs text-on-surface-subtle line-clamp-2">
                    {call.summary}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel: call detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedCall ? (
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-on-surface">
                  {selectedCall.vendorName ?? "Unknown Vendor"}
                </h2>
                <StatusBadge status={selectedCall.status} />
              </div>
              <div className="flex items-center gap-3 text-sm text-on-surface-muted">
                <span>{selectedCall.phoneNumber}</span>
                <span>{formatDate(selectedCall.createdAt)}</span>
                {selectedCall.duration != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(selectedCall.duration)}
                  </span>
                )}
              </div>
            </div>

            <div className="px-6 py-4 space-y-6">
              {/* Instructions */}
              {selectedCall.instructions && (
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-1">
                    Instructions
                  </h3>
                  <p className="text-sm text-on-surface-muted whitespace-pre-wrap">
                    {selectedCall.instructions}
                  </p>
                </div>
              )}

              {/* Summary */}
              {selectedCall.summary && (
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-1">
                    Summary
                  </h3>
                  <p className="text-sm text-on-surface-muted whitespace-pre-wrap">
                    {selectedCall.summary}
                  </p>
                </div>
              )}

              {/* Structured data */}
              {selectedCall.structuredData && (
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-1">
                    Structured Data
                  </h3>
                  <pre className="rounded-lg bg-surface-subtle p-3 text-xs text-on-surface-muted overflow-x-auto">
                    {(() => {
                      try {
                        return JSON.stringify(
                          JSON.parse(selectedCall.structuredData),
                          null,
                          2,
                        );
                      } catch {
                        return selectedCall.structuredData;
                      }
                    })()}
                  </pre>
                </div>
              )}

              {/* Transcript */}
              {selectedCall.transcript && (
                <div>
                  <button
                    onClick={() => setTranscriptOpen(!transcriptOpen)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-on-surface hover:text-on-surface-muted transition-colors"
                  >
                    {transcriptOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    Transcript
                  </button>
                  {transcriptOpen && (
                    <p className="mt-2 text-sm text-on-surface-muted whitespace-pre-wrap">
                      {selectedCall.transcript}
                    </p>
                  )}
                </div>
              )}

              {/* Recording */}
              {selectedCall.recordingUrl && (
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-2">
                    Recording
                  </h3>
                  <audio
                    controls
                    src={selectedCall.recordingUrl}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Ended reason footer */}
            {selectedCall.endedReason && (
              <div className="px-6 py-3 border-t border-border mt-auto">
                <span className="text-xs text-on-surface-muted">
                  Ended: {selectedCall.endedReason}
                </span>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Phone}
            title="Select a call"
            description="Choose a call from the list to view its details"
          />
        )}
      </div>
    </div>
  );
}
