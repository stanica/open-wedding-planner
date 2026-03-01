import { useState, useEffect, useRef, useCallback } from "react";
import { X, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ComposeBox } from "./ComposeBox";
import { useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import type { Communication } from "./ConversationThread";
import { Markdown } from "../shared/Markdown";
import type { GatewayEvent } from "@wedding-planner/shared";

interface AgentSidePanelProps {
  open: boolean;
  communication: Communication | null;
  onClose: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function AgentSidePanel({ open, communication, onClose }: AgentSidePanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const { mutate: dispatchAction } = useMutation<
    { vendorId: number; instruction: string; history: ChatMessage[] },
    { taskId: string; sessionKey: string }
  >("agent.action");

  // Reset chat when communication changes
  useEffect(() => {
    setMessages([]);
    setLoading(false);
    unsubRef.current?.();
    unsubRef.current = null;
  }, [communication?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => unsubRef.current?.();
  }, []);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (instruction: string) => {
    if (!communication) return;

    const userMsg: ChatMessage = { role: "user", content: instruction };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Subscribe to events BEFORE dispatching so we never miss the response
    unsubRef.current?.();
    let taskId: string | null = null;

    unsubRef.current = wsClient.onEvent((event: GatewayEvent) => {
      if (event.name === "agent-complete" && taskId && event.data.taskId === taskId) {
        const { summary } = event.data;
        setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
        setLoading(false);
        unsubRef.current?.();
        unsubRef.current = null;
      }
    });

    try {
      const result = await dispatchAction({
        vendorId: communication.vendorId,
        instruction,
        history: [...messages, userMsg],
      });
      taskId = result.taskId;
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to start agent. Please try again." },
      ]);
      setLoading(false);
      unsubRef.current?.();
      unsubRef.current = null;
    }
  }, [communication, messages, dispatchAction]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 400, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-full border-l border-border flex flex-col bg-surface overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-on-surface">AI Assistant</span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-on-surface-secondary hover:text-on-surface hover:bg-surface-active transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Context preview */}
          {communication && (
            <div className="px-3 py-2 border-b border-border bg-surface-subtle">
              <p className="text-xs text-on-surface-tertiary">
                {communication.channel} from {communication.vendorName ?? "unknown"}
              </p>
              <p className="text-xs text-on-surface-secondary truncate mt-0.5">
                {communication.subject ?? communication.bodyOriginal.slice(0, 80)}
              </p>
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-on-surface-tertiary text-xs mt-8">
                <p>Ask the AI to analyze this conversation.</p>
                <p className="mt-1 text-on-surface-faint">
                  e.g. "Pull out pricing info" or "Draft a reply"
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm ${msg.role === "user" ? "text-on-surface-secondary" : "text-on-surface-secondary"}`}
              >
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

          {/* Compose */}
          <ComposeBox
            onSend={handleSend}
            disabled={loading}
            placeholder="Ask about this conversation..."
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
