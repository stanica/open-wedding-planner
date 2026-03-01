import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmWord?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  title,
  message,
  confirmWord = "DELETE",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDeleteDialogProps) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) {
      setTyped("");
    }
  }, [open]);

  const confirmed = typed === confirmWord;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="mx-4 w-full max-w-sm rounded-xl border border-border bg-surface-dropdown p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
                <p className="text-sm text-on-surface-secondary">{message}</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-on-surface-secondary">
                Type{" "}
                <span className="font-mono font-semibold text-on-surface-secondary">
                  {confirmWord}
                </span>{" "}
                to confirm
              </label>
              <input
                type="text"
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder-placeholder focus:border-red-500 focus:outline-none"
                disabled={loading}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={onCancel}
                disabled={loading}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-on-surface-secondary hover:text-on-surface transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={!confirmed || loading}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
