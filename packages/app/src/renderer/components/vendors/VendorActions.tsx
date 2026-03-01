import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const STATUSES = ["researched", "contacted", "quoted", "booked", "rejected"] as const;

interface VendorActionsProps {
  vendor: { id: number; status: string };
  onStatusChange: (status: string) => void;
}

export function VendorActions({ vendor, onStatusChange }: VendorActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-on-surface hover:bg-surface-active transition-colors"
      >
        Change Status
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-border bg-surface-dropdown py-1 shadow-xl"
          >
            {STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => {
                  onStatusChange(status);
                  setOpen(false);
                }}
                disabled={status === vendor.status}
                className="w-full px-3 py-1.5 text-left text-sm capitalize text-on-surface-secondary hover:bg-surface-hover disabled:text-on-surface-faint disabled:cursor-default"
              >
                {status}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
