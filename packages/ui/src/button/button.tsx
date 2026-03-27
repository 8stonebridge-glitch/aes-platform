import * as React from "react";

export interface ButtonProps {
  children: React.ReactNode;
  variant?: "default" | "primary" | "secondary" | "destructive" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export function Button({
  children,
  variant = "default",
  size = "md",
  disabled = false,
  loading = false,
  type = "button",
  onClick,
  className = "",
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`aes-btn aes-btn-${variant} aes-btn-${size} ${className}`.trim()}
      disabled={disabled || loading}
      onClick={onClick}
      aria-busy={loading}
    >
      {loading ? <span className="aes-btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
