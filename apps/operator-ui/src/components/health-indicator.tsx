"use client";

import type { HealthResponse } from "@/lib/api";

interface HealthIndicatorProps {
  health: HealthResponse | null;
  error: string | null;
}

export function HealthIndicator({ health, error }: HealthIndicatorProps) {
  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="h-2 w-2 rounded-full bg-[var(--red)]" />
        <span className="text-[var(--text-muted)]">Offline</span>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--text-muted)]" />
        <span className="text-[var(--text-muted)]">Connecting...</span>
      </div>
    );
  }

  const isOk = health.status === "ok";

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`h-2 w-2 rounded-full ${isOk ? "bg-[var(--green)]" : "bg-[var(--amber)]"}`}
      />
      <span className="text-[var(--text-muted)]">
        {health.total_records != null
          ? `${Number(health.total_records).toLocaleString()} records`
          : health.status}
      </span>
      {(health.pending_escalations ?? 0) > 0 && (
        <span className="rounded-full bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--amber)]">
          {health.pending_escalations} pending
        </span>
      )}
    </div>
  );
}
