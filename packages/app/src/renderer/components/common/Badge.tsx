import { motion } from "framer-motion";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-gray-700 text-gray-300",
  success: "bg-green-900/50 text-green-400",
  warning: "bg-yellow-900/50 text-yellow-400",
  danger: "bg-red-900/50 text-red-400",
  info: "bg-blue-900/50 text-blue-400",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <motion.span
      layout
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}
      animate={{ backgroundColor: undefined }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.span>
  );
}
