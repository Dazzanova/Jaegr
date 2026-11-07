import React from "react";
import clsx from "clsx";

export type BadgeVariant =
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "purple"
  | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  const styles: Record<BadgeVariant, string> = {
    success: "bg-emerald-950/80 text-emerald-400 border-emerald-800/60",
    danger: "bg-rose-950/80 text-rose-400 border-rose-800/60",
    warning: "bg-amber-950/80 text-amber-400 border-amber-800/60",
    info: "bg-sky-950/80 text-sky-400 border-sky-800/60",
    purple: "bg-purple-950/80 text-purple-300 border-purple-800/60",
    neutral: "bg-slate-800/80 text-slate-300 border-slate-700/60"
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border font-mono tracking-wide",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
