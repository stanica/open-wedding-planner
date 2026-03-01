import { MapPin, Heart } from "lucide-react";
import { VendorStatusBadge } from "./VendorStatusBadge";

interface VendorTableViewProps {
  vendors: Array<{
    id: number;
    name: string;
    location: string | null;
    favorite: boolean;
    status: string;
  }>;
  onVendorClick: (id: number) => void;
  onToggleFavorite: (id: number, favorite: boolean) => void;
}

export function VendorTableView({ vendors, onVendorClick, onToggleFavorite }: VendorTableViewProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-on-surface-tertiary">
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Location</th>
            <th className="px-4 py-2.5 font-medium w-10"></th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr
              key={vendor.id}
              onClick={() => onVendorClick(vendor.id)}
              className="border-b border-border-subtle cursor-pointer hover:bg-surface-hover transition-colors"
            >
              <td className="px-4 py-2.5 font-medium text-on-surface">{vendor.name}</td>
              <td className="px-4 py-2.5">
                <VendorStatusBadge status={vendor.status} />
              </td>
              <td className="px-4 py-2.5 text-on-surface-secondary">
                {vendor.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {vendor.location}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(vendor.id, !vendor.favorite);
                  }}
                  className="text-on-surface-tertiary hover:text-rose-400 transition-colors"
                >
                  <Heart className={`h-3.5 w-3.5 ${vendor.favorite ? "fill-rose-400 text-rose-400" : ""}`} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
