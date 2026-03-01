import { useRequest } from "../../hooks/useRequest";
import { Card, CardHeader, CardContent } from "../common/Card";

interface VendorAttribute {
  id: number;
  key: string;
  value: string;
  type: string;
}

export function VendorAttributes({ vendorId }: { vendorId: number }) {
  const { data: attributes, loading } = useRequest<VendorAttribute[]>(
    "vendor-attributes.list",
    { vendorId },
  );

  if (loading) return null;
  if (!attributes || attributes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">Attributes</h3>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {attributes.map((attr) => (
            <div key={attr.id}>
              <dt className="text-on-surface-tertiary">{attr.key}</dt>
              <dd className="text-on-surface">{attr.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
