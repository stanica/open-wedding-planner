import { useState, useEffect, useCallback, useRef } from "react";
import { wsClient } from "../../lib/ws-client";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { useVendors } from "../../hooks/useVendors";
import { ThreadList } from "./ThreadList";
import { ChatMessage } from "./ChatMessage";
import { ComposeBox } from "./ComposeBox";
import { PermissionRequestCard } from "./PermissionRequestCard";
import type { GatewayEvent } from "@wedding-planner/shared";

interface Thread {
  id: number;
  title: string;
  categoryTags: string | null;
  updatedAt: string;
}

interface Message {
  id: number;
  threadId: number;
  role: string;
  content: string;
  toolCalls: string | null;
  vendorIds: string | null;
  createdAt: string;
}

interface PendingPermission {
  requestId: string;
  toolName: string;
  toolDescription: string;
  resolved: string | null;
}

export function ResearchView() {
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [activeSession, _setActiveSession] = useState<string | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const setActiveSession = (v: string | null) => {
    activeSessionRef.current = v;
    _setActiveSession(v);
  };
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<Array<{ toolName: string; detail: string }>>(
    [],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Data fetching
  const { data: threads, refetch: refetchThreads } = useRequest<Thread[]>(
    "research.threads.list",
  );
  const { data: messages, refetch: refetchMessages } = useRequest<Message[]>(
    activeThreadId ? "research.messages.list" : null,
    activeThreadId ? { threadId: activeThreadId } : undefined,
  );
  const { data: allVendors } = useVendors();

  // Mutations
  const { mutate: createThread } = useMutation<{ title: string }, Thread>(
    "research.threads.create",
  );
  const { mutate: deleteThread } = useMutation<{ id: number }, unknown>(
    "research.threads.delete",
  );
  const { mutate: createMessage } = useMutation<
    { threadId: number; role: string; content: string },
    Message
  >("research.messages.create");
  const { mutate: startResearch, loading: researching } = useMutation<
    { threadId: number; messages: unknown[] },
    { taskId: string; sessionKey: string }
  >("agent.research");
  const { mutate: respondPermission } = useMutation<
    { requestId: string; response: string },
    unknown
  >("research.permissionResponse");

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveToolCalls, pendingPermissions, researching, activeSession]);

  // WebSocket event handler — uses ref to avoid stale closure for activeSession
  useEffect(() => {
    return wsClient.onEvent((event: GatewayEvent) => {
      const session = activeSessionRef.current;

      if (event.name === "agent-activity" && event.data.sessionKey === session) {
        if (event.data.action === "tool-call" && event.data.detail) {
          setLiveToolCalls((prev) => [
            ...prev,
            { toolName: event.data.detail!.split(":")[0], detail: event.data.detail! },
          ]);
        }
      }

      if (event.name === "agent-complete" && session) {
        setActiveSession(null);
        setLiveToolCalls([]);
        refetchMessages();
        refetchThreads();
      }

      if (event.name === "research.permissionRequest") {
        const data = event.data;
        if (data.sessionKey === session) {
          setPendingPermissions((prev) => [
            ...prev,
            {
              requestId: data.requestId,
              toolName: data.toolName,
              toolDescription: data.toolDescription,
              resolved: null,
            },
          ]);
        }
      }
    });
  }, [refetchMessages, refetchThreads]);

  // Handlers
  async function handleCreateThread() {
    const thread = await createThread({ title: "New research" });
    setActiveThreadId(thread.id);
    refetchThreads();
  }

  async function handleDeleteThread(threadId: number) {
    await deleteThread({ id: threadId });
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
    }
    refetchThreads();
  }

  async function handleSend(content: string) {
    let threadId = activeThreadId;

    if (!threadId) {
      // Auto-create thread from first message
      const title = content.length > 50 ? content.slice(0, 50) + "..." : content;
      const thread = await createThread({ title });
      threadId = thread.id;
      setActiveThreadId(thread.id);
      refetchThreads();
    }

    // Save user message
    await createMessage({ threadId, role: "user", content });
    refetchMessages();

    // Build conversation history — use fresh fetch since state may be stale
    let history: Message[] = [];
    try {
      history = await wsClient.request<Message[]>("research.messages.list", { threadId });
    } catch {
      // Fall back to current state
      history = messages ?? [];
    }

    const agentMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const result = await startResearch({ threadId, messages: agentMessages });
    setActiveSession(result.sessionKey);
  }

  async function handlePermissionDecision(
    requestId: string,
    decision: "allow" | "always-allow" | "deny",
  ) {
    await respondPermission({ requestId, response: decision });
    setPendingPermissions((prev) =>
      prev.map((p) => (p.requestId === requestId ? { ...p, resolved: decision } : p)),
    );
  }

  // Build vendor lookup
  const vendorMap = new Map((allVendors ?? []).map((v) => [v.id, v]));

  function getVendorsForMessage(msg: Message) {
    if (!msg.vendorIds) return [];
    try {
      const ids: number[] = JSON.parse(msg.vendorIds);
      return ids
        .map((id) => vendorMap.get(id))
        .filter(Boolean) as Array<{
        id: number;
        name: string;
        location: string | null;
        description: string | null;
      }>;
    } catch {
      return [];
    }
  }

  function getToolCallsForMessage(msg: Message) {
    if (!msg.toolCalls) return [];
    try {
      return JSON.parse(msg.toolCalls) as Array<{
        toolName: string;
        args: unknown;
        result: unknown;
      }>;
    } catch {
      return [];
    }
  }

  return (
    <div className="flex h-full">
      {/* Thread sidebar */}
      <div className="w-64 shrink-0">
        <ThreadList
          threads={threads ?? []}
          activeThreadId={activeThreadId}
          onSelect={(id) => {
            setActiveThreadId(id);
            setActiveSession(null);
            setLiveToolCalls([]);
            setPendingPermissions([]);
          }}
          onCreate={handleCreateThread}
          onDelete={handleDeleteThread}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6">
          {activeThreadId && messages ? (
            <>
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as "user" | "assistant"}
                  content={msg.content}
                  toolCalls={getToolCallsForMessage(msg)}
                  vendors={getVendorsForMessage(msg)}
                />
              ))}

              {/* Live agent activity */}
              {(researching || activeSession) && (
                <div className="py-4">
                  <span className="text-xs font-medium text-purple-400">Assistant</span>
                  <div className="mt-2 flex flex-col gap-1">
                    {liveToolCalls.length > 0 ? (
                      liveToolCalls.map((tc, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs text-gray-500"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                          <span>{tc.detail}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                        <span>Thinking...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pending permission requests */}
              {pendingPermissions.map((p) => (
                <PermissionRequestCard
                  key={p.requestId}
                  toolName={p.toolName}
                  toolDescription={p.toolDescription}
                  resolved={p.resolved}
                  onDecision={(decision) => handlePermissionDecision(p.requestId, decision)}
                />
              ))}

              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p className="text-sm">
                Start a new research thread or select one from the sidebar.
              </p>
            </div>
          )}
        </div>

        {/* Compose box */}
        <ComposeBox onSend={handleSend} disabled={researching || !!activeSession} />
      </div>
    </div>
  );
}
