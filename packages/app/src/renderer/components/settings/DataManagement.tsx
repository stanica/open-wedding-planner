import { useState } from "react";
import { Trash2 } from "lucide-react";
import { wsClient } from "../../lib/ws-client";
import { ConfirmDeleteDialog } from "../common/ConfirmDeleteDialog";

interface ClearGroup {
  key: string;
  label: string;
  description: string;
  method: string;
}

const CLEAR_GROUPS: ClearGroup[] = [
  {
    key: "vendors",
    label: "Vendors",
    description: "Remove all vendors, their photos, quotes, and attributes",
    method: "data.clear-vendors",
  },
  {
    key: "research",
    label: "Research",
    description: "Remove all research conversations and notes",
    method: "data.clear-research",
  },
  {
    key: "communications",
    label: "Communications",
    description: "Remove all email and WhatsApp message history",
    method: "data.clear-communications",
  },
  {
    key: "tasks",
    label: "Tasks & Budget",
    description: "Remove all tasks and budget entries",
    method: "data.clear-tasks",
  },
];

export function DataManagement() {
  const [clearing, setClearing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleClear() {
    if (!clearing) return;
    const group = CLEAR_GROUPS.find((g) => g.key === clearing);
    if (!group) return;

    setLoading(true);
    try {
      await wsClient.request(group.method);
      setSuccess(group.key);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Failed to clear data:", err);
    } finally {
      setLoading(false);
      setClearing(null);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Data Management</h2>
      <p className="text-sm text-gray-400 mb-4">
        Clear accumulated data while keeping your settings intact.
      </p>

      <div className="space-y-3">
        {CLEAR_GROUPS.map((group) => (
          <div
            key={group.key}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-white">{group.label}</p>
              <p className="text-xs text-gray-400">{group.description}</p>
            </div>
            {success === group.key ? (
              <span className="text-xs text-green-400">Cleared</span>
            ) : (
              <button
                onClick={() => setClearing(group.key)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-600/20 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        ))}
      </div>

      <ConfirmDeleteDialog
        open={clearing !== null}
        title={`Clear ${CLEAR_GROUPS.find((g) => g.key === clearing)?.label ?? ""} Data`}
        message={`This will permanently delete all ${CLEAR_GROUPS.find((g) => g.key === clearing)?.label.toLowerCase() ?? ""} data. This cannot be undone.`}
        onConfirm={handleClear}
        onCancel={() => setClearing(null)}
        loading={loading}
      />
    </div>
  );
}
