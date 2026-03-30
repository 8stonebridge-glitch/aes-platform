import type { ArtifactState } from "./artifact-states.js";
export interface TransitionPrerequisite {
    min_confidence?: number;
    min_dimension?: {
        dimension: string;
        min: number;
    };
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
export declare const TRANSITION_RULES: TransitionRule[];
export declare function canTransition(from: ArtifactState, to: ArtifactState, context: {
    confidence?: number;
    confidence_dimensions?: Record<string, number>;
    vetoes_triggered?: boolean;
    critical_violations?: boolean;
    dependency_completeness?: number;
    scope_drift?: number;
    validators_passed?: string[];
    human_approved?: boolean;
}): {
    allowed: boolean;
    reason: string;
};
