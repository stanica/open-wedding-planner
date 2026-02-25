import { MessageSquare } from "lucide-react";
import { EmptyState } from "../common/EmptyState";

export function VendorComms({ vendorId: _vendorId }: { vendorId: number }) {
  return (
    <EmptyState
      icon={MessageSquare}
      title="Communications coming soon"
      description="WhatsApp and email integration will appear here"
    />
  );
}
