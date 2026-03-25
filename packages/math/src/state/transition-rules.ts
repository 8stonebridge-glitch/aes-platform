import type { ArtifactState } from "./artifact-states.js";

export interface TransitionPrerequisite {
  min_confidence?: number;
  min_dimension?: { dimension: string; min: number };
  no_vetoes?: boolean;
  no_critical_violations?: boolean;
  dependency_completeness_min?: number;
  scope_drift_max?: number;
  required_validators_passed?: string[];
  human_approval_required?: boolean;
}

export interface TransitionRule {
  from: ArtifactState;
  to: ArtifactState;
  prerequisites: TransitionPrerequisite;
  description: string;
}

export const TRANSITION_RULES: TransitionRule[] = [
  {
    from: "raw",
    to: "evidence_gathered",
    prerequisites: { min_confidence: 0.1 },
    description: "Raw artifact has some evidence attached",
  },
  {
    from: "evidence_gathered",
    to: "derived",
    prerequisites: { min_confidence: 0.3, no_critical_violations: true },
    description: "Evidence sufficient to derive a candidate spec",
  },
  {
    from: "derived",
    to: "validated",
    prerequisites: {
      min_confidence: 0.5,
      no_vetoes: true,
      required_validators_passed: ["structure", "dependency_integrity"],
    },
    description: "Derived spec passes structural validation",
  },
  {
    from: "validated",
    to: "promoted",
    prerequisites: {
      min_confidence: 0.70,
      no_vetoes: true,
      no_critical_violations: true,
      dependency_completeness_min: 1.0,
      required_validators_passed: ["structure", "dependency_integrity", "scope_compliance", "interface_coverage", "rule_compliance", "test_mapping"],
    },
    description: "All gates pass — artifact is promoted to execution layer",
  },
  {
    from: "promoted",
    to: "execution_ready",
    prerequisites: {
      min_confidence: 0.65,
      no_vetoes: true,
      scope_drift_max: 0,
      human_approval_required: true,
    },
    description: "Human approves execution plan",
  },
  {
    from: "execution_ready",
    to: "executing",
    prerequisites: { dependency_completeness_min: 1.0 },
    description: "All dependencies met — execution begins",
  },
  {
    from: "executing",
    to: "executed",
    prerequisites: {},
    description: "Builder completed — awaiting verification",
  },
  {
    from: "executed",
    to: "verified",
    prerequisites: {
      no_vetoes: true,
      no_critical_violations: true,
      scope_drift_max: 0.1,
      required_validators_passed: ["structure", "scope_compliance", "test_mapping"],
    },
    description: "Post-build verification passed",
  },
  {
    from: "verified",
    to: "canonical",
    prerequisites: {
      min_confidence: 0.85,
      no_vetoes: true,
    },
    description: "Artifact promoted to canonical truth",
  },
  // Rejection transitions (from any validating state)
  { from: "derived", to: "rejected", prerequisites: {}, description: "Validation failed — rejected" },
  { from: "validated", to: "rejected", prerequisites: {}, description: "Promotion failed — rejected" },
  { from: "executed", to: "rejected", prerequisites: {}, description: "Verification failed — rejected" },
  // Archive
  { from: "canonical", to: "archived", prerequisites: {}, description: "Superseded by newer version" },
];

export function canTransition(
  from: ArtifactState,
  to: ArtifactState,
  context: {
    confidence?: number;
    confidence_dimensions?: Record<string, number>;
    vetoes_triggered?: boolean;
    critical_violations?: boolean;
    dependency_completeness?: number;
    scope_drift?: number;
    validators_passed?: string[];
    human_approved?: boolean;
  }
): { allowed: boolean; reason: string } {
  const rule = TRANSITION_RULES.find(r => r.from === from && r.to === to);
  if (!rule) return { allowed: false, reason: `No transition rule from ${from} to ${to}` };

  const p = rule.prerequisites;

  if (p.min_confidence !== undefined && (context.confidence ?? 0) < p.min_confidence)
    return { allowed: false, reason: `Confidence ${context.confidence} below minimum ${p.min_confidence}` };

  if (p.no_vetoes && context.vetoes_triggered)
    return { allowed: false, reason: "Active vetoes block this transition" };

  if (p.no_critical_violations && context.critical_violations)
    return { allowed: false, reason: "Critical violations block this transition" };

  if (p.dependency_completeness_min !== undefined && (context.dependency_completeness ?? 0) < p.dependency_completeness_min)
    return { allowed: false, reason: `Dependency completeness ${context.dependency_completeness} below ${p.dependency_completeness_min}` };

  if (p.scope_drift_max !== undefined && (context.scope_drift ?? 0) > p.scope_drift_max)
    return { allowed: false, reason: `Scope drift ${context.scope_drift} exceeds max ${p.scope_drift_max}` };

  if (p.required_validators_passed) {
    const passed = new Set(context.validators_passed || []);
    const missing = p.required_validators_passed.filter(v => !passed.has(v));
    if (missing.length > 0)
      return { allowed: false, reason: `Required validators not passed: ${missing.join(", ")}` };
  }

  if (p.human_approval_required && !context.human_approved)
    return { allowed: false, reason: "Human approval required for this transition" };

  return { allowed: true, reason: rule.description };
}
