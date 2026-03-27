import * as React from "react";

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  className = "",
}: ErrorStateProps) {
  return (
    <div className={`aes-error-state ${className}`.trim()} role="alert">
      <h3 className="aes-error-state-title">{title}</h3>
      <p className="aes-error-state-message">{message}</p>
      {onRetry ? (
        <button className="aes-btn aes-btn-primary aes-btn-sm" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
