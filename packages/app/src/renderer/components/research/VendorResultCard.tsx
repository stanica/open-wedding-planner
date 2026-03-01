import { MapPin, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface VendorResultCardProps {
  vendorId: number;
  name: string;
  location?: string | null;
  description?: string | null;
  price?: string | null;
}

export function VendorResultCard({ vendorId, name, location, description, price }: VendorResultCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/vendors/${vendorId}`)}
      className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-surface-subtle hover:bg-surface-hover cursor-pointer transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-on-surface">{name}</span>
          {price && <span className="text-sm font-semibold text-emerald-400">{price}</span>}
        </div>
        {location && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-on-surface-secondary">
            <MapPin className="h-3 w-3" />
            <span>{location}</span>
          </div>
        )}
        {description && <p className="mt-1 text-xs text-on-surface-tertiary line-clamp-1">{description}</p>}
      </div>
      <ExternalLink className="h-4 w-4 text-on-surface-faint shrink-0 mt-0.5" />
    </div>
  );
}
