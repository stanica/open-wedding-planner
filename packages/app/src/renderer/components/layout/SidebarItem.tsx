import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";

interface SidebarItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
}

export function SidebarItem({ to, icon: Icon, label, collapsed }: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? "text-on-surface"
            : "text-on-surface-secondary hover:text-on-surface hover:bg-surface-hover"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-lg bg-surface-active"
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            />
          )}
          <Icon className="relative z-10 h-5 w-5 shrink-0" />
          {!collapsed && (
            <span className="relative z-10 truncate">{label}</span>
          )}
        </>
      )}
    </NavLink>
  );
}
