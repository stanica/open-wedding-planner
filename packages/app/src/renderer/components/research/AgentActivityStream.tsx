import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, Search, Plus } from "lucide-react";

interface ActivityItem {
  id: string;
  action: string;
  detail?: string;
  timestamp: number;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  starting: <Search className="h-3.5 w-3.5 text-blue-400" />,
  searching: <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />,
  found: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  "creating-vendor": <Plus className="h-3.5 w-3.5 text-purple-400" />,
  complete: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
  warning: <AlertCircle className="h-3.5 w-3.5 text-yellow-400" />,
};

interface AgentActivityStreamProps {
  activities: ActivityItem[];
}

export function AgentActivityStream({ activities }: AgentActivityStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities.length]);

  if (activities.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-4 py-2 border-b border-white/10">
        <span className="text-xs font-medium uppercase text-gray-500">
          Agent Activity
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto p-2 space-y-1">
        <AnimatePresence>
          {activities.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5"
            >
              <span className="mt-0.5 shrink-0">
                {ACTION_ICONS[item.action] ?? (
                  <Loader2 className="h-3.5 w-3.5 text-gray-500 animate-spin" />
                )}
              </span>
              <div className="min-w-0">
                {item.detail && (
                  <p className="text-sm text-gray-300">{item.detail}</p>
                )}
                {!item.detail && (
                  <p className="text-sm text-gray-400 capitalize">{item.action}</p>
                )}
              </div>
              <span className="ml-auto shrink-0 text-xs text-gray-600">
                {new Date(item.timestamp).toLocaleTimeString()}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export type { ActivityItem };
