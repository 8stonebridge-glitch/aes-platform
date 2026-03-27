import * as React from "react";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "neutral";
  size?: "sm" | "md";
  className?: string;
}

export function Badge({ children, variant = "default", size = "md", className = "" }: BadgeProps) {
  return (
    <span className={`aes-badge aes-badge-${variant} aes-badge-${size} ${className}`.trim()}>
      {children}
    </span>
  );
}
