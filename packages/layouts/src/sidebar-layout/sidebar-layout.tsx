import * as React from "react";

export interface SidebarLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  header?: React.ReactNode;
  sidebarWidth?: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

export function SidebarLayout({
  sidebar,
  children,
  header,
  sidebarWidth = 260,
  collapsible = true,
  defaultCollapsed = false,
  className = "",
}: SidebarLayoutProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  return (
    <div className={`aes-layout-sidebar ${className}`.trim()}>
      {header ? <header className="aes-layout-header">{header}</header> : null}
      <div className="aes-layout-body">
        <aside
          className={`aes-layout-aside ${collapsed ? "aes-layout-aside-collapsed" : ""}`}
          style={{ width: collapsed ? 64 : sidebarWidth }}
        >
          {collapsible ? (
            <button
              className="aes-layout-collapse-btn"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? "\u25B6" : "\u25C0"}
            </button>
          ) : null}
          <nav className="aes-layout-nav">{sidebar}</nav>
        </aside>
        <main className="aes-layout-main">{children}</main>
      </div>
    </div>
  );
}
