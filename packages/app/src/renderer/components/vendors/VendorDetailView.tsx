import { useState } from "react";
import { useParams } from "react-router-dom";
import { useVendor } from "../../hooks/useVendors";
import { useMutation } from "../../hooks/useRequest";
import { VendorHeader } from "./VendorHeader";
import { VendorAttributes } from "./VendorAttributes";
import { VendorQuotes } from "./VendorQuotes";
import { VendorComms } from "./VendorComms";
import { VendorNotes } from "./VendorNotes";
import { Skeleton } from "../common/Skeleton";

const TABS = ["Overview", "Quotes", "Communications", "Notes"] as const;
type Tab = (typeof TABS)[number];

export function VendorDetailView() {
  const { id } = useParams<{ id: string }>();
  const vendorId = Number(id);
  const { data: vendor, loading, refetch } = useVendor(vendorId);
  const { mutate: updateVendor } = useMutation("vendors.update");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  async function handleStatusChange(status: string) {
    await updateVendor({ id: vendorId, status });
    refetch();
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
      <VendorHeader vendor={vendor} onStatusChange={handleStatusChange} />

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
        {activeTab === "Quotes" && <VendorQuotes vendorId={vendorId} />}
        {activeTab === "Communications" && <VendorComms vendorId={vendorId} />}
        {activeTab === "Notes" && <VendorNotes vendorId={vendorId} />}
      </div>
    </div>
  );
}
