import { ArrowLeft, MapPin, Globe, Mail, Phone, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { VendorStatusBadge } from "./VendorStatusBadge";
import { VendorActions } from "./VendorActions";

interface Vendor {
  id: number;
  name: string;
  location: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  description: string | null;
}

export function VendorHeader({
  vendor,
  onStatusChange,
  onDelete,
}: {
  vendor: Vendor;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate("/vendors")}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to vendors
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{vendor.name}</h1>
            <VendorStatusBadge status={vendor.status} />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            {vendor.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {vendor.location}
              </span>
            )}
            {vendor.websiteUrl && (
              <span className="flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                {vendor.websiteUrl}
              </span>
            )}
            {vendor.contactEmail && (
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {vendor.contactEmail}
              </span>
            )}
            {vendor.contactPhone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {vendor.contactPhone}
              </span>
            )}
          </div>

          {vendor.description && (
            <p className="text-sm text-gray-400 max-w-2xl">{vendor.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <VendorActions vendor={vendor} onStatusChange={onStatusChange} />
        </div>
      </div>
    </div>
  );
}
