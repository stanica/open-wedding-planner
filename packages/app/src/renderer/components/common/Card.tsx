import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-white/10 bg-white/5 ${
        interactive ? "cursor-pointer hover:border-white/20 hover:bg-white/[0.07] transition-colors" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-3 border-b border-white/10 ${className}`}>{children}</div>;
}

export function CardContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-3 ${className}`}>{children}</div>;
}
