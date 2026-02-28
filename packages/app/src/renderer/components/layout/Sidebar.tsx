import {
  LayoutDashboard,
  Search,
  Store,
  MessageCircle,
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
  { to: "/inbox", icon: Inbox, label: "Inbox" },
  { to: "/timeline", icon: Calendar, label: "Timeline" },
  { to: "/budget", icon: DollarSign, label: "Budget" },
] as const;

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`flex h-full flex-col border-r border-white/10 bg-gray-950 transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-4">
        {!collapsed && (
          <span className="text-sm font-semibold text-white truncate">
            Wedding Planner
          </span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-gray-400 hover:text-white p-1 rounded hover:bg-white/5"
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

      <div className="border-t border-white/10 px-2 py-3 space-y-1">
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
