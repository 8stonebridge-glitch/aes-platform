import * as React from "react";

export interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingState({ message = "Loading...", size = "md", className = "" }: LoadingStateProps) {
  return (
    <div className={`aes-loading-state aes-loading-${size} ${className}`.trim()} role="status" aria-live="polite">
      <div className="aes-loading-spinner" aria-hidden="true" />
      <p className="aes-loading-message">{message}</p>
    </div>
  );
}
