"use client";

import { motion } from "motion/react";
import type { OrchestratorEvent } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  research: "bg-[var(--blue)]",
  plan: "bg-[var(--accent)]",
  gate: "bg-[var(--amber)]",
  build: "bg-[var(--accent)]",
  verify: "bg-[var(--green)]",
  error: "bg-[var(--red)]",
  info: "bg-[var(--text-muted)]",
};

interface ActivityTimelineProps {
  events: OrchestratorEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-[var(--text-muted)]">
        No activity yet
      </div>
    );
  }

  // Show newest first, limit to 50
  const display = [...events].reverse().slice(0, 50);

  return (
    <div className="space-y-0">
      {display.map((event, i) => (
        <motion.div
          key={`${event.timestamp}-${i}`}
          initial={i === 0 ? { opacity: 0, x: -8 } : false}
          animate={{ opacity: 1, x: 0 }}
          className="flex gap-3 py-2"
        >
          {/* Timeline dot + line */}
          <div className="flex flex-col items-center">
            <div
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TYPE_COLORS[event.type] ?? TYPE_COLORS.info}`}
            />
            {i < display.length - 1 && (
              <div className="mt-1 w-px flex-1 bg-[var(--border)]" />
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 pb-2">
            <p className="text-xs leading-relaxed text-[var(--text-primary)]">
              {event.message}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              <span>{formatTime(event.timestamp)}</span>
              {event.feature_id && (
                <span className="rounded bg-[var(--bg-stage)] px-1.5 py-0.5">
                  {event.feature_id}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}
