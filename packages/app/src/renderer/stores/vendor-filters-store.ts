import { create } from "zustand";
import type { SortOption, ViewMode } from "../components/vendors/VendorFilters";

interface VendorFiltersStore {
  search: string;
  statusFilter: string;
  categoryFilter: number | null;
  sortBy: SortOption;
  viewMode: ViewMode;
  favoritesOnly: boolean;

  setSearch: (search: string) => void;
  setStatusFilter: (status: string) => void;
  setCategoryFilter: (categoryId: number | null) => void;
  setSortBy: (sort: SortOption) => void;
  setViewMode: (mode: ViewMode) => void;
  setFavoritesOnly: (favoritesOnly: boolean) => void;
}

export const useVendorFiltersStore = create<VendorFiltersStore>((set) => ({
  search: "",
  statusFilter: "",
  categoryFilter: null,
  sortBy: "name-asc",
  viewMode: "grid",
  favoritesOnly: false,

  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setViewMode: (viewMode) => set({ viewMode }),
  setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
}));
