import { useState } from "react";
import { Card, CardHeader, CardContent } from "../common/Card";
import { Badge } from "../common/Badge";
import { ApprovalActions } from "./ApprovalActions";
import { Mail, MessageCircle, Pencil } from "lucide-react";

interface Draft {
  id: number;
  vendorName: string | null;
  channel: string;
  subject: string | null;
  bodyOriginal: string;
  bodyTranslated: string | null;
  language: string | null;
}

interface DraftCardProps {
  draft: Draft;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (body: string) => void;
  onApprove: () => void;
  onReject: () => void;
}

export function DraftCard({
  draft,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onApprove,
  onReject,
}: DraftCardProps) {
  const [editBody, setEditBody] = useState(draft.bodyOriginal);
  const ChannelIcon = draft.channel === "email" ? Mail : MessageCircle;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChannelIcon className="h-4 w-4 text-gray-400" />
          <span className="font-medium">{draft.vendorName ?? "Unknown Vendor"}</span>
          <Badge variant={draft.channel === "email" ? "info" : "success"}>
            {draft.channel}
          </Badge>
          {draft.language && draft.language !== "en" && (
            <Badge variant="warning">{draft.language}</Badge>
          )}
        </div>
        {draft.subject && (
          <span className="text-sm text-gray-400">{draft.subject}</span>
        )}
      </CardHeader>

      <CardContent>
        <div className={draft.bodyTranslated ? "grid grid-cols-2 gap-4" : ""}>
          {/* Original message */}
          <div>
            {draft.bodyTranslated && (
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                {draft.language ?? "Original"}
              </p>
            )}
            {editing ? (
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none min-h-[200px] resize-y"
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
                {draft.bodyOriginal}
              </div>
            )}
          </div>

          {/* English translation (side-by-side) */}
          {draft.bodyTranslated && (
            <div>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                English
              </p>
              <div className="whitespace-pre-wrap text-sm text-gray-400 leading-relaxed">
                {draft.bodyTranslated}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          {editing ? (
            <div className="flex gap-2">
              <button
                onClick={() => onSaveEdit(editBody)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onStartEdit}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}

          {!editing && (
            <ApprovalActions onApprove={onApprove} onReject={onReject} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
