import { Shield } from "lucide-react";

interface PermissionRequestCardProps {
  toolName: string;
  toolDescription: string;
  context?: string;
  onDecision: (decision: "allow" | "always-allow" | "deny") => void;
  resolved?: string | null;
}

export function PermissionRequestCard({
  toolName,
  toolDescription,
  context,
  onDecision,
  resolved,
}: PermissionRequestCardProps) {
  if (resolved) {
    const label = resolved === "deny" ? "Denied" : "Allowed";
    const color = resolved === "deny" ? "text-red-400" : "text-emerald-400";
    return (
      <div className="flex items-center gap-2 my-2 px-3 py-2 rounded-lg border border-border bg-surface-subtle text-xs">
        <Shield className="h-3.5 w-3.5 text-on-surface-tertiary" />
        <span className="text-on-surface-secondary">{toolName}</span>
        <span className={color}>{label}</span>
      </div>
    );
  }

  return (
    <div className="my-2 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-medium text-amber-300">Permission Required</span>
      </div>
      <p className="text-sm text-on-surface font-medium">{toolName}</p>
      <p className="text-xs text-on-surface-secondary mt-0.5">{toolDescription}</p>
      {context && (
        <pre className="mt-2 px-3 py-2 text-xs text-on-surface-secondary bg-black/30 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
          {context}
        </pre>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onDecision("allow")}
          className="px-3 py-1.5 text-xs rounded-md bg-surface-active text-on-surface hover:bg-surface-active transition-colors"
        >
          Allow once
        </button>
        <button
          onClick={() => onDecision("always-allow")}
          className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
        >
          Always allow
        </button>
        <button
          onClick={() => onDecision("deny")}
          className="px-3 py-1.5 text-xs rounded-md bg-surface-elevated text-on-surface-secondary hover:bg-surface-active transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
