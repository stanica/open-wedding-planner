import { useState } from "react";
import { Search } from "lucide-react";

interface ResearchInputProps {
  onSubmit: (query: string) => void;
  disabled?: boolean;
}

export function ResearchInput({ onSubmit, disabled }: ResearchInputProps) {
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setQuery("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for vendors, venues, services..."
          disabled={disabled}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !query.trim()}
        className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-950 hover:bg-gray-200 disabled:opacity-50"
      >
        Research
      </button>
    </form>
  );
}
