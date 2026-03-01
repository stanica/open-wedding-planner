import { useState, useMemo } from "react";
import { X, Search } from "lucide-react";
import { useVendors } from "../../hooks/useVendors";

interface VendorPickerModalProps {
  excludeVendorIds: number[];
  onSelect: (vendorId: number, vendorName: string) => void;
  onClose: () => void;
}

export function VendorPickerModal({ excludeVendorIds, onSelect, onClose }: VendorPickerModalProps) {
  const [search, setSearch] = useState("");
  const { data: vendors } = useVendors();

  const filtered = useMemo(() => {
    if (!vendors) return [];
    return vendors
      .filter((v) => (v.contactWhatsapp || v.contactPhone) && !excludeVendorIds.includes(v.id))
      .filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));
  }, [vendors, search, excludeVendorIds]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface-dropdown p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-on-surface">New conversation</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-surface-active transition-colors"
          >
            <X className="h-4 w-4 text-on-surface-secondary" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors..."
            autoFocus
            className="w-full rounded-lg border border-border bg-surface-elevated pl-8 pr-3 py-1.5 text-sm text-on-surface placeholder:text-placeholder focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="max-h-64 overflow-y-auto -mx-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-on-surface-tertiary text-center py-6">
              {vendors?.length ? "No matching vendors with a phone number" : "No vendors found"}
            </p>
          ) : (
            filtered.map((v) => (
              <button
                key={v.id}
                onClick={() => onSelect(v.id, v.name)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <span className="text-sm text-on-surface">{v.name}</span>
                <span className="block text-xs text-on-surface-tertiary">
                  {v.contactWhatsapp ?? v.contactPhone}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
