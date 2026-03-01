import { useRequest } from "../../hooks/useRequest";
import { Card, CardContent } from "../common/Card";
import { Skeleton } from "../common/Skeleton";

interface ResearchNote {
  id: number;
  content: string;
  source: string | null;
  createdAt: string;
}

export function VendorNotes({ vendorId }: { vendorId: number }) {
  const { data: vendor } = useRequest<{ notes: string | null }>("vendors.get", {
    id: vendorId,
  });

  if (!vendor?.notes) {
    return <p className="text-sm text-on-surface-tertiary py-4">No notes yet</p>;
  }

  return (
    <Card>
      <CardContent>
        <p className="text-sm text-on-surface-secondary whitespace-pre-wrap">{vendor.notes}</p>
      </CardContent>
    </Card>
  );
}
