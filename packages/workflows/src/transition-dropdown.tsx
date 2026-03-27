import * as React from "react";
import { type WorkflowStatus } from "./status-badge.js";

export interface Transition {
  from: WorkflowStatus;
  to: WorkflowStatus;
  label: string;
  requiresConfirmation?: boolean;
}

export interface TransitionDropdownProps {
  currentStatus: WorkflowStatus;
  transitions: Transition[];
  onTransition: (to: WorkflowStatus) => void;
  disabled?: boolean;
  className?: string;
}

export function TransitionDropdown({
  currentStatus,
  transitions,
  onTransition,
  disabled = false,
  className = "",
}: TransitionDropdownProps) {
  const available = transitions.filter((t) => t.from === currentStatus);

  if (available.length === 0) return null;

  return (
    <select
      className={`aes-transition-dropdown ${className}`.trim()}
      value=""
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) {
          onTransition(e.target.value as WorkflowStatus);
        }
      }}
      aria-label="Transition status"
    >
      <option value="" disabled>
        Move to...
      </option>
      {available.map((t) => (
        <option key={t.to} value={t.to}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
