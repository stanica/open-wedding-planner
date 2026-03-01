import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="mb-4 h-12 w-12 text-on-surface-faint" />
      <h3 className="text-lg font-medium text-on-surface-secondary">{title}</h3>
      {description && <p className="mt-1 text-sm text-on-surface-tertiary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
