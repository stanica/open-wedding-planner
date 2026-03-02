import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import { EmptyState } from "../common/EmptyState";
import { ComposeBox } from "../common/ComposeBox";
import { Markdown } from "../shared/Markdown";
import { Phone, Clock, ChevronDown, ChevronUp, Trash2, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

function DragHandle({
  onDrag,
}: {
  onDrag: (deltaX: number) => void;
}) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onDrag(delta);
    }
    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onDrag]);

  return (
    <div
      className="w-1 shrink-0 cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors"
      onMouseDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        lastX.current = e.clientX;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
    />
  );
}

function CallAgentPanel({
  call,
  onClose,
  width,
}: {
  call: VoiceCall;
  onClose: () => void;
  width: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const { mutate: dispatchAction } = useMutation<
    { callId: number; instruction: string; history: ChatMessage[] },
    { taskId: string; sessionKey: string }
  >("agent.callAction");

  // Reset chat when call changes
  useEffect(() => {
    setMessages([]);
    setLoading(false);
    unsubRef.current?.();
    unsubRef.current = null;
  }, [call.id]);

  useEffect(() => {
    return () => unsubRef.current?.();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (instruction: string) => {
      const userMsg: ChatMessage = { role: "user", content: instruction };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      unsubRef.current?.();
      let taskId: string | null = null;

      unsubRef.current = wsClient.onEvent((event: GatewayEvent) => {
        if (
          event.name === "agent-complete" &&
          taskId &&
          event.data.taskId === taskId
        ) {
          const { summary } = event.data;
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: summary },
          ]);
          setLoading(false);
          unsubRef.current?.();
          unsubRef.current = null;
        }
      });

      try {
        const result = await dispatchAction({
          callId: call.id,
          instruction,
          history: [...messages, userMsg],
        });
        taskId = result.taskId;
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Failed to start agent. Please try again.",
          },
        ]);
        setLoading(false);
        unsubRef.current?.();
        unsubRef.current = null;
      }
    },
    [call.id, messages, dispatchAction],
  );

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ width }}
      className="h-full flex flex-col bg-surface overflow-hidden shrink-0"
    >
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-on-surface">
            AI Assistant
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-on-surface-secondary hover:text-on-surface hover:bg-surface-active transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border bg-surface-subtle">
        <p className="text-xs text-on-surface-tertiary">
          Call with {call.vendorName ?? call.phoneNumber}
        </p>
        {call.summary && (
          <p className="text-xs text-on-surface-secondary truncate mt-0.5">
            {call.summary}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-on-surface-tertiary text-xs mt-8">
            <p>Ask the AI about this call.</p>
            <p className="mt-1 text-on-surface-faint">
              e.g. "Summarize the key points" or "What pricing did they
              mention?"
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="text-sm text-on-surface-secondary">
            <span className="text-xs font-medium text-on-surface-tertiary block mb-0.5">
              {msg.role === "user" ? "You" : "AI"}
            </span>
            {msg.role === "assistant" ? (
              <Markdown content={msg.content} />
            ) : (
              <div className="whitespace-pre-wrap">{msg.content}</div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
            Working...
          </div>
        )}
        <div ref={endRef} />
      </div>

      <ComposeBox
        onSend={handleSend}
        disabled={loading}
        placeholder="Ask about this call..."
      />
    </motion.div>
  );
}

export function CallsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCallId, setSelectedCallId] = useState<number | null>(() => {
    const id = searchParams.get("id");
    return id ? Number(id) : null;
  });
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [listWidth, setListWidth] = useState(288); // 72 * 4 = w-72
  const [aiWidth, setAiWidth] = useState(400);

  // Clear search param after consuming it
  useEffect(() => {
    if (searchParams.has("id")) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  async function handleDelete() {
    if (!selectedCall) return;
    await wsClient.request("vapi.deleteCall", { id: selectedCall.id });
    setSelectedCallId(null);
    setAiPanelOpen(false);
    refetch();
  }

  // Reset transcript collapsed state when selecting a different call
  useEffect(() => {
    setTranscriptOpen(false);
  }, [selectedCallId]);

  const handleListDrag = useCallback((delta: number) => {
    setListWidth((w) => Math.max(200, Math.min(500, w + delta)));
  }, []);

  const handleAiDrag = useCallback((delta: number) => {
    setAiWidth((w) => Math.max(280, Math.min(600, w - delta)));
  }, []);

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
      <div
        className="shrink-0 flex flex-col border-r border-border"
        style={{ width: listWidth }}
      >
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

      <DragHandle onDrag={handleListDrag} />

      {/* Center panel: call detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedCall ? (
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-on-surface">
                  {selectedCall.vendorName ?? "Unknown Vendor"}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAiPanelOpen(!aiPanelOpen)}
                    className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 px-2 py-1.5 text-sm text-purple-400 hover:bg-purple-500/10 transition-colors"
                    title="Ask AI"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xl:inline">Ask AI</span>
                  </button>
                  <StatusBadge status={selectedCall.status} />
                  <button
                    onClick={handleDelete}
                    className="rounded p-1 text-on-surface-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete call"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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
                  <div className="text-sm text-on-surface-muted">
                    <Markdown content={selectedCall.instructions} />
                  </div>
                </div>
              )}

              {/* Summary */}
              {selectedCall.summary && (
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-1">
                    Summary
                  </h3>
                  <div className="text-sm text-on-surface-muted">
                    <Markdown content={selectedCall.summary} />
                  </div>
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
                    <div className="mt-2 text-sm text-on-surface-muted">
                      <Markdown content={selectedCall.transcript} />
                    </div>
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

      {/* AI side panel */}
      <AnimatePresence>
        {aiPanelOpen && selectedCall && (
          <>
            <DragHandle onDrag={handleAiDrag} />
            <CallAgentPanel
              call={selectedCall}
              onClose={() => setAiPanelOpen(false)}
              width={aiWidth}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
