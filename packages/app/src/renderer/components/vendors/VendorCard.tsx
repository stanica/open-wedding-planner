import { useState } from "react";
import { MapPin } from "lucide-react";
import { Card, CardContent } from "../common/Card";
import { VendorStatusBadge } from "./VendorStatusBadge";

interface VendorCardProps {
  vendor: {
    id: number;
    name: string;
    location: string | null;
    status: string;
    description: string | null;
    imageUrl: string | null;
  };
  onClick: () => void;
}

export function VendorCard({ vendor, onClick }: VendorCardProps) {
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
              <h3 className="font-medium text-white truncate">{vendor.name}</h3>
              <VendorStatusBadge status={vendor.status} />
            </div>
            {vendor.location && (
              <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                <MapPin className="h-3 w-3" />
                <span>{vendor.location}</span>
              </div>
            )}
            {vendor.description && (
              <p className="mt-2 text-xs text-gray-500 line-clamp-2">
                {vendor.description}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
