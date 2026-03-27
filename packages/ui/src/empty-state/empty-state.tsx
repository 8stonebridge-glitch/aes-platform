import * as React from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`aes-empty-state ${className}`.trim()} role="status">
      {icon ? <div className="aes-empty-state-icon">{icon}</div> : null}
      <h3 className="aes-empty-state-title">{title}</h3>
      {description ? <p className="aes-empty-state-description">{description}</p> : null}
      {action ? <div className="aes-empty-state-action">{action}</div> : null}
    </div>
  );
}
