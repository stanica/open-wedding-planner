import { create } from "zustand";

export type LogSource = "agent" | "gateway" | "ws";

export interface LogEntry {
  id: number;
  source: LogSource;
  timestamp: number;
  summary: string;
  detail?: unknown;
}

const MAX_ENTRIES = 1000;
let nextId = 0;

interface DebugStore {
  entries: LogEntry[];
  filter: LogSource | "all";
  searchQuery: string;
  autoScroll: boolean;
  push: (entry: Omit<LogEntry, "id">) => void;
  clear: () => void;
  setFilter: (filter: LogSource | "all") => void;
  setSearchQuery: (query: string) => void;
  setAutoScroll: (on: boolean) => void;
}

export const useDebugStore = create<DebugStore>((set) => ({
  entries: [],
  filter: "all",
  searchQuery: "",
  autoScroll: true,
  push: (entry) =>
    set((state) => {
      const newEntries = [...state.entries, { ...entry, id: nextId++ }];
      if (newEntries.length > MAX_ENTRIES) {
        return { entries: newEntries.slice(newEntries.length - MAX_ENTRIES) };
      }
      return { entries: newEntries };
    }),
  clear: () => set({ entries: [] }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setAutoScroll: (on) => set({ autoScroll: on }),
}));
