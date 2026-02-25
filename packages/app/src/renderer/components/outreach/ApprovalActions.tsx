import { Check, X } from "lucide-react";

interface ApprovalActionsProps {
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalActions({ onApprove, onReject }: ApprovalActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onReject}
        className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </button>
      <button
        onClick={onApprove}
        className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
      >
        <Check className="h-3.5 w-3.5" />
        Approve & Send
      </button>
    </div>
  );
}
