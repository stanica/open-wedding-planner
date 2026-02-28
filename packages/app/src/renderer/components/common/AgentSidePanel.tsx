import { useState, useEffect, useRef } from "react";
import { X, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ComposeBox } from "./ComposeBox";
import { useMutation } from "../../hooks/useRequest";
import { wsClient } from "../../lib/ws-client";
import type { Communication } from "./ConversationThread";
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
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { mutate: dispatchAction } = useMutation<
    { communicationId: number; instruction: string; history: ChatMessage[] },
    { taskId: string; sessionKey: string }
  >("agent.action");

  // Reset chat when communication changes
  useEffect(() => {
    setMessages([]);
    setActiveTaskId(null);
  }, [communication?.id]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for agent responses — filter by taskId to avoid picking up unrelated agent completions
  useEffect(() => {
    if (!loading || !activeTaskId) return;

    const unsub = wsClient.onEvent((event: GatewayEvent) => {
      if (event.name === "agent-complete" && event.data.taskId === activeTaskId) {
        const { summary } = event.data;
        setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
        setLoading(false);
        setActiveTaskId(null);
      }
    });

    return unsub;
  }, [loading, activeTaskId]);

  async function handleSend(instruction: string) {
    if (!communication) return;

    const userMsg: ChatMessage = { role: "user", content: instruction };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await dispatchAction({
        communicationId: communication.id,
        instruction,
        history: [...messages, userMsg],
      });
      setActiveTaskId(result.taskId);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to start agent. Please try again." },
      ]);
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 400, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-full border-l border-white/10 flex flex-col bg-gray-950 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-white">AI Assistant</span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Context preview */}
          {communication && (
            <div className="px-3 py-2 border-b border-white/10 bg-white/[0.03]">
              <p className="text-xs text-gray-500">
                {communication.channel} from {communication.vendorName ?? "unknown"}
              </p>
              <p className="text-xs text-gray-400 truncate mt-0.5">
                {communication.subject ?? communication.bodyOriginal.slice(0, 80)}
              </p>
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-xs mt-8">
                <p>Ask the AI to analyze this message.</p>
                <p className="mt-1 text-gray-600">
                  e.g. "Pull out pricing info" or "Draft a reply"
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm ${msg.role === "user" ? "text-gray-300" : "text-gray-400"}`}
              >
                <span className="text-xs font-medium text-gray-500 block mb-0.5">
                  {msg.role === "user" ? "You" : "AI"}
                </span>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
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
            placeholder="Ask about this message..."
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
