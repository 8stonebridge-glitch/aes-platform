"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHealth, useOrchestratorHealth } from "@/lib/hooks";
import { HealthIndicator } from "./health-indicator";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Builds",
    icon: (active: boolean) => (
      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
        <circle cx="7" cy="7" r="3" fill={active ? "#D97706" : "#A8A29E"} />
      </svg>
    ),
  },
  {
    href: "/graph",
    label: "Graph",
    icon: (active: boolean) => (
      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
        <circle cx="7" cy="7" r="3" stroke={active ? "#1C1917" : "#A8A29E"} strokeWidth="1.5" fill="none" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (active: boolean) => (
      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
        <path d="M7 3v4l2.5 1.5" stroke={active ? "#1C1917" : "#A8A29E"} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <circle cx="7" cy="7" r="4.5" stroke={active ? "#1C1917" : "#A8A29E"} strokeWidth="1.5" fill="none" />
      </svg>
    ),
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { data: health, error: healthError } = useHealth();
  const { data: orchHealth } = useOrchestratorHealth();
  const orchConnected = !!orchHealth;

  const isAppsActive = pathname.startsWith("/apps");

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]"
      style={{ width: 220 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--text-primary)] text-xs font-bold text-white">
            A
          </div>
          <span className="text-[15px] font-semibold tracking-tight">AES</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4">
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = !isAppsActive && pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                  isActive
                    ? "bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                }`}
              >
                {item.icon(isActive)}
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Apps link */}
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <Link
            href="/apps"
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
              isAppsActive
                ? "bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
              <rect
                x="3" y="3" width="8" height="8" rx="2"
                stroke={isAppsActive ? "#1C1917" : "#A8A29E"}
                strokeWidth="1.5"
                fill={isAppsActive ? "#1C1917" : "none"}
              />
            </svg>
            Apps
          </Link>
        </div>
      </nav>

      {/* Health at bottom */}
      <div className="border-t border-[var(--border)] px-6 py-4 space-y-2">
        <HealthIndicator health={health} error={healthError} />
        {orchConnected && (
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] text-[var(--text-muted)]">
              Orchestrator {orchHealth?.version ?? "?"}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
