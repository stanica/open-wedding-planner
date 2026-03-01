import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Heart, LayoutGrid, List, ArrowUpDown } from "lucide-react";

interface Category {
  id: number;
  name: string;
}

export type SortOption = "name-asc" | "name-desc" | "newest" | "status";
export type ViewMode = "grid" | "table";

interface VendorFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  favoritesOnly: boolean;
  onFavoritesChange: (value: boolean) => void;
  categories: Category[];
  categoryFilter: number | null;
  onCategoryChange: (categoryId: number | null) => void;
  categoryCounts: Map<number, number>;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const STATUSES = [
  { value: "", label: "All statuses", color: null },
  { value: "researched", label: "Researched", color: "bg-blue-400" },
  { value: "contacted", label: "Contacted", color: "bg-amber-400" },
  { value: "quoted", label: "Quoted", color: "bg-gray-400" },
  { value: "booked", label: "Booked", color: "bg-emerald-400" },
  { value: "rejected", label: "Rejected", color: "bg-red-400" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "newest", label: "Newest first" },
  { value: "status", label: "Status" },
];

export function VendorFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  favoritesOnly,
  onFavoritesChange,
  categories,
  categoryFilter,
  onCategoryChange,
  categoryCounts,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
}: VendorFiltersProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const selected = STATUSES.find((s) => s.value === statusFilter) ?? STATUSES[0];
  const selectedSort = SORT_OPTIONS.find((s) => s.value === sortBy) ?? SORT_OPTIONS[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Category chips row */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => onCategoryChange(null)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            categoryFilter === null
              ? "bg-surface-active text-on-surface"
              : "bg-surface-elevated text-on-surface-secondary hover:bg-surface-active"
          }`}
        >
          All
        </button>
        {categories.filter((cat) => (categoryCounts.get(cat.id) ?? 0) > 0).map((cat) => {
          const count = categoryCounts.get(cat.id)!;
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id === categoryFilter ? null : cat.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                categoryFilter === cat.id
                  ? "bg-surface-active text-on-surface"
                  : "bg-surface-elevated text-on-surface-secondary hover:bg-surface-active"
              }`}
            >
              {cat.name}
              <span className="ml-1.5 text-xs text-on-surface-tertiary">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filter controls row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search vendors..."
            className="w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-on-surface outline-none focus:border-border-hover"
          />
        </div>
        <button
          onClick={() => onFavoritesChange(!favoritesOnly)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${favoritesOnly ? "border-rose-400/30 bg-rose-400/10 text-rose-400" : "border-border bg-surface-elevated text-on-surface-secondary hover:border-border-hover"}`}
        >
          <Heart className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-rose-400" : ""}`} />
          Favorites
        </button>

        {/* Status dropdown */}
        <div className="relative" ref={statusRef}>
          <button
            onClick={() => setStatusOpen(!statusOpen)}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface outline-none hover:border-border-hover"
          >
            {selected.color && <span className={`inline-block h-2 w-2 rounded-full ${selected.color}`} />}
            {selected.label}
            <ChevronDown className="h-3 w-3 text-on-surface-secondary" />
          </button>
          {statusOpen && (
            <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-dropdown py-1 shadow-lg">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { onStatusChange(s.value); setStatusOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-active ${s.value === statusFilter ? "text-on-surface" : "text-on-surface-secondary"}`}
                >
                  {s.color ? (
                    <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
                  ) : (
                    <span className="inline-block h-2 w-2" />
                  )}
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort dropdown */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface outline-none hover:border-border-hover"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-on-surface-secondary" />
            {selectedSort.label}
            <ChevronDown className="h-3 w-3 text-on-surface-secondary" />
          </button>
          {sortOpen && (
            <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-dropdown py-1 shadow-lg">
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { onSortChange(s.value); setSortOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-active ${s.value === sortBy ? "text-on-surface" : "text-on-surface-secondary"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View mode toggle */}
        <button
          onClick={() => onViewModeChange(viewMode === "grid" ? "table" : "grid")}
          className="rounded-lg border border-border bg-surface-elevated p-2 text-on-surface-secondary hover:border-border-hover hover:text-on-surface transition-colors"
          title={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
        >
          {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
