import * as React from "react";
import { type WorkflowStatus } from "./status-badge.js";

export interface WorkflowStep {
  id: string;
  label: string;
  status: WorkflowStatus;
  description?: string;
}

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  currentStepId: string;
  className?: string;
}

export function WorkflowStepper({ steps, currentStepId, className = "" }: WorkflowStepperProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <div className={`aes-workflow-stepper ${className}`.trim()} role="list" aria-label="Workflow steps">
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStepId;
        const isPast = index < currentIndex;
        const state = isCurrent ? "current" : isPast ? "completed" : "upcoming";

        return (
          <div
            key={step.id}
            className={`aes-workflow-step aes-workflow-step-${state}`}
            role="listitem"
            aria-current={isCurrent ? "step" : undefined}
          >
            <div className="aes-workflow-step-indicator">
              <span className="aes-workflow-step-number">{index + 1}</span>
            </div>
            <div className="aes-workflow-step-content">
              <span className="aes-workflow-step-label">{step.label}</span>
              {step.description ? (
                <span className="aes-workflow-step-desc">{step.description}</span>
              ) : null}
            </div>
            {index < steps.length - 1 ? <div className="aes-workflow-step-connector" /> : null}
          </div>
        );
      })}
    </div>
  );
}
