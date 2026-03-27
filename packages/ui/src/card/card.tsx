import * as React from "react";

export interface CardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
}

export function Card({ children, title, description, footer, padding = "md", className = "" }: CardProps) {
  return (
    <div className={`aes-card aes-card-pad-${padding} ${className}`.trim()}>
      {title || description ? (
        <div className="aes-card-header">
          {title ? <h3 className="aes-card-title">{title}</h3> : null}
          {description ? <p className="aes-card-description">{description}</p> : null}
        </div>
      ) : null}
      <div className="aes-card-body">{children}</div>
      {footer ? <div className="aes-card-footer">{footer}</div> : null}
    </div>
  );
}
