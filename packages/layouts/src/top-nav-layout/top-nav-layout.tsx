import * as React from "react";

export interface TopNavLayoutProps {
  nav: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function TopNavLayout({ nav, children, footer, className = "" }: TopNavLayoutProps) {
  return (
    <div className={`aes-layout-topnav ${className}`.trim()}>
      <header className="aes-layout-topnav-header">
        <nav className="aes-layout-topnav-nav">{nav}</nav>
      </header>
      <main className="aes-layout-topnav-main">{children}</main>
      {footer ? <footer className="aes-layout-topnav-footer">{footer}</footer> : null}
    </div>
  );
}
