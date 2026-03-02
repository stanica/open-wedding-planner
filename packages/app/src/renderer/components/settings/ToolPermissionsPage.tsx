import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ToolPermissions } from "./ToolPermissions";

export function ToolPermissionsPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <button
        onClick={() => navigate("/settings?tab=Advanced")}
        className="mb-6 flex items-center gap-2 text-sm text-on-surface-secondary transition-colors hover:text-on-surface"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </button>
      <ToolPermissions />
    </div>
  );
}
