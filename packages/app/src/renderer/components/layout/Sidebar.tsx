import {
  LayoutDashboard,
  Search,
  Store,
  Send,
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
  { to: "/outreach", icon: Send, label: "Outreach" },
  { to: "/inbox", icon: Inbox, label: "Inbox" },
  { to: "/timeline", icon: Calendar, label: "Timeline" },
  { to: "/budget", icon: DollarSign, label: "Budget" },
] as const;

const CHANNEL_STATUS = [
  { label: "WhatsApp", connected: false },
  { label: "Gmail", connected: false },
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
        {!collapsed && (
          <div className="px-3 pb-2">
            <span className="text-xs font-medium uppercase text-gray-500">
              Channels
            </span>
            <div className="mt-1 space-y-1">
              {CHANNEL_STATUS.map((ch) => (
                <div
                  key={ch.label}
                  className="flex items-center gap-2 text-xs text-gray-400"
                >
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${
                      ch.connected ? "bg-green-500" : "bg-gray-600"
                    }`}
                  />
                  {ch.label}
                </div>
              ))}
            </div>
          </div>
        )}
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
