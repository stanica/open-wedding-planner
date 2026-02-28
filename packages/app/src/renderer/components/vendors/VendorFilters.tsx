import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Heart } from "lucide-react";

interface VendorFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  favoritesOnly: boolean;
  onFavoritesChange: (value: boolean) => void;
}

const STATUSES = [
  { value: "", label: "All statuses", color: null },
  { value: "researched", label: "Researched", color: "bg-blue-400" },
  { value: "contacted", label: "Contacted", color: "bg-amber-400" },
  { value: "quoted", label: "Quoted", color: "bg-gray-400" },
  { value: "booked", label: "Booked", color: "bg-emerald-400" },
  { value: "rejected", label: "Rejected", color: "bg-red-400" },
];

export function VendorFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  favoritesOnly,
  onFavoritesChange,
}: VendorFiltersProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = STATUSES.find((s) => s.value === statusFilter) ?? STATUSES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search vendors..."
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-white/30"
        />
      </div>
      <button
        onClick={() => onFavoritesChange(!favoritesOnly)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${favoritesOnly ? "border-rose-400/30 bg-rose-400/10 text-rose-400" : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"}`}
      >
        <Heart className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-rose-400" : ""}`} />
        Favorites
      </button>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none hover:border-white/20"
        >
          {selected.color && <span className={`inline-block h-2 w-2 rounded-full ${selected.color}`} />}
          {selected.label}
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </button>
        {open && (
          <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-white/10 bg-gray-900 py-1 shadow-lg">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => { onStatusChange(s.value); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/10 ${s.value === statusFilter ? "text-white" : "text-gray-400"}`}
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
    </div>
  );
}
