import * as React from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="aes-dialog"
      onClose={onClose}
      aria-labelledby="aes-dialog-title"
      aria-describedby={description ? "aes-dialog-desc" : undefined}
    >
      <div className="aes-dialog-header">
        <h2 id="aes-dialog-title" className="aes-dialog-title">{title}</h2>
        <button className="aes-dialog-close" onClick={onClose} aria-label="Close dialog">
          &times;
        </button>
      </div>
      {description ? <p id="aes-dialog-desc" className="aes-dialog-description">{description}</p> : null}
      <div className="aes-dialog-body">{children}</div>
      {footer ? <div className="aes-dialog-footer">{footer}</div> : null}
    </dialog>
  );
}
