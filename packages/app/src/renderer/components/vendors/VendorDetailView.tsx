import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useVendor } from "../../hooks/useVendors";
import { useMutation } from "../../hooks/useRequest";
import { VendorHeader } from "./VendorHeader";
import { VendorAttributes } from "./VendorAttributes";
import { VendorQuotes } from "./VendorQuotes";
import { VendorComms } from "./VendorComms";
import { VendorNotes } from "./VendorNotes";
import { VendorPhotos } from "./VendorPhotos";
import { Skeleton } from "../common/Skeleton";
import { ConfirmDialog } from "../common/ConfirmDialog";

const TABS = ["Overview", "Photos", "Quotes", "Communications", "Notes"] as const;
type Tab = (typeof TABS)[number];

export function VendorDetailView() {
  const { id } = useParams<{ id: string }>();
  const vendorId = Number(id);
  const navigate = useNavigate();
  const { data: vendor, loading, refetch } = useVendor(vendorId);
  const { mutate: updateVendor } = useMutation("vendors.update");
  const { mutate: deleteVendor, loading: deleting } = useMutation<{ id: number }>("vendors.delete");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleStatusChange(status: string) {
    await updateVendor({ id: vendorId, status });
    refetch();
  }

  async function handleDelete() {
    await deleteVendor({ id: vendorId });
    navigate("/vendors");
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Vendor not found
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <VendorHeader
        vendor={vendor}
        onStatusChange={handleStatusChange}
        onDelete={() => setShowDeleteConfirm(true)}
      />

      <div className="border-b border-white/10">
        <div className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-white border-b-2 border-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === "Overview" && (
          <div className="space-y-4">
            <VendorAttributes vendorId={vendorId} />
            <VendorQuotes vendorId={vendorId} />
          </div>
        )}
        {activeTab === "Photos" && <VendorPhotos vendorId={vendorId} />}
        {activeTab === "Quotes" && <VendorQuotes vendorId={vendorId} />}
        {activeTab === "Communications" && <VendorComms vendorId={vendorId} />}
        {activeTab === "Notes" && <VendorNotes vendorId={vendorId} />}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={`Delete ${vendor.name}?`}
        message="This will permanently delete this vendor and all related quotes, communications, and research notes."
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deleting}
      />
    </div>
  );
}
