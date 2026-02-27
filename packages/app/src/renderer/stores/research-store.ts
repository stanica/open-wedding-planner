import { create } from "zustand";
import { wsClient } from "../lib/ws-client";
import type { GatewayEvent } from "@wedding-planner/shared";

interface PendingPermission {
  requestId: string;
  toolName: string;
  toolDescription: string;
  context: string | undefined;
  resolved: string | null;
}

interface ResearchStore {
  activeSession: string | null;
  liveToolCalls: Array<{ toolName: string; detail: string }>;
  pendingPermissions: PendingPermission[];
  completedAt: number | null;

  setActiveSession: (key: string | null) => void;
  clearSession: () => void;
  resolvePermission: (requestId: string, decision: string) => void;
}

// Buffer for permission events that arrive before activeSession is set
let bufferedPermissions: Array<{ sessionKey: string; data: GatewayEvent["data"] }> = [];

export const useResearchStore = create<ResearchStore>((set, get) => ({
  activeSession: null,
  liveToolCalls: [],
  pendingPermissions: [],
  completedAt: null,

  setActiveSession: (key) => {
    set({ activeSession: key });
    if (key) {
      const matching = bufferedPermissions.filter((b) => b.sessionKey === key);
      bufferedPermissions = [];
      if (matching.length > 0) {
        set((state) => ({
          pendingPermissions: [
            ...state.pendingPermissions,
            ...matching.map((b) => {
              const d = b.data as any;
              return {
                requestId: d.requestId,
                toolName: d.toolName,
                toolDescription: d.toolDescription,
                context: d.context,
                resolved: null,
              };
            }),
          ],
        }));
      }
    }
  },

  clearSession: () =>
    set({
      activeSession: null,
      liveToolCalls: [],
      pendingPermissions: [],
      completedAt: Date.now(),
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

  if (event.name === "agent-complete" && activeSession) {
    useResearchStore.getState().clearSession();
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
