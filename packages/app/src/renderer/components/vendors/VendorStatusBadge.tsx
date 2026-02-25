import { Badge } from "../common/Badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "info" }> = {
  researched: { label: "Researched", variant: "info" },
  contacted: { label: "Contacted", variant: "warning" },
  quoted: { label: "Quoted", variant: "default" },
  booked: { label: "Booked", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
};

export function VendorStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
