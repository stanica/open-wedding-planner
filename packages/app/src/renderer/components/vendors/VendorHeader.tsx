import { useState } from "react";
import { ArrowLeft, MapPin, Globe, Mail, Phone, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { VendorStatusBadge } from "./VendorStatusBadge";
import { VendorActions } from "./VendorActions";
import { EmailComposeModal } from "./EmailComposeModal";
import { useVendorImages } from "../../hooks/useVendorImages";
import { wsClient } from "../../lib/ws-client";

interface Vendor {
  id: number;
  name: string;
  location: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  description: string | null;
  imageUrl: string | null;
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
  const [imgError, setImgError] = useState(false);
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const { data: galleryImages } = useVendorImages(vendor.id);
  const firstGalleryImage = galleryImages?.[0];
  const thumbnailSrc = firstGalleryImage
    ? `http://localhost:${wsClient.gatewayPort}/images/${vendor.id}/${firstGalleryImage.filename}`
    : vendor.imageUrl;
  const showImage = thumbnailSrc && !imgError;

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate("/vendors")}
        className="flex items-center gap-1 text-sm text-on-surface-secondary hover:text-on-surface transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to vendors
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          {showImage && (
            <img
              src={thumbnailSrc!}
              alt=""
              onError={() => setImgError(true)}
              className="h-20 w-20 rounded-lg object-cover shrink-0"
            />
          )}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{vendor.name}</h1>
              <VendorStatusBadge status={vendor.status} />
            </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-on-surface-secondary">
            {vendor.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {vendor.location}
              </span>
            )}
            {vendor.websiteUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const url = vendor.websiteUrl!.startsWith("http")
                    ? vendor.websiteUrl!
                    : `https://${vendor.websiteUrl}`;
                  if (window.electronAPI) {
                    window.electronAPI.openExternal(url);
                  } else {
                    window.open(url, "_blank");
                  }
                }}
                className="flex items-center gap-1 hover:text-blue-400 transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
                {vendor.websiteUrl}
              </button>
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
            <p className="text-sm text-on-surface-secondary max-w-2xl">{vendor.description}</p>
          )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {vendor.contactEmail && (
            <button
              onClick={() => setShowEmailCompose(true)}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              Email
            </button>
          )}
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

      {showEmailCompose && (
        <EmailComposeModal
          vendor={vendor}
          onClose={() => setShowEmailCompose(false)}
        />
      )}
    </div>
  );
}
