const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  researched: { label: "Researched", bg: "bg-blue-400/15", text: "text-blue-400" },
  contacted: { label: "Contacted", bg: "bg-amber-400/15", text: "text-amber-400" },
  quoted: { label: "Quoted", bg: "bg-gray-400/15", text: "text-gray-400" },
  booked: { label: "Booked", bg: "bg-emerald-400/15", text: "text-emerald-400" },
  rejected: { label: "Rejected", bg: "bg-red-400/15", text: "text-red-400" },
};

export function VendorStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, bg: "bg-gray-400/15", text: "text-gray-400" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
