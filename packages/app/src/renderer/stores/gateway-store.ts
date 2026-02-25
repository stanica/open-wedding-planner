import { create } from "zustand";
import type { GatewayStateSnapshot } from "@wedding-planner/shared";

interface GatewayStore {
  connected: boolean;
  state: GatewayStateSnapshot | null;
  eventSeq: number;
  setConnected: (connected: boolean) => void;
  setState: (state: GatewayStateSnapshot) => void;
  setEventSeq: (seq: number) => void;
}

export const useGatewayStore = create<GatewayStore>((set) => ({
  connected: false,
  state: null,
  eventSeq: 0,
  setConnected: (connected) => set({ connected }),
  setState: (state) => set({ state }),
  setEventSeq: (seq) => set({ eventSeq: seq }),
}));
