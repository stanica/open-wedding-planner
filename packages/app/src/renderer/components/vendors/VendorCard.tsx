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
  };
  onClick: () => void;
}

export function VendorCard({ vendor, onClick }: VendorCardProps) {
  return (
    <Card onClick={onClick}>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
