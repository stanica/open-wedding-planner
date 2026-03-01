import { useState } from "react";
import { MapPin, Heart } from "lucide-react";
import { Card, CardContent } from "../common/Card";
import { VendorStatusBadge } from "./VendorStatusBadge";

interface VendorCardProps {
  vendor: {
    id: number;
    name: string;
    location: string | null;
    favorite: boolean;
    status: string;
    description: string | null;
    imageUrl: string | null;
  };
  onClick: () => void;
  onToggleFavorite: (id: number, favorite: boolean) => void;
}

export function VendorCard({ vendor, onClick, onToggleFavorite }: VendorCardProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = vendor.imageUrl && !imgError;

  return (
    <Card onClick={onClick}>
      <CardContent>
        <div className="flex gap-3">
          {showImage && (
            <img
              src={vendor.imageUrl!}
              alt=""
              onError={() => setImgError(true)}
              className="h-12 w-12 rounded object-cover shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-on-surface">{vendor.name}</h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(vendor.id, !vendor.favorite);
                  }}
                  className="text-on-surface-tertiary hover:text-rose-400 transition-colors"
                >
                  <Heart
                    className={`h-3.5 w-3.5 ${vendor.favorite ? "fill-rose-400 text-rose-400" : ""}`}
                  />
                </button>
                <VendorStatusBadge status={vendor.status} />
              </div>
            </div>
            {vendor.location && (
              <div className="mt-1 flex items-center gap-1 text-xs text-on-surface-secondary">
                <MapPin className="h-3 w-3" />
                <span>{vendor.location}</span>
              </div>
            )}
            {vendor.description && (
              <p className="mt-2 text-xs text-on-surface-tertiary line-clamp-2">
                {vendor.description}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
