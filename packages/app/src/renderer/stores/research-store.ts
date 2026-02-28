import { create } from "zustand";
import { wsClient } from "../lib/ws-client";
import type { GatewayEvent } from "@wedding-planner/shared";

interface PendingPermission {
  requestId: string;
  toolName: string;
  toolDescription: string;
  context?: string;
  resolved: string | null;
}

interface ResearchStore {
  activeThreadId: number | null;
  activeSession: string | null;
  sessionThreadId: number | null;
  liveToolCalls: Array<{ toolName: string; detail: string }>;
  pendingPermissions: PendingPermission[];
  completedAt: number | null;
  contextCompactedAt: number | null;
  tokenUsage: { inputTokens: number; contextWindow: number; modelName: string } | null;

  setActiveThreadId: (id: number | null) => void;
  setActiveSession: (key: string | null, threadId: number) => void;
  clearSession: () => void;
  resolvePermission: (requestId: string, decision: string) => void;
}

type PermissionEventData = Extract<GatewayEvent, { name: "research.permissionRequest" }>["data"];

// Buffer for permission events that arrive before activeSession is set
let bufferedPermissions: Array<{ sessionKey: string; data: PermissionEventData }> = [];

export const useResearchStore = create<ResearchStore>((set) => ({
  activeThreadId: null,
  activeSession: null,
  sessionThreadId: null,
  liveToolCalls: [],
  pendingPermissions: [],
  completedAt: null,
  contextCompactedAt: null,
  tokenUsage: null,

  setActiveThreadId: (id) => set({ activeThreadId: id }),

  setActiveSession: (key, threadId) => {
    if (key) {
      const matching = bufferedPermissions.filter((b) => b.sessionKey === key);
      bufferedPermissions = [];
      set((state) => ({
        activeSession: key,
        sessionThreadId: threadId,
        pendingPermissions:
          matching.length > 0
            ? [
                ...state.pendingPermissions,
                ...matching.map((b) => ({
                  requestId: b.data.requestId,
                  toolName: b.data.toolName,
                  toolDescription: b.data.toolDescription,
                  context: b.data.context,
                  resolved: null,
                })),
              ]
            : state.pendingPermissions,
      }));
    } else {
      set({ activeSession: null });
    }
  },

  clearSession: () =>
    set({
      activeSession: null,
      sessionThreadId: null,
      liveToolCalls: [],
      pendingPermissions: [],
      completedAt: Date.now(),
      tokenUsage: null,
    }),

  resolvePermission: (requestId, decision) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.map((p) =>
        p.requestId === requestId ? { ...p, resolved: decision } : p,
      ),
    })),
}));

// Subscribe to WebSocket events once (app-level, survives component unmounts)
wsClient.onEvent((event: GatewayEvent) => {
  const { activeSession } = useResearchStore.getState();

  if (event.name === "agent-activity" && event.data.sessionKey === activeSession) {
    if (event.data.action === "tool-call" && event.data.detail) {
      useResearchStore.setState((state) => ({
        liveToolCalls: [
          ...state.liveToolCalls,
          { toolName: event.data.detail!.split(":")[0], detail: event.data.detail! },
        ],
      }));
    }
  }

  if (event.name === "agent-complete" && activeSession && event.data.sessionKey === activeSession) {
    useResearchStore.getState().clearSession();
  }

  if (event.name === "context-compacted") {
    useResearchStore.setState({ contextCompactedAt: Date.now() });
  }

  if (event.name === "research.tokenUsage") {
    const data = event.data;
    useResearchStore.setState({
      tokenUsage: {
        inputTokens: data.inputTokens,
        contextWindow: data.contextWindow,
        modelName: data.modelName,
      },
    });
  }

  if (event.name === "research.permissionRequest") {
    const data = event.data;
    if (data.sessionKey === activeSession) {
      useResearchStore.setState((state) => ({
        pendingPermissions: [
          ...state.pendingPermissions,
          {
            requestId: data.requestId,
            toolName: data.toolName,
            toolDescription: data.toolDescription,
            context: data.context,
            resolved: null,
          },
        ],
      }));
    } else if (!activeSession) {
      bufferedPermissions.push({ sessionKey: data.sessionKey, data: event.data });
    }
  }
});
