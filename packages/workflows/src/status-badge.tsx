import * as React from "react";

export type WorkflowStatus = "draft" | "pending" | "in_progress" | "review" | "approved" | "rejected" | "completed" | "cancelled";

export interface StatusBadgeProps {
  status: WorkflowStatus;
  label?: string;
  className?: string;
}

const STATUS_VARIANTS: Record<WorkflowStatus, string> = {
  draft: "neutral",
  pending: "warning",
  in_progress: "info",
  review: "info",
  approved: "success",
  rejected: "error",
  completed: "success",
  cancelled: "neutral",
};

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  in_progress: "In Progress",
  review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  const variant = STATUS_VARIANTS[status];
  const displayLabel = label ?? STATUS_LABELS[status];

  return (
    <span className={`aes-badge aes-badge-${variant} ${className}`.trim()}>
      {displayLabel}
    </span>
  );
}
