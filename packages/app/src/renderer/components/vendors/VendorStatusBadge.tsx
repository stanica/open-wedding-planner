const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  researched: { label: "Researched", color: "bg-blue-400" },
  contacted: { label: "Contacted", color: "bg-amber-400" },
  quoted: { label: "Quoted", color: "bg-gray-400" },
  booked: { label: "Booked", color: "bg-emerald-400" },
  rejected: { label: "Rejected", color: "bg-red-400" },
};

export function VendorStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-400" };
  return (
    <span className="shrink-0" title={config.label}>
      <span className={`inline-block h-2 w-2 rounded-full ${config.color}`} />
    </span>
  );
}
