import * as React from "react";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  visible: boolean;
  onDismiss?: () => void;
  duration?: number;
}

export function Toast({ message, variant = "info", visible, onDismiss, duration = 5000 }: ToastProps) {
  React.useEffect(() => {
    if (!visible || !onDismiss || duration <= 0) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [visible, onDismiss, duration]);

  if (!visible) return null;

  return (
    <div className={`aes-toast aes-toast-${variant}`} role="alert" aria-live="polite">
      <span className="aes-toast-message">{message}</span>
      {onDismiss ? (
        <button className="aes-toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
          &times;
        </button>
      ) : null}
    </div>
  );
}
