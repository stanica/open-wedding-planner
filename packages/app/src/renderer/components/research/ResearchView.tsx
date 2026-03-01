import { useEffect, useRef } from "react";
import { Square, Wrench } from "lucide-react";
import { wsClient } from "../../lib/ws-client";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { useVendors } from "../../hooks/useVendors";
import { useResearchStore } from "../../stores/research-store";
import { ThreadList } from "./ThreadList";
import { ChatMessage } from "./ChatMessage";
import { ComposeBox, type SlashCommand } from "../common/ComposeBox";
import { PermissionRequestCard } from "./PermissionRequestCard";
import { TokenUsageBar } from "./TokenUsageBar";

interface Thread {
  id: number;
  title: string;
  categoryTags: string | null;
  updatedAt: string;
  lastInputTokens: number | null;
  lastContextWindow: number | null;
  lastModelName: string | null;
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

export function ResearchView() {
  const {
    activeThreadId,
    activeSession,
    sessionThreadId,
    liveToolCalls,
    pendingPermissions,
    completedAt,
    contextCompactedAt,
    setActiveThreadId,
    setActiveSession,
    clearSession,
    resolvePermission,
  } = useResearchStore();
  const isSessionThread = activeThreadId === sessionThreadId;
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
  const { mutate: updateThread } = useMutation<
    { id: number; title?: string },
    Thread
  >("research.threads.update");
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
  const { mutate: stopAgent } = useMutation<{ sessionKey: string }, unknown>("agent.stop");

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveToolCalls, pendingPermissions, activeSession]);

  // Refetch threads when another client creates/updates/deletes a thread
  // and refetch messages when a new message arrives (e.g. via WhatsApp self-chat)
  useEffect(() => {
    const unsub = wsClient.onEvent((event) => {
      if (event.name === "research.threadsChanged") {
        refetchThreads();
      }
      if (
        event.name === "research.messagesChanged" &&
        (event.data as { threadId: number }).threadId === activeThreadId
      ) {
        refetchMessages();
      }
    });
    return unsub;
  }, [refetchThreads, refetchMessages, activeThreadId]);

  // Refetch data when agent completes (even if we were on another tab)
  const completedAtSeen = useRef<number | null>(null);
  useEffect(() => {
    if (completedAt && completedAt !== completedAtSeen.current) {
      completedAtSeen.current = completedAt;
      refetchMessages();
      refetchThreads();
    }
  }, [completedAt, refetchMessages, refetchThreads]);

  // Refetch messages when context is compacted
  const compactedAtSeen = useRef<number | null>(null);
  useEffect(() => {
    if (contextCompactedAt && contextCompactedAt !== compactedAtSeen.current) {
      compactedAtSeen.current = contextCompactedAt;
      refetchMessages();
    }
  }, [contextCompactedAt, refetchMessages]);

  // Load persisted token usage when switching threads
  useEffect(() => {
    if (activeThreadId && threads) {
      const thread = threads.find((t) => t.id === activeThreadId);
      if (thread?.lastInputTokens && thread?.lastContextWindow && thread?.lastModelName) {
        useResearchStore.setState({
          tokenUsage: {
            inputTokens: thread.lastInputTokens,
            contextWindow: thread.lastContextWindow,
            modelName: thread.lastModelName,
          },
        });
      } else {
        useResearchStore.setState({ tokenUsage: null });
      }
    } else {
      useResearchStore.setState({ tokenUsage: null });
    }
  }, [activeThreadId, threads]);

  // Handlers
  async function handleCreateThread() {
    const thread = await createThread({ title: "New research" });
    setActiveThreadId(thread.id);
    refetchThreads();
  }

  async function handleRenameThread(threadId: number, title: string) {
    await updateThread({ id: threadId, title });
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
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const result = await startResearch({ threadId, messages: agentMessages });
    // Only set session if not queued (agent is actually starting)
    if (result && !(result as any).queued) {
      setActiveSession(result.sessionKey, threadId);
    }
  }

  async function handleStop() {
    if (activeSession) {
      await stopAgent({ sessionKey: activeSession });
      clearSession();
    }
  }

  async function handlePermissionDecision(
    requestId: string,
    decision: "allow" | "always-allow" | "deny",
  ) {
    await respondPermission({ requestId, response: decision });
    resolvePermission(requestId, decision);
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

  const slashCommands: SlashCommand[] = [
    { name: "compact", description: "Summarize conversation to save context" },
    { name: "clear", description: "Clear all messages in this thread" },
    { name: "model", description: "Switch AI model", args: "<model-name>" },
  ];

  async function handleSlashCommand(command: string, args: string) {
    if (!activeThreadId) return;

    switch (command) {
      case "compact":
        await wsClient.request("research.compact", { threadId: activeThreadId });
        refetchMessages();
        break;
      case "clear":
        await wsClient.request("research.clear", { threadId: activeThreadId });
        refetchMessages();
        useResearchStore.setState({ tokenUsage: null });
        break;
      case "model":
        if (args) {
          await wsClient.request("research.switchModel", { model: args });
        }
        break;
    }
  }

  return (
    <div className="flex h-full">
      {/* Thread sidebar */}
      <div className="w-64 shrink-0">
        <ThreadList
          threads={threads ?? []}
          activeThreadId={activeThreadId}
          onSelect={(id) => setActiveThreadId(id)}
          onCreate={handleCreateThread}
          onDelete={handleDeleteThread}
          onRename={handleRenameThread}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TokenUsageBar />
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6">
          {activeThreadId && messages ? (
            <>
              {messages.map((msg) =>
                msg.role === "system" ? (
                  <div
                    key={msg.id}
                    className="my-4 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3"
                  >
                    <div className="flex-1">
                      <p className="text-xs font-medium text-amber-400">
                        Conversation compacted
                      </p>
                      <p className="mt-0.5 text-xs text-on-surface-tertiary">
                        Earlier messages were summarized to stay within the context window. Scroll up to see the full history.
                      </p>
                    </div>
                  </div>
                ) : (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role as "user" | "assistant"}
                    content={msg.content}
                    toolCalls={getToolCallsForMessage(msg)}
                    vendors={getVendorsForMessage(msg)}
                  />
                ),
              )}

              {/* Live agent activity */}
              {(researching || (activeSession && isSessionThread)) && (
                <div className="py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-purple-400">Assistant</span>
                    {activeSession && (
                      <button
                        onClick={handleStop}
                        className="flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-on-surface-secondary hover:bg-surface-active hover:text-on-surface transition-colors"
                      >
                        <Square className="h-3 w-3" />
                        Stop
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {liveToolCalls.length > 0 ? (
                      <>
                        {liveToolCalls.length > 1 && (
                          <div className="flex items-center gap-1.5 text-xs text-on-surface-faint">
                            <Wrench className="h-3 w-3" />
                            <span>{liveToolCalls.length} tool calls</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                          <span>{liveToolCalls[liveToolCalls.length - 1].detail}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
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
                  context={p.context}
                  resolved={p.resolved}
                  onDecision={(decision) => handlePermissionDecision(p.requestId, decision)}
                />
              ))}

              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-on-surface-tertiary">
              <p className="text-sm">
                Start a new research thread or select one from the sidebar.
              </p>
            </div>
          )}
        </div>

        {/* Compose box */}
        <ComposeBox
          onSend={handleSend}
          onSlashCommand={handleSlashCommand}
          slashCommands={slashCommands}
        />
      </div>
    </div>
  );
}
