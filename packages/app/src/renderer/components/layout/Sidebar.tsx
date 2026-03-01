import {
  LayoutDashboard,
  Search,
  Store,
  MessageCircle,
  Phone,
  Inbox,
  Calendar,
  DollarSign,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { SidebarItem } from "./SidebarItem";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/research", icon: Search, label: "Research" },
  { to: "/vendors", icon: Store, label: "Vendors" },
  { to: "/whatsapp", icon: MessageCircle, label: "WhatsApp" },
  { to: "/calls", icon: Phone, label: "Calls" },
  { to: "/inbox", icon: Inbox, label: "Inbox" },
  { to: "/timeline", icon: Calendar, label: "Timeline" },
  { to: "/budget", icon: DollarSign, label: "Budget" },
] as const;

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`flex h-full flex-col border-r border-border bg-surface transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-4">
        {!collapsed && (
          <span className="text-sm font-semibold text-on-surface truncate">
            Open Wedding Planner
          </span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-on-surface-secondary hover:text-on-surface p-1 rounded hover:bg-surface-hover"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <SidebarItem key={item.to} collapsed={collapsed} {...item} />
        ))}
      </nav>

      <div className="border-t border-border px-2 py-3 space-y-1">
<SidebarItem
          to="/settings"
          icon={Settings}
          label="Settings"
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
